import mongoose, { Schema, Document } from 'mongoose';

export interface IMasterPhone extends Document {
  session: mongoose.Types.ObjectId;
  session_id: string;
  phone_number?: string;
  session_status?: string;
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MasterPhoneSchema = new Schema<IMasterPhone>(
  {
    session: { type: Schema.Types.ObjectId, ref: 'WhatsAppSession', required: true, index: true },
    session_id: { type: String },
    phone_number: { type: String },
    session_status: { type: String },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const MasterPhone = mongoose.model<IMasterPhone>('MasterPhone', MasterPhoneSchema);
