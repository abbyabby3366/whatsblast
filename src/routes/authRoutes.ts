import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, UserRole } from '../models/User.js';
import { OTP } from '../models/OTP.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-whatsblast-2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key-whatsblast-2026';

router.post('/register/send-otp', async (req: Request, res: Response) => {
  const { phone_number } = req.body;
  if (!phone_number) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const existing = await User.findOne({ phone_number });
  if (existing) {
    return res.status(400).json({ error: 'Phone number already registered' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await OTP.deleteMany({ phone_number });
  await OTP.create({ phone_number, code, expiresAt });

  console.log(`🔑 OTP generated for ${phone_number}: ${code}`);
  return res.json({ success: true, message: 'OTP sent successfully', debug_otp: code });
});

router.post('/register', async (req: Request, res: Response) => {
  const { phone_number, password, otp } = req.body;

  if (!phone_number || !password) {
    return res.status(400).json({ error: 'Phone number and password are required' });
  }

  if (otp) {
    const validOtp = await OTP.findOne({ phone_number, code: otp });
    if (!validOtp) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    await OTP.deleteMany({ phone_number });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    phone_number,
    password: hashedPassword,
    role: UserRole.MERCHANT,
  });

  const access = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
  const refresh = jwt.sign({ userId: user._id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

  return res.status(201).json({
    access,
    refresh,
    user: {
      id: user._id,
      phone_number: user.phone_number,
      role: user.role,
    },
  });
});

router.post('/login', async (req: Request, res: Response) => {
  const { phone_number, password } = req.body;

  if (!phone_number || !password) {
    return res.status(400).json({ detail: 'Phone number and password are required' });
  }

  const user = await User.findOne({ phone_number });
  if (!user || !user.password) {
    return res.status(401).json({ detail: 'No active account found with the given credentials' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ detail: 'No active account found with the given credentials' });
  }

  const access = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
  const refresh = jwt.sign({ userId: user._id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

  return res.json({
    access,
    refresh,
    user: {
      id: user._id,
      phone_number: user.phone_number,
      role: user.role,
    },
  });
});

router.post('/token/refresh', async (req: Request, res: Response) => {
  const { refresh } = req.body;
  if (!refresh) {
    return res.status(400).json({ detail: 'Refresh token is required' });
  }

  try {
    const decoded = jwt.verify(refresh, JWT_REFRESH_SECRET) as { userId: string };
    const user = await User.findById(decoded.userId);
    if (!user || !user.is_active) {
      return res.status(401).json({ detail: 'Token is invalid or expired' });
    }

    const access = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    return res.json({ access, refresh });
  } catch (err) {
    return res.status(401).json({ detail: 'Token is invalid or expired' });
  }
});

export default router;
