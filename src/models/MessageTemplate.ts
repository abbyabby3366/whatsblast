import mongoose, { Schema, Document } from 'mongoose';

export interface IMessageTemplate extends Document {
  user: mongoose.Types.ObjectId;
  name: string;
  type: string;
  text?: string;
  file?: mongoose.Types.ObjectId;
  payload?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const MessageTemplateSchema = new Schema<IMessageTemplate>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, default: 'text' },
    text: { type: String },
    file: { type: Schema.Types.ObjectId, ref: 'File' },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const MessageTemplate = mongoose.model<IMessageTemplate>('MessageTemplate', MessageTemplateSchema);
