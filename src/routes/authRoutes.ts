import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, UserRole } from '../models/User.js';
import { OTP, IOTP } from '../models/OTP.js';
import { sendOtpViaMasterPhone } from '../services/otpService.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-whatsblast-2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key-whatsblast-2026';

function sendAuthTokens(user: any, res: Response, statusCode = 200) {
  const access = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
  const refresh = jwt.sign({ userId: user._id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

  return res.status(statusCode).json({
    access,
    refresh,
    user: {
      id: user._id,
      phone_number: user.phone_number,
      role: user.role,
    },
  });
}

router.post('/register/send-otp', async (req: Request, res: Response) => {
  const { phone_number } = req.body;
  if (!phone_number) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const cleanPhone = String(phone_number).trim().replace(/[^0-9]/g, '');
  if (!cleanPhone) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  const existing = await User.findOne({ phone_number: cleanPhone });
  if (existing) {
    return res.status(400).json({ error: 'Phone number already registered' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await sendOtpViaMasterPhone(cleanPhone, code);
    await OTP.deleteMany({ phone_number: cleanPhone });
    await OTP.create({ phone_number: cleanPhone, code, expiresAt });
    return res.json({ success: true, message: 'OTP sent successfully to your WhatsApp', debug_otp: code });
  } catch (err: any) {
    console.error('Failed to send OTP via WhatsApp Master account:', err);
    return res.status(500).json({ error: err.message || 'Failed to send OTP message via WhatsApp. Please try again or contact administrator.' });
  }
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  const { phone_number } = req.body;
  if (!phone_number) {
    return res.status(400).json({ detail: 'Phone number is required' });
  }

  const cleanPhone = String(phone_number).trim().replace(/[^0-9]/g, '');
  const existing = await User.findOne({ phone_number: cleanPhone });
  if (!existing) {
    // For security, return success message even if account doesn't exist
    return res.json({ detail: 'If the account exists, an OTP has been sent.' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await sendOtpViaMasterPhone(cleanPhone, code);
    await OTP.deleteMany({ phone_number: cleanPhone });
    await OTP.create({ phone_number: cleanPhone, code, expiresAt });
    return res.json({ detail: 'If the account exists, an OTP has been sent.' });
  } catch (err: any) {
    console.error('Failed to send forgot-password OTP:', err);
    return res.status(500).json({ detail: err.message || 'Failed to send OTP via WhatsApp.' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  const { phone_number, otp, password } = req.body;
  if (!phone_number || !otp || !password) {
    return res.status(400).json({ detail: 'Phone number, OTP, and new password are required' });
  }

  const cleanPhone = String(phone_number).trim().replace(/[^0-9]/g, '');
  const validOtp: IOTP | null = await OTP.findOne({ phone_number: cleanPhone, code: String(otp).trim() });

  if (!validOtp || validOtp.expiresAt < new Date()) {
    return res.status(400).json({ detail: 'Invalid or expired OTP' });
  }

  const user = await User.findOne({ phone_number: cleanPhone });
  if (!user) {
    return res.status(404).json({ detail: 'User not found' });
  }

  user.password = await bcrypt.hash(password, 10);
  await user.save();
  await OTP.deleteMany({ phone_number: cleanPhone });

  return res.json({ detail: 'Password has been reset successfully.' });
});

router.post('/register', async (req: Request, res: Response) => {
  const { phone_number, password, otp } = req.body;

  if (!phone_number || !password) {
    return res.status(400).json({ error: 'Phone number and password are required' });
  }

  const cleanPhone = String(phone_number).trim().replace(/[^0-9]/g, '');

  if (otp) {
    const validOtp: IOTP | null = await OTP.findOne({ phone_number: cleanPhone, code: String(otp).trim() });
    if (!validOtp || validOtp.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    await OTP.deleteMany({ phone_number: cleanPhone });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    phone_number: cleanPhone,
    password: hashedPassword,
    role: UserRole.MERCHANT,
  });

  return sendAuthTokens(user, res, 201);
});

router.post('/login', async (req: Request, res: Response) => {
  const { phone_number, password } = req.body;

  if (!phone_number || !password) {
    return res.status(400).json({ detail: 'Phone number and password are required' });
  }

  const cleanPhone = String(phone_number).trim().replace(/[^0-9]/g, '');
  const user = await User.findOne({ phone_number: cleanPhone });

  if (!user || !user.password) {
    return res.status(401).json({ detail: 'No active account found with the given credentials' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ detail: 'No active account found with the given credentials' });
  }

  return sendAuthTokens(user, res, 200);
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

