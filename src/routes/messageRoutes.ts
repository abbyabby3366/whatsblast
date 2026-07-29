import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { getActiveSession, initWhatsAppSession, verifyAndFormatJid, pickUserSession } from '../services/baileysManager.js';
import { WhatsAppSession } from '../models/WhatsAppSession.js';
import { BlastCampaign } from '../models/BlastCampaign.js';
import { User } from '../models/User.js';
import { FileModel } from '../models/File.js';
import { retryCampaignRecipient } from './campaignRoutes.js';

const router = Router();

router.use(authenticateToken);

function formatMessage(m: any) {
  const obj = m.toObject ? m.toObject() : m;
  const { _id, __v, ...rest } = obj;
  const sessionPhone = typeof obj.session === 'object' && obj.session ? obj.session.phone_number : obj.sender_phone;
  const campaignName = typeof obj.campaign === 'object' && obj.campaign ? obj.campaign.name : null;
  const user = (typeof obj.campaign === 'object' && obj.campaign && obj.campaign.user)
    ? obj.campaign.user
    : (typeof obj.session === 'object' && obj.session && obj.session.user)
      ? obj.session.user
      : null;
  const isSentOrFailed = obj.status === MessageStatus.SENT || obj.status === MessageStatus.FAILED || obj.status === MessageStatus.DELIVERED || obj.status === MessageStatus.READ;

  return {
    id: _id ? _id.toString() : obj.id,
    created_at: obj.createdAt,
    scheduled_at: obj.scheduled_at || obj.createdAt,
    scheduled_datetime: obj.scheduled_at || obj.createdAt,
    sent_at: obj.sent_at || (isSentOrFailed ? obj.wa_timestamp || obj.updatedAt : null),
    session_phone: sessionPhone || obj.sender_phone || 'System',
    sender_phone: sessionPhone || obj.sender_phone || 'System',
    campaign_name: campaignName || obj.campaign_name || 'Direct / Quick Send',
    user: user,
    retry_count: obj.retry_count || 0,
    ...rest,
  };
}

const getMessages = async (req: AuthRequest, res: Response) => {
  const filter: any = {};
  const { status, session_id, campaign_id, user_id, merchant_id, user, direction, is_campaign, search, start_date, end_date, created_at_after, created_at_before } = req.query;

  if (req.user?.role !== 'admin') {
    const userSessions = await WhatsAppSession.find({ user: req.user?._id }).select('_id');
    const sessionIds = userSessions.map((s) => s._id);

    const userCampaigns = await BlastCampaign.find({ user: req.user?._id }).select('_id');
    const campaignIds = userCampaigns.map((c) => c._id);

    filter.$or = [
      { session: { $in: sessionIds } },
      { campaign: { $in: campaignIds } },
    ];
  } else {
    const targetUserId = user_id || merchant_id || (user && user !== 'ALL' && user !== 'all' ? user : undefined);
    if (targetUserId && targetUserId !== 'all') {
      const uSessions = await WhatsAppSession.find({ user: targetUserId }).select('_id');
      const uCampaigns = await BlastCampaign.find({ user: targetUserId }).select('_id');
      filter.$or = [
        { session: { $in: uSessions.map((s) => s._id) } },
        { campaign: { $in: uCampaigns.map((c) => c._id) } },
      ];
    }
  }

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
    const s = String(status).toLowerCase();
    if (s === 'sent') {
      filter.status = { $in: ['sent', 'delivered', 'read'] };
    } else {
      filter.status = s;
    }
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

      const matchingUsers = await User.find({
        $or: [{ phone_number: searchRegex }, { email: searchRegex }, { name: searchRegex }],
      }).select('_id');
      const matchingUserIds = matchingUsers.map((u) => u._id);

      const matchingSessions = await WhatsAppSession.find({
        $or: [{ phone_number: searchRegex }, { session_id: searchRegex }, { user: { $in: matchingUserIds } }],
      }).select('_id');
      const matchingSessionIds = matchingSessions.map((s) => s._id);

      const matchingCampaigns = await BlastCampaign.find({
        $or: [{ name: searchRegex }, { user: { $in: matchingUserIds } }],
      }).select('_id');
      const matchingCampaignIds = matchingCampaigns.map((c) => c._id);

      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { recipient_phone: searchRegex },
          { sender_phone: searchRegex },
          { to_jid: searchRegex },
          { 'content.text': searchRegex },
          { session: { $in: matchingSessionIds } },
          { campaign: { $in: matchingCampaignIds } },
        ],
      });
    }
  }

  const startDateVal = (start_date || created_at_after) as string | undefined;
  const endDateVal = (end_date || created_at_before) as string | undefined;

  if (startDateVal || endDateVal) {
    const dateCond: any = {};
    if (startDateVal) {
      const rawStart = startDateVal.trim();
      const startD = new Date(rawStart.includes('T') ? rawStart : `${rawStart}T00:00:00.000`);
      if (!isNaN(startD.getTime())) {
        dateCond.$gte = startD;
      }
    }
    if (endDateVal) {
      const rawEnd = endDateVal.trim();
      const endD = new Date(rawEnd.includes('T') ? rawEnd : `${rawEnd}T23:59:59.999`);
      if (!isNaN(endD.getTime())) {
        dateCond.$lte = endD;
      }
    }

    if (Object.keys(dateCond).length > 0) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { scheduled_at: dateCond },
          { sent_at: dateCond },
          { wa_timestamp: dateCond },
        ],
      });
    }
  }

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(req.query.page_size as string, 10) || 20));
  const skip = (page - 1) * pageSize;

  const [totalCount, messages] = await Promise.all([
    Message.countDocuments(filter),
    Message.find(filter)
      .populate({
        path: 'session',
        select: 'phone_number session_id user',
        populate: { path: 'user', select: 'phone_number role' },
      })
      .populate('template')
      .populate({
        path: 'campaign',
        select: 'name user templates template',
        populate: { path: 'user', select: 'phone_number role' },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize),
  ]);

  // Resolve file IDs in campaign templates to actual URLs (same logic as formatCampaign)
  const fileIdsToFetch = new Set<string>();
  for (const msg of messages) {
    const camp = msg.campaign as any;
    if (camp && Array.isArray(camp.templates)) {
      for (const tpl of camp.templates) {
        const fId = tpl.file_id || tpl.fileId || (typeof tpl.file === 'string' ? tpl.file : undefined);
        const bId = tpl.button_image_id || tpl.buttonImageId || (typeof tpl.button_image === 'string' ? tpl.button_image : undefined);
        if (typeof fId === 'string' && fId.match(/^[0-9a-fA-F]{24}$/)) fileIdsToFetch.add(fId);
        if (typeof bId === 'string' && bId.match(/^[0-9a-fA-F]{24}$/)) fileIdsToFetch.add(bId);
        const fIds = tpl.file_ids || tpl.fileIds;
        if (Array.isArray(fIds)) {
          fIds.forEach((id: any) => {
            const sId = typeof id === 'string' ? id : id?.id || id?._id;
            if (typeof sId === 'string' && sId.match(/^[0-9a-fA-F]{24}$/)) fileIdsToFetch.add(sId);
          });
        }
      }
    }
  }

  const filesMap = new Map<string, any>();
  if (fileIdsToFetch.size > 0) {
    try {
      const fileDocs = await FileModel.find({ _id: { $in: Array.from(fileIdsToFetch) } });
      fileDocs.forEach((fDoc) => {
        filesMap.set(fDoc._id.toString(), {
          id: fDoc._id.toString(),
          file_name: fDoc.file_name,
          file_type: fDoc.file_type,
          file_path: fDoc.file_path,
          file_url: fDoc.file_path,
        });
      });
    } catch (_) {}
  }

  if (filesMap.size > 0) {
    for (const msg of messages) {
      const camp = msg.campaign as any;
      if (camp && Array.isArray(camp.templates)) {
        camp.templates = camp.templates.map((tpl: any) => {
          const fId = tpl.file_id || tpl.fileId || (typeof tpl.file === 'string' ? tpl.file : undefined);
          const bId = tpl.button_image_id || tpl.buttonImageId || (typeof tpl.button_image === 'string' ? tpl.button_image : undefined);
          const fObj = typeof fId === 'string' ? filesMap.get(fId) : tpl.file;
          const bObj = typeof bId === 'string' ? filesMap.get(bId) : tpl.button_image;
          const fIds = tpl.file_ids || tpl.fileIds;
          const resolvedFilesList = Array.isArray(fIds) && fIds.length > 0
            ? fIds.map((id: any) => {
                const sId = typeof id === 'string' ? id : id?.id || id?._id;
                return filesMap.get(sId) || (typeof id === 'object' ? id : { id: sId });
              }).filter(Boolean)
            : (fObj ? [fObj] : []);

          return {
            ...tpl,
            file: fObj || (typeof tpl.file === 'object' ? tpl.file : undefined),
            file_url: tpl.file_url || fObj?.file_url || fObj?.file_path,
            files: resolvedFilesList,
            button_image: bObj || (typeof tpl.button_image === 'object' ? tpl.button_image : undefined),
          };
        });
      }
    }
  }

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

  let active = getActiveSession(sessionId);
  if (!active) {
    active = await initWhatsAppSession(sessionId);
  }

  const { jid: targetJid, exists, cleanPhone } = await verifyAndFormatJid(active.socket, to);
  if (!cleanPhone || !exists) {
    return res.status(400).json({ error: `Recipient phone number (${to}) is not registered on WhatsApp` });
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

  let active = getActiveSession(sessionId);
  if (!active) {
    active = await initWhatsAppSession(sessionId);
  }

  const { jid: targetJid, exists, cleanPhone } = await verifyAndFormatJid(active.socket, to);
  if (!cleanPhone || !exists) {
    return res.status(400).json({ error: `Recipient phone number (${to}) is not registered on WhatsApp` });
  }

  try {
    let targetUrl = url;
    const match = targetUrl.match(/^https?:\/\/([^/]+)\.linodeobjects\.com\/(.+)$/i);
    if (match) {
      const hostPrefix = match[1];
      const pathKey = match[2];
      if (hostPrefix.includes('.')) {
        const parts = hostPrefix.split('.');
        const endpoint = parts.pop();
        const bucket = parts.join('.');
        targetUrl = `https://${endpoint}.linodeobjects.com/${bucket}/${pathKey}`;
      }
    }

    const result = await active.socket.sendMessage(targetJid, {
      image: { url: targetUrl },
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

const clearMessages = async (req: AuthRequest, res: Response) => {
  try {
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

    const result = await Message.deleteMany(filter);
    return res.json({ success: true, message: `Successfully cleared ${result.deletedCount} messages`, deletedCount: result.deletedCount });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to clear messages' });
  }
};

const retryMessage = async (req: AuthRequest, res: Response) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const recipientPhone = msg.recipient_phone || (msg.to_jid ? msg.to_jid.split('@')[0] : null);
    if (!recipientPhone) {
      return res.status(400).json({ error: 'Message has no recipient phone number' });
    }

    if (msg.campaign) {
      req.params.id = msg.campaign.toString();
      req.body = { ...req.body, phone: recipientPhone };
      return retryCampaignRecipient(req, res);
    }

    // Direct message retry
    let sessionId: string;
    if (msg.session) {
      const sDoc = await WhatsAppSession.findById(msg.session);
      sessionId = sDoc?.session_id || await pickUserSession(req.user?._id?.toString() || '');
    } else {
      sessionId = await pickUserSession(req.user?._id?.toString() || '');
    }

    let activeSession = getActiveSession(sessionId);
    if (!activeSession) {
      activeSession = await initWhatsAppSession(sessionId);
    }

    const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
    const targetJid = `${cleanPhone}@s.whatsapp.net`;

    const textContent = msg.content?.text || msg.content?.caption || 'Hello';
    const result = await activeSession.socket.sendMessage(targetJid, { text: textContent });

    msg.status = MessageStatus.SENT;
    msg.sent_at = new Date();
    msg.wa_timestamp = new Date();
    msg.message_id = result?.key?.id || msg.message_id;
    msg.error = undefined;
    msg.retry_count = (msg.retry_count || 0) + 1;
    await msg.save();

    return res.json({ success: true, message: `Successfully retried message to ${cleanPhone}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retry message' });
  }
};

router.post('/messages/:id/retry', retryMessage);
router.delete('/messages', clearMessages);
router.delete('/messages/clear-all', clearMessages);

export default router;
