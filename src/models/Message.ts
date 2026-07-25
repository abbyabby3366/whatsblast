import mongoose, { Schema, Document } from 'mongoose';

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum MessageStatus {
  QUEUED = 'queued',
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
    wa_timestamp: { type: Date },
  },
  { timestamps: true }
);

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
