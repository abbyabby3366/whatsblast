import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { getActiveSession, initWhatsAppSession } from '../services/baileysManager.js';
import { WhatsAppSession } from '../models/WhatsAppSession.js';

const router = Router();

router.use(authenticateToken);

router.get('/messages', async (req: AuthRequest, res: Response) => {
  const userSessions = await WhatsAppSession.find({ user: req.user?._id }).select('_id');
  const sessionIds = userSessions.map((s) => s._id);

  const messages = await Message.find({ session: { $in: sessionIds } })
    .sort({ createdAt: -1 })
    .limit(100);

  return res.json(messages);
});

router.post('/messages/:session_id/send-text', async (req: AuthRequest, res: Response) => {
  const sessionId = req.params.session_id as string;
  const { to, text } = req.body;

  if (!to || !text) {
    return res.status(400).json({ error: 'to and text fields are required' });
  }

  const cleanPhone = to.replace(/[^0-9]/g, '');
  const targetJid = `${cleanPhone}@s.whatsapp.net`;

  let active = getActiveSession(sessionId);
  if (!active) {
    active = await initWhatsAppSession(sessionId);
  }

  try {
    const result = await active.socket.sendMessage(targetJid, { text });
    const sessionDoc = await WhatsAppSession.findOne({ session_id: sessionId });

    const msg = await Message.create({
      session: sessionDoc?._id,
      direction: MessageDirection.OUTBOUND,
      type: 'text',
      status: MessageStatus.SENT,
      recipient_phone: cleanPhone,
      to_jid: targetJid,
      content: { text },
      message_id: result?.key?.id || '',
      wa_timestamp: new Date(),
    });

    return res.json({ success: true, message: msg });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to send WhatsApp text message' });
  }
});

router.post('/messages/:session_id/send-image', async (req: AuthRequest, res: Response) => {
  const sessionId = req.params.session_id as string;
  const { to, url, caption } = req.body;

  if (!to || !url) {
    return res.status(400).json({ error: 'to and url fields are required' });
  }

  const cleanPhone = to.replace(/[^0-9]/g, '');
  const targetJid = `${cleanPhone}@s.whatsapp.net`;

  let active = getActiveSession(sessionId);
  if (!active) {
    active = await initWhatsAppSession(sessionId);
  }

  try {
    const result = await active.socket.sendMessage(targetJid, {
      image: { url },
      caption: caption || '',
    });
    const sessionDoc = await WhatsAppSession.findOne({ session_id: sessionId });

    const msg = await Message.create({
      session: sessionDoc?._id,
      direction: MessageDirection.OUTBOUND,
      type: 'image',
      status: MessageStatus.SENT,
      recipient_phone: cleanPhone,
      to_jid: targetJid,
      content: { url, caption },
      message_id: result?.key?.id || '',
      wa_timestamp: new Date(),
    });

    return res.json({ success: true, message: msg });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to send WhatsApp image' });
  }
});

export default router;
