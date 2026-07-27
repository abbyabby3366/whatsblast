import mongoose, { Schema, Document } from 'mongoose';

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum MessageStatus {
  QUEUED = 'queued',
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  RECEIVED = 'received',
}

export interface IMessage extends Document {
  session?: mongoose.Types.ObjectId;
  campaign?: mongoose.Types.ObjectId;
  message_id?: string;
  direction: MessageDirection;
  type: string;
  status: MessageStatus;
  sender_phone?: string;
  recipient_phone?: string;
  from_jid?: string;
  to_jid?: string;
  push_name?: string;
  template?: mongoose.Types.ObjectId;
  content?: Record<string, any>;
  error?: string;
  retry_count?: number;
  scheduled_at?: Date;
  sent_at?: Date;
  wa_timestamp?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    session: { type: Schema.Types.ObjectId, ref: 'WhatsAppSession', index: true },
    campaign: { type: Schema.Types.ObjectId, ref: 'BlastCampaign', index: true },
    message_id: { type: String, index: true },
    direction: { type: String, enum: Object.values(MessageDirection), required: true },
    type: { type: String, default: 'text' },
    status: { type: String, enum: Object.values(MessageStatus), default: MessageStatus.QUEUED },
    sender_phone: { type: String },
    recipient_phone: { type: String },
    from_jid: { type: String },
    to_jid: { type: String },
    push_name: { type: String },
    template: { type: Schema.Types.ObjectId, ref: 'MessageTemplate' },
    content: { type: Schema.Types.Mixed, default: {} },
    error: { type: String },
    retry_count: { type: Number, default: 0 },
    scheduled_at: { type: Date, index: true },
    sent_at: { type: Date },
    wa_timestamp: { type: Date },
  },
  { timestamps: true }
);

MessageSchema.index({ session: 1, wa_timestamp: -1 });
MessageSchema.index({ campaign: 1, status: 1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
