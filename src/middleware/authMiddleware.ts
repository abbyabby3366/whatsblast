import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser, UserRole } from '../models/User.js';

export interface AuthRequest extends Request {
  user?: IUser;
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ detail: 'Authentication credentials were not provided.' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'super-secret-jwt-key-whatsblast-2026';
    const decoded = jwt.verify(token, secret) as { userId: string };

    const user = await User.findById(decoded.userId);
    if (!user || !user.is_active) {
      return res.status(401).json({ detail: 'Invalid or inactive user token.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ detail: 'Token is invalid or expired' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== UserRole.ADMIN) {
    return res.status(403).json({ detail: 'You do not have permission to perform this action.' });
  }
  next();
};
