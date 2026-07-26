import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { getActiveSession, initWhatsAppSession } from '../services/baileysManager.js';
import { WhatsAppSession } from '../models/WhatsAppSession.js';

const router = Router();

router.use(authenticateToken);

function formatMessage(m: any) {
  const obj = m.toObject ? m.toObject() : m;
  const { _id, __v, ...rest } = obj;
  return {
    id: _id ? _id.toString() : obj.id,
    created_at: obj.createdAt,
    ...rest,
  };
}

const getMessages = async (req: AuthRequest, res: Response) => {
  const userSessions = await WhatsAppSession.find({ user: req.user?._id }).select('_id');
  const sessionIds = userSessions.map((s) => s._id);

  const filter: any = { session: { $in: sessionIds } };
  const { status, session_id } = req.query;

  if (status && status !== 'all') {
    filter.status = status;
  }
  if (session_id && session_id !== 'all') {
    const sDoc = await WhatsAppSession.findOne({ session_id });
    if (sDoc) filter.session = sDoc._id;
  }

  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(100);

  return res.json(messages.map(formatMessage));
};

router.get('/messages', getMessages);

const sendTextMessage = async (req: AuthRequest, res: Response) => {
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

    return res.json({ success: true, message: formatMessage(msg) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to send WhatsApp text message' });
  }
};

router.post('/messages/:session_id/send-text', sendTextMessage);

const sendImageMessage = async (req: AuthRequest, res: Response) => {
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

    return res.json({ success: true, message: formatMessage(msg) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to send WhatsApp image' });
  }
};

router.post('/messages/:session_id/send-image', sendImageMessage);

export default router;
