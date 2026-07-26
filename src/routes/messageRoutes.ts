import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { getActiveSession, initWhatsAppSession } from '../services/baileysManager.js';
import { WhatsAppSession } from '../models/WhatsAppSession.js';
import { BlastCampaign } from '../models/BlastCampaign.js';

const router = Router();

router.use(authenticateToken);

function formatMessage(m: any) {
  const obj = m.toObject ? m.toObject() : m;
  const { _id, __v, ...rest } = obj;
  const sessionPhone = typeof obj.session === 'object' && obj.session ? obj.session.phone_number : obj.sender_phone;
  const campaignName = typeof obj.campaign === 'object' && obj.campaign ? obj.campaign.name : null;
  return {
    id: _id ? _id.toString() : obj.id,
    created_at: obj.createdAt,
    session_phone: sessionPhone || obj.sender_phone || 'System',
    sender_phone: sessionPhone || obj.sender_phone || 'System',
    campaign_name: campaignName || obj.campaign_name || 'Direct / Quick Send',
    ...rest,
  };
}

const getMessages = async (req: AuthRequest, res: Response) => {
  const userSessions = await WhatsAppSession.find({ user: req.user?._id }).select('_id');
  const sessionIds = userSessions.map((s) => s._id);

  const userCampaigns = await BlastCampaign.find({ user: req.user?._id }).select('_id');
  const campaignIds = userCampaigns.map((c) => c._id);

  const filter: any = {
    $or: [
      { session: { $in: sessionIds } },
      { campaign: { $in: campaignIds } },
    ],
  };

  const { status, session_id, campaign_id, direction, is_campaign, search, start_date, end_date } = req.query;

  if (campaign_id && campaign_id !== 'all') {
    filter.campaign = campaign_id;
  }

  if (direction) {
    const dStr = String(direction).toLowerCase().replace('_', '');
    if (dStr === 'outbound') filter.direction = MessageDirection.OUTBOUND;
    else if (dStr === 'inbound') filter.direction = MessageDirection.INBOUND;
  }

  if (is_campaign === 'true') {
    filter.campaign = { $exists: true, $ne: null };
  }

  if (status && status !== 'all' && status !== 'ALL') {
    filter.status = String(status).toLowerCase();
  }

  if (session_id && session_id !== 'all') {
    const sDoc = await WhatsAppSession.findOne({ session_id });
    if (sDoc) {
      filter.session = sDoc._id;
    }
  }

  if (search) {
    const searchStr = String(search).trim();
    if (searchStr) {
      const searchRegex = new RegExp(searchStr, 'i');
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { recipient_phone: searchRegex },
          { sender_phone: searchRegex },
          { to_jid: searchRegex },
          { 'content.text': searchRegex },
        ],
      });
    }
  }

  if (start_date || end_date) {
    filter.createdAt = {};
    if (start_date) filter.createdAt.$gte = new Date(start_date as string);
    if (end_date) filter.createdAt.$lte = new Date(end_date as string);
  }

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(req.query.page_size as string, 10) || 20));
  const skip = (page - 1) * pageSize;

  const [totalCount, messages] = await Promise.all([
    Message.countDocuments(filter),
    Message.find(filter)
      .populate('session', 'phone_number session_id')
      .populate('template', 'text name')
      .populate('campaign', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize),
  ]);

  const formattedMessages = messages.map(formatMessage);

  return res.json({
    count: totalCount,
    results: formattedMessages,
  });
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
