import mongoose from 'mongoose';
import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { getActiveSession, initWhatsAppSession, verifyAndFormatJid, pickUserSession } from '../services/baileysManager.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { User } from '../models/User.js';
import { FileModel } from '../models/File.js';
import { retryCampaignRecipient, executeCampaignRetryFailed } from './campaignRoutes.js';
import { findNextAvailableSlotsForSession } from '../services/scheduleSlotFinder.js';
import { applyMessageStatusFilter, escapeRegex } from '../utils/messageFilterHelper.js';
import { isOwnS3Url } from '../services/s3Service.js';
import net from 'net';

const router = Router();
router.use(authenticateToken);

function isAdminRequest(req: AuthRequest): boolean {
  return req.user?.role === 'admin';
}

function sameId(a: any, b: any): boolean {
  if (!a || !b) return false;
  const aId = typeof a === 'object' && a._id ? a._id : a;
  const bId = typeof b === 'object' && b._id ? b._id : b;
  return String(aId) === String(bId);
}

/** Query-string value as a plain string (first element if repeated), or undefined. */
function queryString(v: any): string | undefined {
  if (Array.isArray(v)) v = v[0];
  if (v === undefined || v === null || typeof v === 'object') return undefined;
  return String(v);
}

function isBlockedIPv4(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/**
 * SSRF guard for media URLs that Baileys will fetch server-side: only http(s), no
 * localhost / private / link-local IP literals. Our own S3 bucket is always allowed.
 * Note: hostnames are not DNS-resolved, so a public name pointing at a private IP is not caught.
 */
function isSafeRemoteMediaUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (isOwnS3Url(rawUrl)) return true;
  if (parsed.username || parsed.password) return false;

  let host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (!host) return false;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    return false;
  }
  if (net.isIPv4(host)) return !isBlockedIPv4(host);
  if (net.isIPv6(host)) {
    if (host === '::' || host === '::1') return false;
    if (/^f[cd]/.test(host)) return false; // unique local fc00::/7
    if (/^fe[89ab]/.test(host)) return false; // link-local fe80::/10
    if (host.startsWith('::ffff:') || host.startsWith('64:ff9b:')) return false; // IPv4-mapped / NAT64
    return true;
  }
  return true;
}

function formatMessage(m: any) {
  const obj = m.toObject ? m.toObject() : m;
  const { _id, __v, ...rest } = obj;
  const sessionPhone = typeof obj.session === 'object' && obj.session ? obj.session.phone_number : obj.sender_phone;
  const campaignObj = typeof obj.campaign === 'object' && obj.campaign ? obj.campaign : null;
  const campaignName = campaignObj ? campaignObj.name : null;
  const user = (campaignObj && campaignObj.user)
    ? campaignObj.user
    : (typeof obj.session === 'object' && obj.session && obj.session.user)
      ? obj.session.user
      : null;
  const rawStatus = (obj.status || '').toLowerCase();
  const isSent = rawStatus === 'sent' || rawStatus === 'delivered' || rawStatus === 'read';
  const isFailed = rawStatus === 'failed';
  const isPendingOrQueued = rawStatus === 'pending' || rawStatus === 'queued';
  const targetScheduled = obj.scheduled_at || obj.createdAt;
  const campStatus = (campaignObj?.status || '').toLowerCase();
  const isCampaignPaused = campStatus === 'paused';

  // 2-minute grace window past scheduled time before marking unsent messages as expired
  const EXPIRED_GRACE_MS = 2 * 60 * 1000;
  const isPastGrace =
    isPendingOrQueued &&
    targetScheduled &&
    new Date(targetScheduled).getTime() + EXPIRED_GRACE_MS < Date.now();

  const isExpired = rawStatus === 'expired' || isPastGrace;
  const computedStatus = isExpired
    ? 'expired'
    : (isCampaignPaused && isPendingOrQueued ? 'paused' : rawStatus || MessageStatus.PENDING);
  const isSentOrFailed = isSent || isFailed;
  const validWaTimestamp = obj.wa_timestamp && new Date(obj.wa_timestamp).getFullYear() > 2000 ? obj.wa_timestamp : null;

  return {
    id: _id ? _id.toString() : obj.id,
    created_at: obj.createdAt,
    scheduled_at: obj.scheduled_at || obj.createdAt,
    scheduled_datetime: obj.scheduled_at || obj.createdAt,
    sent_at: obj.sent_at || (isSentOrFailed ? validWaTimestamp || obj.createdAt || obj.updatedAt : null),
    session_phone: sessionPhone || obj.sender_phone || 'System',
    sender_phone: sessionPhone || obj.sender_phone || 'System',
    campaign_name: campaignName || obj.campaign_name || 'Direct / Quick Send',
    user: user,
    retry_count: obj.retry_count || 0,
    ...rest,
    status: computedStatus,
  };
}

const getMessages = async (req: AuthRequest, res: Response) => {
  const filter: any = {};
  const { direction, is_campaign } = req.query;
  const status = queryString(req.query.status);
  const session_id = queryString(req.query.session_id);
  const campaign_id = queryString(req.query.campaign_id);
  const user_id = queryString(req.query.user_id);
  const merchant_id = queryString(req.query.merchant_id);
  const user = queryString(req.query.user);
  const search = queryString(req.query.search);
  const start_date = queryString(req.query.start_date);
  const end_date = queryString(req.query.end_date);
  const created_at_after = queryString(req.query.created_at_after);
  const created_at_before = queryString(req.query.created_at_before);

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

  if (is_campaign === 'true' && !filter.campaign) {
    filter.campaign = { $exists: true, $ne: null };
  }

  await applyMessageStatusFilter(filter, status);

  if (session_id && session_id !== 'all') {
    const sDoc = await WhatsAppSession.findOne({ session_id });
    if (sDoc) {
      filter.session = sDoc._id;
    }
  }

  if (search) {
    const searchStr = String(search).trim();
    if (searchStr) {
      const searchRegex = new RegExp(escapeRegex(searchStr), 'i');

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

  const startDateVal = start_date || created_at_after;
  const endDateVal = end_date || created_at_before;

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
  const pageSize = Math.max(1, Math.min(10000, parseInt(req.query.page_size as string, 10) || 20));
  const skip = (page - 1) * pageSize;

  const sortBy = String(req.query.sort_by || req.query.sort || req.query.orderBy || '').trim();
  const sortDir: 1 | -1 = String(req.query.order || req.query.order_direction || req.query.sort_direction || 'desc').toLowerCase() === 'asc' ? 1 : -1;

  const isTimeSort = sortBy === 'scheduled_at' || sortBy === 'scheduled_send_time' || sortBy === 'scheduled_datetime' || sortBy === 'sent_at';

  let sortQuery: Record<string, 1 | -1> = { createdAt: -1 };
  if (sortBy === 'created_at' || sortBy === 'createdAt') {
    sortQuery = { createdAt: sortDir };
  } else if (sortBy === 'recipient_phone') {
    sortQuery = { recipient_phone: sortDir };
  } else if (sortBy === 'sender_phone') {
    sortQuery = { sender_phone: sortDir };
  } else if (sortBy === 'status') {
    sortQuery = { status: sortDir, scheduled_at: sortDir };
  } else if (sortBy && !isTimeSort) {
    sortQuery = { [sortBy]: sortDir };
  }

  let totalCount = 0;
  let messages: any[] = [];

  if (isTimeSort) {
    const aggFilter = { ...filter };
    if (typeof aggFilter.campaign === 'string' && mongoose.Types.ObjectId.isValid(aggFilter.campaign)) {
      aggFilter.campaign = new mongoose.Types.ObjectId(aggFilter.campaign);
    }
    if (typeof aggFilter.session === 'string' && mongoose.Types.ObjectId.isValid(aggFilter.session)) {
      aggFilter.session = new mongoose.Types.ObjectId(aggFilter.session);
    }

    const [cResult, aggDocs] = await Promise.all([
      Message.countDocuments(filter),
      Message.aggregate([
        { $match: aggFilter },
        {
          $addFields: {
            effective_time: {
              $cond: {
                if: {
                  $in: [
                    { $toLower: { $ifNull: ['$status', 'pending'] } },
                    ['sent', 'delivered', 'read'],
                  ],
                },
                then: {
                  $ifNull: ['$sent_at', { $ifNull: ['$scheduled_at', '$createdAt'] }],
                },
                else: {
                  $ifNull: ['$scheduled_at', '$createdAt'],
                },
              },
            },
          },
        },
        { $sort: { effective_time: sortDir, createdAt: sortDir, _id: sortDir } },
        { $skip: skip },
        { $limit: pageSize },
      ]),
    ]);

    totalCount = cResult;
    messages = await Message.populate(aggDocs, [
      {
        path: 'session',
        select: 'phone_number session_id user',
        populate: { path: 'user', select: 'phone_number role' },
      },
      { path: 'template' },
      {
        path: 'campaign',
        select: 'name user templates template status',
        populate: { path: 'user', select: 'phone_number role' },
      },
    ]);
  } else {
    const [cResult, mDocs] = await Promise.all([
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
          select: 'name user templates template status',
          populate: { path: 'user', select: 'phone_number role' },
        })
        .sort(sortQuery)
        .skip(skip)
        .limit(pageSize),
    ]);
    totalCount = cResult;
    messages = mDocs;
  }

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

  // Deduplicate multi-content campaign messages: keep only the latest per (campaign, recipient_phone)
  const seen = new Set<string>();
  const deduped = messages.filter((msg: any) => {
    const camp = msg.campaign as any;
    if (!camp || !camp._id) return true; // non-campaign messages always pass through
    const key = `${camp._id.toString()}-${msg.recipient_phone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const dedupedCount = messages.length - deduped.length;

  const formattedMessages = deduped.map(formatMessage);

  return res.json({
    count: Math.max(0, totalCount - dedupedCount),
    results: formattedMessages,
  });
};

router.get('/messages', getMessages);

/**
 * Loads a WhatsApp session by its session_id and checks the caller may send from it.
 * Sends the 404/403 response itself and returns null when not allowed.
 */
async function loadSendableSession(req: AuthRequest, res: Response, sessionId: string) {
  const sessionDoc = await WhatsAppSession.findOne({ session_id: sessionId });
  if (!sessionDoc) {
    res.status(404).json({ error: 'WhatsApp session not found' });
    return null;
  }
  if (!isAdminRequest(req) && !sameId(sessionDoc.user, req.user?._id)) {
    res.status(403).json({ error: 'You do not have access to this WhatsApp session' });
    return null;
  }
  return sessionDoc;
}

const sendTextMessage = async (req: AuthRequest, res: Response) => {
  const sessionId = String(req.params.session_id);
  const { to, text } = req.body;

  if (!to || !text) {
    return res.status(400).json({ error: 'to and text fields are required' });
  }
  if ((typeof to !== 'string' && typeof to !== 'number') || typeof text !== 'string') {
    return res.status(400).json({ error: 'to and text must be strings' });
  }

  const sessionDoc = await loadSendableSession(req, res, sessionId);
  if (!sessionDoc) return;

  try {
    let active = getActiveSession(sessionId);
    if (!active) {
      active = await initWhatsAppSession(sessionId);
    }

    const { jid: targetJid, exists, cleanPhone } = await verifyAndFormatJid(active.socket, String(to));
    if (!cleanPhone || !exists) {
      return res.status(400).json({ error: `Recipient phone number (${to}) is not registered on WhatsApp` });
    }

    const result = await active.socket.sendMessage(targetJid, { text });

    const now = new Date();
    const msg = await Message.create({
      session: sessionDoc._id,
      direction: MessageDirection.OUTBOUND,
      type: 'text',
      status: MessageStatus.SENT,
      recipient_phone: cleanPhone,
      to_jid: targetJid,
      content: { text },
      message_id: result?.key?.id || '',
      scheduled_at: now,
      sent_at: now,
      wa_timestamp: now,
    });

    return res.json({ success: true, message: formatMessage(msg) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to send WhatsApp text message' });
  }
};

router.post('/messages/:session_id/send-text', sendTextMessage);

const sendImageMessage = async (req: AuthRequest, res: Response) => {
  const sessionId = String(req.params.session_id);
  const { to, url } = req.body;
  const caption = req.body.caption != null ? String(req.body.caption) : '';

  if (!to || !url) {
    return res.status(400).json({ error: 'to and url fields are required' });
  }
  if ((typeof to !== 'string' && typeof to !== 'number') || typeof url !== 'string') {
    return res.status(400).json({ error: 'to and url must be strings' });
  }

  let targetUrl = url.trim();
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
  if (!isSafeRemoteMediaUrl(targetUrl)) {
    return res.status(400).json({ error: 'url must be a public http(s) URL' });
  }

  const sessionDoc = await loadSendableSession(req, res, sessionId);
  if (!sessionDoc) return;

  try {
    let active = getActiveSession(sessionId);
    if (!active) {
      active = await initWhatsAppSession(sessionId);
    }

    const { jid: targetJid, exists, cleanPhone } = await verifyAndFormatJid(active.socket, String(to));
    if (!cleanPhone || !exists) {
      return res.status(400).json({ error: `Recipient phone number (${to}) is not registered on WhatsApp` });
    }

    const result = await active.socket.sendMessage(targetJid, {
      image: { url: targetUrl },
      caption,
    });

    const now = new Date();
    const msg = await Message.create({
      session: sessionDoc._id,
      direction: MessageDirection.OUTBOUND,
      type: 'image',
      status: MessageStatus.SENT,
      recipient_phone: cleanPhone,
      to_jid: targetJid,
      content: { url, caption },
      message_id: result?.key?.id || '',
      scheduled_at: now,
      sent_at: now,
      wa_timestamp: now,
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
    const msg = await Message.findById(String(req.params.id));
    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Non-admins may only retry messages from their own session or campaign.
    if (!isAdminRequest(req)) {
      const [ownsSession, ownsCampaign] = await Promise.all([
        msg.session ? WhatsAppSession.exists({ _id: msg.session, user: req.user?._id }) : null,
        msg.campaign ? BlastCampaign.exists({ _id: msg.campaign, user: req.user?._id }) : null,
      ]);
      if (!ownsSession && !ownsCampaign) {
        return res.status(404).json({ error: 'Message not found' });
      }
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

    const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
    const targetJid = `${cleanPhone}@s.whatsapp.net`;

    let sessionId: string | null = null;
    try {
      const requestedSessionId = req.body?.sessionId != null ? String(req.body.sessionId) : '';
      if (requestedSessionId && requestedSessionId !== 'original' && requestedSessionId !== 'random') {
        const customSession = await WhatsAppSession.findOne({
          user: req.user?._id,
          $or: [
            { session_id: requestedSessionId },
            ...(mongoose.Types.ObjectId.isValid(requestedSessionId) ? [{ _id: requestedSessionId }] : []),
          ],
        });
        if (customSession) sessionId = customSession.session_id;
      }
      if (!sessionId) {
        if (msg.session && req.body?.sessionId !== 'random') {
          const sDoc = await WhatsAppSession.findById(msg.session);
          sessionId = sDoc?.session_id || (await pickUserSession(req.user?._id?.toString() || ''));
        } else {
          sessionId = await pickUserSession(req.user?._id?.toString() || '');
        }
      }
    } catch (_) {}

    if (!sessionId) {
      msg.status = MessageStatus.PENDING;
      msg.scheduled_at = new Date();
      msg.error = undefined;
      msg.retry_count = (msg.retry_count || 0) + 1;
      await msg.save();
      return res.json({ success: true, message: `Message rescheduled for ${cleanPhone}. Will send when WhatsApp connects.` });
    }

    let activeSession = getActiveSession(sessionId);
    if (!activeSession) {
      try { activeSession = await initWhatsAppSession(sessionId); } catch (_) {}
    }

    if (!activeSession?.socket) {
      msg.status = MessageStatus.PENDING;
      const sDoc = sessionId ? await WhatsAppSession.findOne({ session_id: sessionId }) : null;
      const [scheduledTime = new Date()] = await findNextAvailableSlotsForSession({
        sessionDoc: sDoc,
        count: 1,
        excludePhones: [cleanPhone],
      });
      msg.scheduled_at = scheduledTime;
      msg.retry_count = (msg.retry_count || 0) + 1;
      await msg.save();
      return res.json({ success: true, message: `Message rescheduled for ${cleanPhone}.` });
    }

    const textContent = msg.content?.text || msg.content?.caption || 'Hello';
    const result = await activeSession.socket.sendMessage(targetJid, { text: textContent });

    msg.status = MessageStatus.SENT;
    msg.sent_at = new Date();
    msg.wa_timestamp = new Date();
    msg.scheduled_at = new Date();
    msg.message_id = result?.key?.id || msg.message_id;
    msg.error = undefined;
    msg.retry_count = (msg.retry_count || 0) + 1;
    await msg.save();

    return res.json({ success: true, message: `Successfully retried message to ${cleanPhone}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retry message' });
  }
};

const RETRY_ALL_BATCH_SIZE = 200;

const retryAllFailed = async (req: AuthRequest, res: Response) => {
  try {
    const isAdminUser = isAdminRequest(req);
    const EXPIRED_GRACE_MS = 2 * 60 * 1000;
    const cutoff = new Date(Date.now() - EXPIRED_GRACE_MS);
    const statusOrCond = [
      { status: { $in: [MessageStatus.FAILED, 'failed', 'FAILED', 'error', 'ERROR'] } },
      { status: { $in: [MessageStatus.EXPIRED, 'expired', 'EXPIRED'] } },
      {
        status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED, 'pending', 'queued', 'PENDING', 'QUEUED'] },
        $or: [
          { scheduled_at: { $lt: cutoff } },
          { scheduled_at: null, createdAt: { $lt: cutoff } },
          { scheduled_at: { $exists: false }, createdAt: { $lt: cutoff } },
        ],
      },
    ];
    const filter: any = {
      $or: statusOrCond,
      status: { $nin: ['sent', 'delivered', 'read', 'SENT', 'DELIVERED', 'READ', MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ] },
    };

    // Merchant filter is only honoured for admins; merchants are always scoped to themselves.
    let targetUserId: string | undefined;
    if (!isAdminUser) {
      targetUserId = req.user?._id?.toString();
    } else {
      const user = queryString(req.query.user);
      const requestedUser = queryString(req.query.user_id) || queryString(req.query.merchant_id) || (user && user !== 'ALL' && user !== 'all' ? user : undefined);
      if (requestedUser && requestedUser !== 'all') {
        if (!mongoose.Types.ObjectId.isValid(requestedUser)) {
          return res.status(400).json({ error: 'Invalid user id' });
        }
        targetUserId = requestedUser;
      }
    }

    if (targetUserId) {
      const uSessions = await WhatsAppSession.find({ user: targetUserId }).select('_id').lean();
      const uCampaigns = await BlastCampaign.find({ user: targetUserId }).select('_id').lean();
      filter.$and = [
        { $or: statusOrCond },
        { $or: [{ session: { $in: uSessions.map((s) => s._id) } }, { campaign: { $in: uCampaigns.map((c) => c._id) } }] },
      ];
      delete filter.$or;
    }

    const totalFailed = await Message.countDocuments(filter);
    if (totalFailed === 0) {
      return res.json({ success: true, count: 0, message: 'No failed messages found to retry' });
    }

    // Resolve the requested sender session ('random' / 'original' are modes, anything else is a session).
    const rawRequested = req.body?.sessionId;
    const requestedSessionId: string | undefined =
      rawRequested !== undefined && rawRequested !== null && rawRequested !== '' ? String(rawRequested) : undefined;
    let requestedSessionDoc: any = null;
    if (requestedSessionId && requestedSessionId !== 'random' && requestedSessionId !== 'original') {
      requestedSessionDoc = await WhatsAppSession.findOne({
        $or: [
          { session_id: requestedSessionId },
          ...(mongoose.Types.ObjectId.isValid(requestedSessionId) ? [{ _id: requestedSessionId }] : []),
        ],
      });
      if (!requestedSessionDoc) {
        return res.status(404).json({ error: 'Selected WhatsApp session not found' });
      }
      if (!isAdminUser && !sameId(requestedSessionDoc.user, req.user?._id)) {
        return res.status(403).json({ error: 'You do not have access to this WhatsApp session' });
      }
    }

    // --- Campaign messages: delegate per campaign. A specific requested session is only passed
    // through for campaigns owned by that session's owner (never route merchant A's retries via B).
    const rawCampaignIds = await Message.distinct('campaign', filter);
    const campaignIds = rawCampaignIds.filter(Boolean);
    const campaignOwners = new Map<string, string>();
    if (campaignIds.length > 0) {
      const campDocs = await BlastCampaign.find({ _id: { $in: campaignIds } }).select('_id user').lean();
      for (const c of campDocs) campaignOwners.set(String(c._id), c.user ? String(c.user) : '');
    }

    let retriedCount = 0;
    let retriedCampaignsCount = 0;
    for (const rawId of campaignIds) {
      const cId = String(rawId);
      let campaignSessionArg: string | undefined = requestedSessionId;
      if (requestedSessionDoc) {
        campaignSessionArg = sameId(requestedSessionDoc.user, campaignOwners.get(cId)) ? requestedSessionId : undefined;
      }
      const campRes = await executeCampaignRetryFailed(cId, campaignSessionArg);
      if (campRes.success && campRes.count > 0) {
        retriedCount += campRes.count;
        retriedCampaignsCount += 1;
      }
    }

    // --- Non-campaign messages: processed in _id-ordered batches (never all in memory).
    const connectedSessionsForNonCampaign: any[] = await WhatsAppSession.find(
      targetUserId ? { user: targetUserId, status: SessionStatus.CONNECTED } : { status: SessionStatus.CONNECTED }
    );
    const hasAnyConnectedSession = connectedSessionsForNonCampaign.length > 0;

    const sessionInfoCache = new Map<string, { session_id: string; user?: any } | null>();
    const getSessionInfo = async (sessionObjId: any) => {
      const key = String(sessionObjId);
      if (!sessionInfoCache.has(key)) {
        const sDoc = await WhatsAppSession.findById(sessionObjId).select('session_id user').lean();
        sessionInfoCache.set(key, sDoc ? { session_id: sDoc.session_id, user: sDoc.user } : null);
      }
      return sessionInfoCache.get(key) || null;
    };

    const nonCampaignFilter = { $and: [filter, { campaign: null }] };
    let lastId: any = null;
    let index = 0;
    for (;;) {
      const batch: any[] = await Message.find(lastId ? { $and: [nonCampaignFilter, { _id: { $gt: lastId } }] } : nonCampaignFilter)
        .sort({ _id: 1 })
        .limit(RETRY_ALL_BATCH_SIZE)
        .lean();
      if (batch.length === 0) break;
      lastId = batch[batch.length - 1]._id;

      for (const msg of batch) {
        const i = index++;
        const recipientPhone = msg.recipient_phone || (msg.to_jid ? msg.to_jid.split('@')[0] : null);
        if (!recipientPhone) continue;

        try {
          const originalSession = msg.session ? await getSessionInfo(msg.session) : null;
          const ownerId: string | undefined = originalSession?.user ? String(originalSession.user) : undefined;

          let sessionId: string | null = null;
          if (requestedSessionId === 'random') {
            // Only rotate across connected sessions belonging to the message's owner.
            const candidates = ownerId
              ? connectedSessionsForNonCampaign.filter((s) => sameId(s.user, ownerId))
              : [];
            if (candidates.length > 0) {
              sessionId = candidates[i % candidates.length].session_id;
            }
          } else if (requestedSessionDoc && ownerId && sameId(requestedSessionDoc.user, ownerId)) {
            sessionId = requestedSessionDoc.session_id;
          }

          if (!sessionId) {
            sessionId = originalSession?.session_id || (await pickUserSession(ownerId || req.user?._id?.toString() || ''));
          }
          let activeSession = sessionId ? getActiveSession(sessionId) : null;
          if (!activeSession && sessionId) {
            try { activeSession = await initWhatsAppSession(sessionId); } catch (_) {}
          }

          const cleanPhone = String(recipientPhone).replace(/[^0-9]/g, '');
          const targetJid = `${cleanPhone}@s.whatsapp.net`;
          const textContent = msg.content?.text || msg.content?.caption || 'Hello';

          if (activeSession?.socket) {
            const result = await activeSession.socket.sendMessage(targetJid, { text: textContent });
            const now = new Date();
            await Message.updateOne(
              { _id: msg._id },
              {
                $set: {
                  status: MessageStatus.SENT,
                  sent_at: now,
                  wa_timestamp: now,
                  message_id: result?.key?.id || msg.message_id,
                },
                $unset: { error: 1 },
                $inc: { retry_count: 1 },
              }
            );
          } else {
            const targetDoc = sessionId ? connectedSessionsForNonCampaign.find((s) => s.session_id === sessionId) : null;
            const [scheduledTime = new Date()] = await findNextAvailableSlotsForSession({
              sessionDoc: targetDoc,
              count: 1,
              excludePhones: [cleanPhone],
            });
            await Message.updateOne(
              { _id: msg._id },
              {
                $set: { status: MessageStatus.PENDING, scheduled_at: scheduledTime },
                $unset: { error: 1 },
                $inc: { retry_count: 1 },
              }
            );
          }
          retriedCount += 1;
        } catch (err: any) {
          await Message.updateOne(
            { _id: msg._id },
            { $set: { status: MessageStatus.PENDING }, $inc: { retry_count: 1 } }
          );
          retriedCount += 1;
        }
      }
    }

    const warningText = !hasAnyConnectedSession
      ? ' (Note: No connected WhatsApp session found. Messages will send once WhatsApp connects.)'
      : '';

    return res.json({
      success: true,
      count: retriedCount || totalFailed,
      campaignsCount: retriedCampaignsCount,
      warning: !hasAnyConnectedSession ? 'No connected WhatsApp session found' : undefined,
      message: `Successfully queued retry for ${retriedCount || totalFailed} failed/expired message(s)${retriedCampaignsCount > 0 ? ` across ${retriedCampaignsCount} campaign(s)` : ''}${warningText}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retry all failed/expired messages' });
  }
};

router.post('/messages/retry-all-failed', retryAllFailed);
router.post('/messages/retry-all', retryAllFailed);
router.post('/messages/:id/retry', retryMessage);
router.delete('/messages', clearMessages);
router.delete('/messages/clear-all', clearMessages);

export default router;
