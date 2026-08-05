import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { MasterPhone, IMasterPhone } from '../models/MasterPhone.js';
import { User } from '../models/User.js';
import { initWhatsAppSession, getActiveSession, removeActiveSession } from '../services/baileysManager.js';
import { getCrossChatStatus, forceSendNextTurn, getUserNextScheduledTime } from '../services/crossChatRunner.js';
import { useRedisAuthState } from '../services/redisAuthState.js';
import { Message } from '../models/Message.js';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';

const router = Router();
const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions';

router.use(authenticateToken);

function formatSession(s: any) {
  const obj = s.toObject ? s.toObject() : s;
  const { _id, __v, ...rest } = obj;
  return {
    id: _id ? _id.toString() : obj.id,
    last_phone_activity_at: obj.last_phone_activity_at || null,
    last_physical_phone_sent_message_at: obj.last_physical_phone_sent_message_at || null,
    ...rest,
  };
}

// WhatsApp Sessions Listing
const getSessions = async (req: AuthRequest, res: Response) => {
  const filter: any = {};
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const { search, status, user: userId, ordering, label } = req.query;
  if (search) {
    filter.$or = [
      { session_id: { $regex: String(search), $options: 'i' } },
      { phone_number: { $regex: String(search), $options: 'i' } },
      { alias: { $regex: String(search), $options: 'i' } },
      { labels: { $regex: String(search), $options: 'i' } },
    ];
  }
  if (status && status !== 'all') {
    filter.status = status;
  }
  if (userId && userId !== 'all') {
    filter.user = userId;
  }
  if (label && label !== 'all') {
    filter.labels = label;
  }

  let query = WhatsAppSession.find(filter).populate('user', 'phone_number role');
  if (ordering) {
    const orderStr = String(ordering);
    if (orderStr.startsWith('-')) {
      query = query.sort({ [orderStr.substring(1)]: -1 });
    } else {
      query = query.sort({ [orderStr]: 1 });
    }
  } else {
    query = query.sort({ createdAt: -1 });
  }

  const sessions = await query;
  return res.json(sessions.map(formatSession));
};

router.get('/whatsapp-sessions', getSessions);

// Create WhatsApp Session
const createSession = async (req: AuthRequest, res: Response) => {
  const sessionId = req.body.session_id || `session_${Date.now()}`;
  const maxMessages = req.body.max_message_count_per_day || 50;
  const minInterval = req.body.min_interval_seconds !== undefined ? Number(req.body.min_interval_seconds) : 10;
  const maxInterval = req.body.max_interval_seconds !== undefined ? Number(req.body.max_interval_seconds) : 15;
  const activeStart = req.body.active_start_time || '00:00';
  const activeEnd = req.body.active_end_time || '23:59';
  const alias = req.body.alias ? String(req.body.alias).trim() : undefined;
  const targetUserId = (req.body.user || req.body.user_id) && req.user?.role === 'admin'
    ? (req.body.user || req.body.user_id)
    : req.user?._id;

  let session = await WhatsAppSession.findOne({ session_id: sessionId });
  if (!session) {
    session = await WhatsAppSession.create({
      user: targetUserId,
      session_id: sessionId,
      max_message_count_per_day: maxMessages,
      min_interval_seconds: minInterval,
      max_interval_seconds: maxInterval,
      active_start_time: activeStart,
      active_end_time: activeEnd,
      ...(alias ? { alias } : {}),
      status: SessionStatus.STARTING,
    });
  }

  initWhatsAppSession(sessionId).catch(console.error);

  return res.status(201).json(formatSession(session));
};

router.post('/whatsapp-sessions', createSession);

// Get QR code for session
const getSessionQr = async (req: AuthRequest, res: Response) => {
  const paramId = String(req.params.id);
  const session = await WhatsAppSession.findOne({
    $or: [{ session_id: paramId }, { _id: paramId.match(/^[0-9a-fA-F]{24}$/) ? paramId : null }],
  });

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.status === SessionStatus.CONNECTED) {
    return res.json({ status: 'CONNECTED', message: 'WhatsApp is already connected' });
  }

  return res.json({
    status: session.status,
    qr_code: session.qr_code || null,
    qrBase64: session.qr_code || null,
  });
};

router.get('/whatsapp-sessions/:id/qr', getSessionQr);

// Patch WhatsApp Session (disconnect/update)
const patchSession = async (req: AuthRequest, res: Response) => {
  const paramId = String(req.params.id);
  const session = await WhatsAppSession.findOne({
    $or: [{ session_id: paramId }, { _id: paramId.match(/^[0-9a-fA-F]{24}$/) ? paramId : null }],
  });

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (req.user?.role !== 'admin' && session.user?.toString() !== req.user?._id.toString()) {
    return res.status(403).json({ error: 'Unauthorized to modify this session' });
  }

  const {
    status,
    alias,
    labels,
    max_message_count_per_day,
    warmup_schedule,
    min_interval_seconds,
    max_interval_seconds,
    active_start_time,
    active_end_time,
    user: userId,
  } = req.body;
  if (status) {
    session.status = status;
    if (status === SessionStatus.DISCONNECTED || status === 'disconnecting') {
      session.status = SessionStatus.DISCONNECTED;
      session.qr_code = '';
      const active = getActiveSession(session.session_id);
      if (active) {
        try {
          await active.socket.logout();
        } catch (_) {}
        removeActiveSession(session.session_id);
      }
    }
  }
  if (alias !== undefined) session.alias = String(alias).trim();
  if (labels !== undefined) {
    session.labels = Array.isArray(labels)
      ? labels.map((l: any) => String(l).trim()).filter(Boolean)
      : String(labels).split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  if (max_message_count_per_day !== undefined) session.max_message_count_per_day = max_message_count_per_day;
  if (warmup_schedule !== undefined) session.warmup_schedule = warmup_schedule;
  if (min_interval_seconds !== undefined) session.min_interval_seconds = Number(min_interval_seconds);
  if (max_interval_seconds !== undefined) session.max_interval_seconds = Number(max_interval_seconds);
  if (active_start_time !== undefined) session.active_start_time = String(active_start_time);
  if (active_end_time !== undefined) session.active_end_time = String(active_end_time);
  if (userId && req.user?.role === 'admin') session.user = userId;

  await session.save();
  const updated = await WhatsAppSession.findById(session._id).populate('user', 'phone_number role');
  return res.json(formatSession(updated || session));
};

router.patch('/whatsapp-sessions/:id', patchSession);

// Reconnect session
const reconnectSession = async (req: AuthRequest, res: Response) => {
  const paramId = String(req.params.id);
  const session = await WhatsAppSession.findOne({
    $or: [{ session_id: paramId }, { _id: paramId.match(/^[0-9a-fA-F]{24}$/) ? paramId : null }],
  });

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (req.user?.role !== 'admin' && session.user?.toString() !== req.user?._id.toString()) {
    return res.status(403).json({ error: 'Unauthorized to reconnect this session' });
  }

  removeActiveSession(session.session_id);

  session.status = SessionStatus.STARTING;
  await session.save();

  initWhatsAppSession(session.session_id).catch(console.error);
  return res.json({ success: true, message: 'Reconnecting session...' });
};

router.post('/whatsapp-sessions/:id/reconnect', reconnectSession);

// Logout session
const logoutSession = async (req: AuthRequest, res: Response) => {
  const paramId = String(req.params.id);
  const session = await WhatsAppSession.findOne({
    $or: [{ session_id: paramId }, { _id: paramId.match(/^[0-9a-fA-F]{24}$/) ? paramId : null }],
  });

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (req.user?.role !== 'admin' && session.user?.toString() !== req.user?._id.toString()) {
    return res.status(403).json({ error: 'Unauthorized to logout this session' });
  }

  // 1. Mark session as DISCONNECTED in DB first so connection listener halts auto-reconnection
  session.status = SessionStatus.DISCONNECTED;
  session.qr_code = '';
  await session.save();

  // 2. Clear credentials & active session
  const active = getActiveSession(session.session_id);
  if (active) {
    try {
      await active.clearCreds?.();
      await active.socket.logout();
    } catch (_) {}
    removeActiveSession(session.session_id);
  } else {
    try {
      const redisAuth = await useRedisAuthState(session.session_id);
      await redisAuth.clearCreds();
    } catch (_) {}
  }

  // 3. Delete session directory on disk if any
  const folder = path.join(SESSIONS_DIR, session.session_id);
  if (fs.existsSync(folder)) {
    try {
      fs.rmSync(folder, { recursive: true, force: true });
    } catch (_) {}
  }

  return res.json({ success: true, message: 'Logged out successfully' });
};

router.post('/whatsapp-sessions/:id/logout', logoutSession);
router.post('/whatsapp-sessions/:id/logout/', logoutSession);

// Delete session
const deleteSession = async (req: AuthRequest, res: Response) => {
  const paramId = String(req.params.id);
  const session = await WhatsAppSession.findOne({
    $or: [{ session_id: paramId }, { _id: paramId.match(/^[0-9a-fA-F]{24}$/) ? paramId : null }],
  });

  if (session) {
    if (req.user?.role !== 'admin' && session.user?.toString() !== req.user?._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized to delete this session' });
    }

    const targetSessionId = session.session_id;

    // 1. Delete MongoDB records first
    await WhatsAppSession.deleteOne({ _id: session._id });
    await MasterPhone.deleteMany({ session: session._id });

    // 2. Clear Redis auth keys
    try {
      const redisAuth = await useRedisAuthState(targetSessionId);
      await redisAuth.clearCreds();
    } catch (_) {}

    // 3. Clear file system folder if any
    const folder = path.join(SESSIONS_DIR, targetSessionId);
    if (fs.existsSync(folder)) {
      try {
        fs.rmSync(folder, { recursive: true, force: true });
      } catch (_) {}
    }

    // 4. Close socket & purge active session map
    removeActiveSession(targetSessionId);
  }
  return res.json({ success: true });
};

router.delete('/whatsapp-sessions/:id', deleteSession);

// Master Phone Numbers CRUD (Admin only)
const getMasterPhones = async (_req: AuthRequest, res: Response) => {
  const masters = await MasterPhone.find().populate('session');
  return res.json(
    masters.map((m: any) => {
      const obj = m.toObject();
      return {
        id: obj._id.toString(),
        session: obj.session?._id?.toString() || obj.session,
        session_id: obj.session?.session_id || obj.session_id,
        phone_number: obj.session?.phone_number || obj.phone_number,
        session_status: obj.session?.status || obj.session_status,
        is_active: obj.is_active,
      };
    })
  );
};

router.get('/master-phone-numbers', getMasterPhones);

const createMasterPhone = async (req: AuthRequest, res: Response) => {
  const { session, is_active } = req.body;
  if (!session) {
    return res.status(400).json({ error: 'Session ID or ObjectId is required' });
  }

  const sessionDoc = await WhatsAppSession.findOne({
    $or: [{ session_id: session }, { _id: session.match(/^[0-9a-fA-F]{24}$/) ? session : null }],
  });

  if (!sessionDoc) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const master = await MasterPhone.create({
    session: sessionDoc._id,
    session_id: sessionDoc.session_id,
    phone_number: sessionDoc.phone_number,
    session_status: sessionDoc.status,
    is_active: is_active !== undefined ? Boolean(is_active) : true,
  });

  return res.status(201).json({
    id: master._id.toString(),
    session: sessionDoc._id.toString(),
    session_id: sessionDoc.session_id,
    phone_number: sessionDoc.phone_number,
    session_status: sessionDoc.status,
    is_active: master.is_active,
  });
};

router.post('/master-phone-numbers', createMasterPhone);

const patchMasterPhone = async (req: AuthRequest, res: Response) => {
  const paramId = String(req.params.id);
  const { is_active } = req.body;

  const master: IMasterPhone | null = await MasterPhone.findById(paramId);
  if (!master) {
    return res.status(404).json({ error: 'Master phone number not found' });
  }

  if (is_active !== undefined) master.is_active = Boolean(is_active);
  await master.save();

  return res.json({
    id: master._id.toString(),
    session: master.session.toString(),
    session_id: master.session_id,
    phone_number: master.phone_number,
    session_status: master.session_status,
    is_active: master.is_active,
  });
};

router.patch('/master-phone-numbers/:id', patchMasterPhone);

const deleteMasterPhone = async (req: AuthRequest, res: Response) => {
  const paramId = String(req.params.id);
  await MasterPhone.deleteOne({ _id: paramId });
  return res.json({ success: true });
};

router.delete('/master-phone-numbers/:id', deleteMasterPhone);

// Cross-Chat Warmup Settings & Control Endpoints
router.get('/cross-chat/settings', async (req: AuthRequest, res: Response) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const user = await User.findById(userId);
  const activeDialogues = getCrossChatStatus(userId.toString());
  const nextScheduledAt = await getUserNextScheduledTime(userId.toString(), user?.cross_chat_min_cooldown_min ?? 5);

  const userSessions = await WhatsAppSession.find({ user: userId });
  const sessionIds = userSessions.map((s) => s._id);

  const startOfDay = dayjs().startOf('day').toDate();
  const totalMessagesToday = await Message.countDocuments({
    session: { $in: sessionIds },
    'content.text': { $regex: 'Cross-Chat Warmup', $options: 'i' },
    createdAt: { $gte: startOfDay }
  });

  const todayStr = dayjs().format('YYYY-MM-DD');
  const sessionDailyCounts: Record<string, number> = {};
  for (const s of userSessions) {
    const key = s.phone_number || s.session_id;
    sessionDailyCounts[key] = s.current_day === todayStr ? (s.current_message_count || 0) : 0;
  }

  return res.json({
    cross_chat_enabled: Boolean(user?.cross_chat_enabled),
    cross_chat_min_delay_sec: user?.cross_chat_min_delay_sec ?? 25,
    cross_chat_max_delay_sec: user?.cross_chat_max_delay_sec ?? 300,
    cross_chat_cooldown_min: user?.cross_chat_cooldown_min ?? 5,
    cross_chat_min_cooldown_min: user?.cross_chat_min_cooldown_min ?? 5,
    cross_chat_max_cooldown_min: user?.cross_chat_max_cooldown_min ?? 720,
    cross_chat_max_daily_messages: user?.cross_chat_max_daily_messages ?? 50,
    cross_chat_turns_per_dialogue: user?.cross_chat_turns_per_dialogue ?? 5,
    cross_chat_min_turns: user?.cross_chat_min_turns ?? 3,
    cross_chat_max_turns: user?.cross_chat_max_turns ?? 5,
    cross_chat_min_msgs_per_turn: user?.cross_chat_min_msgs_per_turn ?? 1,
    cross_chat_max_msgs_per_turn: user?.cross_chat_max_msgs_per_turn ?? 4,
    cross_chat_active_start_time: user?.cross_chat_active_start_time ?? '08:00',
    cross_chat_active_end_time: user?.cross_chat_active_end_time ?? '22:00',
    cross_chat_send_images_enabled: Boolean(user?.cross_chat_send_images_enabled),
    cross_chat_image_percentage: user?.cross_chat_image_percentage ?? 20,
    timezone: user?.timezone || 'Asia/Kuala_Lumpur',
    next_scheduled_at: nextScheduledAt,
    total_messages_today: totalMessagesToday,
    session_daily_counts: sessionDailyCounts,
    active_dialogues: activeDialogues,
  });
});

router.post('/cross-chat/toggle', async (req: AuthRequest, res: Response) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { enabled } = req.body;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.cross_chat_enabled = Boolean(enabled);
  await user.save();

  const activeDialogues = getCrossChatStatus(userId.toString());

  return res.json({
    cross_chat_enabled: user.cross_chat_enabled,
    cross_chat_min_delay_sec: user.cross_chat_min_delay_sec ?? 25,
    cross_chat_max_delay_sec: user.cross_chat_max_delay_sec ?? 300,
    cross_chat_cooldown_min: user.cross_chat_cooldown_min ?? 5,
    cross_chat_min_cooldown_min: user.cross_chat_min_cooldown_min ?? 5,
    cross_chat_max_cooldown_min: user.cross_chat_max_cooldown_min ?? 720,
    cross_chat_max_daily_messages: user.cross_chat_max_daily_messages ?? 50,
    cross_chat_turns_per_dialogue: user.cross_chat_turns_per_dialogue ?? 5,
    cross_chat_min_turns: user.cross_chat_min_turns ?? 3,
    cross_chat_max_turns: user.cross_chat_max_turns ?? 5,
    cross_chat_min_msgs_per_turn: user.cross_chat_min_msgs_per_turn ?? 1,
    cross_chat_max_msgs_per_turn: user.cross_chat_max_msgs_per_turn ?? 4,
    cross_chat_active_start_time: user.cross_chat_active_start_time ?? '08:00',
    cross_chat_active_end_time: user.cross_chat_active_end_time ?? '22:00',
    cross_chat_send_images_enabled: Boolean(user.cross_chat_send_images_enabled),
    cross_chat_image_percentage: user.cross_chat_image_percentage ?? 20,
    timezone: user.timezone || 'Asia/Kuala_Lumpur',
    active_dialogues: activeDialogues,
  });
});

router.post('/cross-chat/config', async (req: AuthRequest, res: Response) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const {
    cross_chat_min_delay_sec,
    cross_chat_max_delay_sec,
    cross_chat_cooldown_min,
    cross_chat_min_cooldown_min,
    cross_chat_max_cooldown_min,
    cross_chat_max_daily_messages,
    cross_chat_turns_per_dialogue,
    cross_chat_min_turns,
    cross_chat_max_turns,
    cross_chat_min_msgs_per_turn,
    cross_chat_max_msgs_per_turn,
    cross_chat_active_start_time,
    cross_chat_active_end_time,
    cross_chat_send_images_enabled,
    cross_chat_image_percentage,
    timezone,
  } = req.body;

  if (cross_chat_min_delay_sec !== undefined) user.cross_chat_min_delay_sec = Number(cross_chat_min_delay_sec);
  if (cross_chat_max_delay_sec !== undefined) user.cross_chat_max_delay_sec = Number(cross_chat_max_delay_sec);
  if (cross_chat_cooldown_min !== undefined) user.cross_chat_cooldown_min = Number(cross_chat_cooldown_min);
  if (cross_chat_min_cooldown_min !== undefined) user.cross_chat_min_cooldown_min = Number(cross_chat_min_cooldown_min);
  if (cross_chat_max_cooldown_min !== undefined) user.cross_chat_max_cooldown_min = Number(cross_chat_max_cooldown_min);
  if (cross_chat_max_daily_messages !== undefined) user.cross_chat_max_daily_messages = Number(cross_chat_max_daily_messages);
  if (cross_chat_turns_per_dialogue !== undefined) user.cross_chat_turns_per_dialogue = Number(cross_chat_turns_per_dialogue);
  if (cross_chat_min_turns !== undefined) user.cross_chat_min_turns = Number(cross_chat_min_turns);
  if (cross_chat_max_turns !== undefined) user.cross_chat_max_turns = Number(cross_chat_max_turns);
  if (cross_chat_min_msgs_per_turn !== undefined) user.cross_chat_min_msgs_per_turn = Number(cross_chat_min_msgs_per_turn);
  if (cross_chat_max_msgs_per_turn !== undefined) user.cross_chat_max_msgs_per_turn = Number(cross_chat_max_msgs_per_turn);
  if (cross_chat_active_start_time !== undefined) user.cross_chat_active_start_time = String(cross_chat_active_start_time);
  if (cross_chat_active_end_time !== undefined) user.cross_chat_active_end_time = String(cross_chat_active_end_time);
  if (cross_chat_send_images_enabled !== undefined) user.cross_chat_send_images_enabled = Boolean(cross_chat_send_images_enabled);
  if (cross_chat_image_percentage !== undefined) user.cross_chat_image_percentage = Number(cross_chat_image_percentage);
  if (timezone !== undefined) user.timezone = String(timezone);

  await user.save();

  const activeDialogues = getCrossChatStatus(userId.toString());

  return res.json({
    success: true,
    cross_chat_enabled: user.cross_chat_enabled,
    cross_chat_min_delay_sec: user.cross_chat_min_delay_sec,
    cross_chat_max_delay_sec: user.cross_chat_max_delay_sec,
    cross_chat_cooldown_min: user.cross_chat_cooldown_min,
    cross_chat_min_cooldown_min: user.cross_chat_min_cooldown_min,
    cross_chat_max_cooldown_min: user.cross_chat_max_cooldown_min,
    cross_chat_max_daily_messages: user.cross_chat_max_daily_messages,
    cross_chat_turns_per_dialogue: user.cross_chat_turns_per_dialogue,
    cross_chat_min_turns: user.cross_chat_min_turns,
    cross_chat_max_turns: user.cross_chat_max_turns,
    cross_chat_min_msgs_per_turn: user.cross_chat_min_msgs_per_turn,
    cross_chat_max_msgs_per_turn: user.cross_chat_max_msgs_per_turn,
    cross_chat_active_start_time: user.cross_chat_active_start_time,
    cross_chat_active_end_time: user.cross_chat_active_end_time,
    cross_chat_send_images_enabled: user.cross_chat_send_images_enabled,
    cross_chat_image_percentage: user.cross_chat_image_percentage,
    timezone: user.timezone,
    active_dialogues: activeDialogues,
  });
});

router.post('/cross-chat/send-now', async (req: AuthRequest, res: Response) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { session_a_id, session_b_id } = req.body || {};
  const result = await forceSendNextTurn(userId.toString(), session_a_id, session_b_id);
  const activeDialogues = getCrossChatStatus(userId.toString());

  return res.json({
    ...result,
    active_dialogues: activeDialogues,
  });
});

export default router;
