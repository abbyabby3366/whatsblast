import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { initWhatsAppSession, getActiveSession } from '../services/baileysManager.js';
import fs from 'fs';
import path from 'path';

const router = Router();
const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions';

router.use(authenticateToken);

router.get('/whatsapp-sessions', async (req: AuthRequest, res: Response) => {
  const sessions = await WhatsAppSession.find({ user: req.user?._id }).sort({ createdAt: -1 });
  return res.json(sessions);
});

router.post('/whatsapp-sessions', async (req: AuthRequest, res: Response) => {
  const sessionId = req.body.session_id || `session_${Date.now()}`;
  const maxMessages = req.body.max_message_count_per_day || 50;

  let session = await WhatsAppSession.findOne({ session_id: sessionId });
  if (!session) {
    session = await WhatsAppSession.create({
      user: req.user?._id,
      session_id: sessionId,
      max_message_count_per_day: maxMessages,
      status: SessionStatus.STARTING,
    });
  }

  initWhatsAppSession(sessionId).catch(console.error);

  return res.status(201).json(session);
});

router.get('/whatsapp-sessions/:id/qr', async (req: AuthRequest, res: Response) => {
  const session = await WhatsAppSession.findOne({ session_id: req.params.id, user: req.user?._id });
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.status === SessionStatus.CONNECTED) {
    return res.json({ status: 'CONNECTED', message: 'WhatsApp is already connected' });
  }

  return res.json({
    status: session.status,
    qr_code: session.qr_code || null,
  });
});

router.post('/whatsapp-sessions/:id/reconnect', async (req: AuthRequest, res: Response) => {
  const session = await WhatsAppSession.findOne({ session_id: req.params.id, user: req.user?._id });
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.status = SessionStatus.STARTING;
  await session.save();

  initWhatsAppSession(session.session_id).catch(console.error);
  return res.json({ success: true, message: 'Reconnecting session...' });
});

router.post('/whatsapp-sessions/:id/logout', async (req: AuthRequest, res: Response) => {
  const session = await WhatsAppSession.findOne({ session_id: req.params.id, user: req.user?._id });
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const active = getActiveSession(session.session_id);
  if (active) {
    try {
      await active.socket.logout();
    } catch (_) {}
  }

  session.status = SessionStatus.DISCONNECTED;
  session.qr_code = '';
  await session.save();

  const folder = path.join(SESSIONS_DIR, session.session_id);
  if (fs.existsSync(folder)) {
    fs.rmSync(folder, { recursive: true, force: true });
  }

  return res.json({ success: true, message: 'Logged out successfully' });
});

router.delete('/whatsapp-sessions/:id', async (req: AuthRequest, res: Response) => {
  const session = await WhatsAppSession.findOne({ session_id: req.params.id, user: req.user?._id });
  if (session) {
    const folder = path.join(SESSIONS_DIR, session.session_id);
    if (fs.existsSync(folder)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
    await WhatsAppSession.deleteOne({ _id: session._id });
  }
  return res.json({ success: true });
});

export default router;
