import mongoose, { Schema, Document } from 'mongoose';

export interface IOTP extends Document {
  phone_number: string;
  code: string;
  expiresAt: Date;
  createdAt: Date;
}

const OTPSchema = new Schema<IOTP>(
  {
    phone_number: { type: String, required: true, index: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true }
);

export const OTP = mongoose.model<IOTP>('OTP', OTPSchema);
