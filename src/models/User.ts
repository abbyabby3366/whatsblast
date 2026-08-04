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
  cross_chat_enabled?: boolean;
  cross_chat_min_delay_sec?: number;
  cross_chat_max_delay_sec?: number;
  cross_chat_cooldown_min?: number;
  cross_chat_min_cooldown_min?: number;
  cross_chat_max_cooldown_min?: number;
  cross_chat_max_daily_messages?: number;
  cross_chat_turns_per_dialogue?: number;
  cross_chat_min_turns?: number;
  cross_chat_max_turns?: number;
  cross_chat_min_msgs_per_turn?: number;
  cross_chat_max_msgs_per_turn?: number;
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
    cross_chat_enabled: { type: Boolean, default: false },
    cross_chat_min_delay_sec: { type: Number, default: 12 },
    cross_chat_max_delay_sec: { type: Number, default: 25 },
    cross_chat_cooldown_min: { type: Number, default: 5 },
    cross_chat_min_cooldown_min: { type: Number, default: 5 },
    cross_chat_max_cooldown_min: { type: Number, default: 15 },
    cross_chat_max_daily_messages: { type: Number, default: 50 },
    cross_chat_turns_per_dialogue: { type: Number, default: 5 },
    cross_chat_min_turns: { type: Number, default: 3 },
    cross_chat_max_turns: { type: Number, default: 5 },
    cross_chat_min_msgs_per_turn: { type: Number, default: 1 },
    cross_chat_max_msgs_per_turn: { type: Number, default: 2 },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
