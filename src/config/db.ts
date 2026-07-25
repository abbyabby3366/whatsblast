import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, UserRole } from '../models/User.js';

export async function connectDB(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/whatsblast';
  try {
    await mongoose.connect(mongoUri);
    console.log('🍃 Connected to MongoDB successfully');
    await seedAdminUser();
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
}

async function seedAdminUser(): Promise<void> {
  try {
    const adminPhone = '001';
    const rawPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const existing = await User.findOne({ phone_number: adminPhone });
    if (existing) {
      existing.password = hashedPassword;
      existing.role = UserRole.ADMIN;
      existing.is_staff = true;
      existing.is_active = true;
      await existing.save();
      console.log('👑 Admin user (phone: 001) set with password: admin123');
    } else {
      await User.create({
        phone_number: adminPhone,
        password: hashedPassword,
        role: UserRole.ADMIN,
        is_staff: true,
        is_active: true,
      });
      console.log('👑 Admin user (phone: 001) created with password: admin123');
    }
  } catch (err) {
    console.error('Failed to seed admin user:', err);
  }
}

