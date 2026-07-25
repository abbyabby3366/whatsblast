import mongoose, { Schema, Document } from 'mongoose';

export enum UserRole {
  ADMIN = 'admin',
  MERCHANT = 'merchant',
  CUSTOMER = 'customer',
}

export interface IUser extends Document {
  phone_number: string;
  password?: string;
  role: UserRole;
  is_active: boolean;
  is_staff: boolean;
  min_interval_minutes: string;
  last_used_session_id?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    phone_number: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.MERCHANT },
    is_active: { type: Boolean, default: true },
    is_staff: { type: Boolean, default: false },
    min_interval_minutes: { type: String, default: '10-15' },
    last_used_session_id: { type: String },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
