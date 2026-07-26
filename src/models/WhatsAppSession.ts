import mongoose, { Schema, Document } from 'mongoose';

export enum SessionStatus {
  STARTING = 'STARTING',
  QR_READY = 'QR_READY',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
}

export interface IAgentPhoneNumber {
  phone_number: string;
  is_active: boolean;
}

export interface IWhatsAppSession extends Document {
  user?: mongoose.Types.ObjectId;
  session_id: string;
  status: SessionStatus;
  qr_code?: string;
  phone_number?: string;
  push_name?: string;
  max_message_count_per_day: number;
  current_message_count: number;
  current_day?: string;
  warmup_schedule?: Record<string, any>;
  agent_phone_numbers: IAgentPhoneNumber[];
  min_interval_seconds: number;
  max_interval_seconds: number;
  active_start_time: string;
  active_end_time: string;
  createdAt: Date;
  updatedAt: Date;
}

const AgentPhoneNumberSchema = new Schema<IAgentPhoneNumber>({
  phone_number: { type: String, required: true },
  is_active: { type: Boolean, default: true },
});

const WhatsAppSessionSchema = new Schema<IWhatsAppSession>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    session_id: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: Object.values(SessionStatus), default: SessionStatus.STARTING },
    qr_code: { type: String },
    phone_number: { type: String },
    push_name: { type: String },
    max_message_count_per_day: { type: Number, default: 50 },
    current_message_count: { type: Number, default: 0 },
    current_day: { type: String },
    warmup_schedule: { type: Schema.Types.Mixed },
    agent_phone_numbers: [AgentPhoneNumberSchema],
    min_interval_seconds: { type: Number, default: 10 },
    max_interval_seconds: { type: Number, default: 15 },
    active_start_time: { type: String, default: '00:00' },
    active_end_time: { type: String, default: '23:59' },
  },
  { timestamps: true }
);

WhatsAppSessionSchema.index({ user: 1, status: 1 });

export const WhatsAppSession = mongoose.model<IWhatsAppSession>('WhatsAppSession', WhatsAppSessionSchema);
