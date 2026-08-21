import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/authMiddleware.js';
import { User } from '../models/User.js';
import { WhatsAppSession } from '../models/WhatsAppSession.js';
import { Customer } from '../models/Customer.js';
import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { computeCampaignsStats } from './campaignRoutes.js';

const router = Router();

router.use(authenticateToken);

function formatUser(u: any) {
  const obj = u.toObject ? u.toObject() : u;
  const { _id, password, __v, ...rest } = obj;
  return {
    id: _id ? _id.toString() : obj.id,
    ...rest,
  };
}

// User Profile / Listing
const getUsers = async (req: AuthRequest, res: Response) => {
  if (req.user?.role === 'admin') {
    const { search, role, is_active, ordering } = req.query;
    const filter: any = {};

    if (search) {
      filter.$or = [
        { phone_number: { $regex: String(search), $options: 'i' } },
        { role: { $regex: String(search), $options: 'i' } },
      ];
    }
    if (role && role !== 'all') {
      filter.role = role;
    }
    if (is_active && is_active !== 'all') {
      filter.is_active = is_active === 'true';
    }

    let query = User.find(filter).select('-password');

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

    const users = await query;
    return res.json(users.map(formatUser));
  }
  return res.json([formatUser(req.user)]);
};

router.get('/users', getUsers);

const getUsersMe = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  return res.json(formatUser(req.user));
};

router.get('/users/me', getUsersMe);

const patchUsersMe = async (req: AuthRequest, res: Response) => {
  const { min_interval_minutes } = req.body;
  if (min_interval_minutes && req.user) {
    req.user.min_interval_minutes = min_interval_minutes;
    await req.user.save();
  }
  return res.json(formatUser(req.user));
};

router.patch('/users/me', patchUsersMe);

// Create User (Admin feature)
const createUser = async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can create users' });
  }

  const { phone_number, password, role, is_active, min_interval_minutes } = req.body;
  if (!phone_number) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const cleanPhone = String(phone_number).trim();
  const existing = await User.findOne({ phone_number: cleanPhone });
  if (existing) {
    return res.status(400).json({ error: 'Phone number already registered' });
  }

  const hashedPassword = await bcrypt.hash(password || '123456', 10);
  const newUser = await User.create({
    phone_number: cleanPhone,
    password: hashedPassword,
    role: role || 'merchant',
    is_active: is_active !== undefined ? Boolean(is_active) : true,
    min_interval_minutes: min_interval_minutes || '10-15',
  });

  return res.status(201).json(formatUser(newUser));
};

router.post('/users', requireAdmin, createUser);

// Update User (Admin feature)
const updateUser = async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can edit users' });
  }

  const { id } = req.params;
  const { phone_number, password, role, is_active, min_interval_minutes } = req.body;

  const targetUser = await User.findById(id);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (phone_number) targetUser.phone_number = String(phone_number).trim();
  if (role) targetUser.role = role;
  if (is_active !== undefined) targetUser.is_active = Boolean(is_active);
  if (min_interval_minutes) targetUser.min_interval_minutes = min_interval_minutes;
  if (password) {
    targetUser.password = await bcrypt.hash(password, 10);
  }

  await targetUser.save();
  return res.json(formatUser(targetUser));
};

router.patch('/users/:id', requireAdmin, updateUser);

// Delete User (Admin feature)
const deleteUser = async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can delete users' });
  }

  const { id } = req.params;
  await User.deleteOne({ _id: id });
  return res.json({ success: true });
};

router.delete('/users/:id', requireAdmin, deleteUser);

// Agent Phone Numbers Management
const getAgentPhones = async (req: AuthRequest, res: Response) => {
  const filter: any = {};
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }
  const sessionQuery = req.query.session ? String(req.query.session) : null;
  if (sessionQuery) {
    filter.$or = [
      { session_id: sessionQuery },
      { _id: sessionQuery.match(/^[0-9a-fA-F]{24}$/) ? sessionQuery : null }
    ];
  }

  const sessions = await WhatsAppSession.find(filter);
  const agentPhones: Array<{ id: string; session_id: string; phone_number: string; is_active: boolean }> = [];

  for (const s of sessions) {
    for (const a of s.agent_phone_numbers) {
      agentPhones.push({
        id: (a as any)._id ? (a as any)._id.toString() : '',
        session_id: s.session_id,
        phone_number: a.phone_number,
        is_active: a.is_active,
      });
    }
  }

  return res.json(agentPhones);
};

router.get('/agent-phone-numbers', getAgentPhones);

const createAgentPhone = async (req: AuthRequest, res: Response) => {
  const { session_id, session, phone_number } = req.body;
  const targetSessionId = session_id || session;
  if (!targetSessionId || !phone_number) {
    return res.status(400).json({ error: 'session and phone_number are required' });
  }

  const filter: any = {
    $or: [{ session_id: targetSessionId }, { _id: targetSessionId.match(/^[0-9a-fA-F]{24}$/) ? targetSessionId : null }],
  };
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const sessDoc = await WhatsAppSession.findOne(filter);

  if (!sessDoc) {
    return res.status(404).json({ error: 'WhatsApp session not found' });
  }

  sessDoc.agent_phone_numbers.push({ phone_number, is_active: true } as any);
  await sessDoc.save();

  return res.status(201).json({ success: true, agent_phone_numbers: sessDoc.agent_phone_numbers });
};

router.post('/agent-phone-numbers', createAgentPhone);

const deleteAgentPhone = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const filter: any = {};
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }
  const sessions = await WhatsAppSession.find(filter);

  for (const s of sessions) {
    const initialLen = s.agent_phone_numbers.length;
    s.agent_phone_numbers = s.agent_phone_numbers.filter((a: any) => (a as any)._id?.toString() !== id);
    if (s.agent_phone_numbers.length !== initialLen) {
      await s.save();
      return res.json({ success: true });
    }
  }

  return res.status(404).json({ error: 'Agent phone number not found' });
};

router.delete('/agent-phone-numbers/:id', deleteAgentPhone);

const getMerchantDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user?._id;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const totalCustomers = await Customer.countDocuments({ merchant: merchantId });
    const totalCampaigns = await BlastCampaign.countDocuments({ user: merchantId });
    const completedCampaigns = await BlastCampaign.countDocuments({
      user: merchantId,
      status: CampaignStatus.COMPLETED,
    });
    const scheduledCampaigns = await BlastCampaign.countDocuments({
      user: merchantId,
      status: { $in: [CampaignStatus.RUNNING, CampaignStatus.DRAFT, 'SCHEDULED'] },
    });

    const recentCampaignsDocs = await BlastCampaign.find({ user: merchantId })
      .sort({ createdAt: -1 })
      .limit(5);

    const recentIds = recentCampaignsDocs.map((c) => c._id);
    const recentStatsMap = await computeCampaignsStats(recentIds);

    const recentCampaigns = recentCampaignsDocs.map((c: any) => {
      const obj = c.toObject ? c.toObject() : c;
      const cId = obj._id ? obj._id.toString() : obj.id;
      const liveStats = recentStatsMap.get(cId);
      const totalRecips = obj.recipient_phones?.length || obj.contacts?.length || 0;
      const stats = liveStats
        ? {
            total: Math.max(totalRecips, liveStats.sent + liveStats.failed + liveStats.pending),
            sent: liveStats.sent,
            failed: liveStats.failed,
            pending: liveStats.pending,
          }
        : obj.stats || {};

      return {
        id: cId,
        name: obj.name,
        status: obj.status,
        created_at: obj.createdAt,
        error_message: obj.error_message,
        stats,
        recipient_phones: obj.recipient_phones || [],
        contacts: obj.contacts || [],
        recipients: obj.recipients || [],
        current_index: obj.current_index || 0,
      };
    });

    const userSessions = await WhatsAppSession.find({ user: merchantId }).select('_id');
    const userCampaigns = await BlastCampaign.find({ user: merchantId }).select('_id');
    const sessionIds = userSessions.map((s) => s._id);
    const campaignIds = userCampaigns.map((c) => c._id);

    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const dayObj = dayjs().subtract(i, 'day');
      const startOfDay = dayObj.startOf('day').toDate();
      const endOfDay = dayObj.endOf('day').toDate();
      const dateName = dayObj.format('MMM DD');

      const customersCount = await Customer.countDocuments({
        merchant: merchantId,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
      });

      const messageCount = await Message.countDocuments({
        $and: [
          {
            $or: [
              { session: { $in: sessionIds } },
              { campaign: { $in: campaignIds } },
            ],
          },
          {
            $or: [
              { sent_at: { $gte: startOfDay, $lte: endOfDay } },
              { wa_timestamp: { $gte: startOfDay, $lte: endOfDay } },
              { createdAt: { $gte: startOfDay, $lte: endOfDay } },
            ],
          },
        ],
        direction: MessageDirection.OUTBOUND,
        status: { $in: [MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ] },
      });

      chartData.push({
        name: dateName,
        customers: customersCount,
        messages: messageCount,
      });
    }

    return res.json({
      totalCustomers,
      totalCampaigns,
      completedCampaigns,
      scheduledCampaigns,
      chartData,
      recentCampaigns,
    });
  } catch (error: any) {
    console.error('Error fetching merchant dashboard stats:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch dashboard stats' });
  }
};

router.get('/merchant/dashboard-stats', getMerchantDashboardStats);

export default router;
