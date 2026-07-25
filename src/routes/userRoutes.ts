import { Router, Response } from 'express';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/authMiddleware.js';
import { User } from '../models/User.js';
import { WhatsAppSession } from '../models/WhatsAppSession.js';

const router = Router();

router.use(authenticateToken);

// User Profile / Listing
router.get('/users', async (req: AuthRequest, res: Response) => {
  if (req.user?.role === 'admin') {
    const users = await User.find().select('-password');
    return res.json(users);
  }
  return res.json([req.user]);
});

router.get('/users/me', async (req: AuthRequest, res: Response) => {
  return res.json(req.user);
});

router.patch('/users/me', async (req: AuthRequest, res: Response) => {
  const { min_interval_minutes } = req.body;
  if (min_interval_minutes && req.user) {
    req.user.min_interval_minutes = min_interval_minutes;
    await req.user.save();
  }
  return res.json(req.user);
});

// Agent Phone Numbers Management
router.get('/agent-phone-numbers', async (req: AuthRequest, res: Response) => {
  const sessions = await WhatsAppSession.find({ user: req.user?._id });
  const agentPhones: Array<{ id: string; session_id: string; phone_number: string; is_active: boolean }> = [];

  for (const s of sessions) {
    for (const a of s.agent_phone_numbers) {
      agentPhones.push({
        id: (a as any)._id,
        session_id: s.session_id,
        phone_number: a.phone_number,
        is_active: a.is_active,
      });
    }
  }

  return res.json(agentPhones);
});

router.post('/agent-phone-numbers', async (req: AuthRequest, res: Response) => {
  const { session_id, phone_number } = req.body;
  if (!session_id || !phone_number) {
    return res.status(400).json({ error: 'session_id and phone_number are required' });
  }

  const session = await WhatsAppSession.findOne({ session_id, user: req.user?._id });
  if (!session) {
    return res.status(404).json({ error: 'WhatsApp session not found' });
  }

  session.agent_phone_numbers.push({ phone_number, is_active: true });
  await session.save();

  return res.status(201).json({ success: true, agent_phone_numbers: session.agent_phone_numbers });
});

router.delete('/agent-phone-numbers/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const sessions = await WhatsAppSession.find({ user: req.user?._id });

  for (const s of sessions) {
    const initialLen = s.agent_phone_numbers.length;
    s.agent_phone_numbers = s.agent_phone_numbers.filter((a: any) => a._id.toString() !== id);
    if (s.agent_phone_numbers.length !== initialLen) {
      await s.save();
      return res.json({ success: true });
    }
  }

  return res.status(404).json({ error: 'Agent phone number not found' });
});

export default router;
