import mongoose, { Schema, Document } from 'mongoose';

export interface ICustomer extends Document {
  merchant: mongoose.Types.ObjectId;
  phone_number: string;
  name?: string;
  notes?: string;
  custom_data?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    merchant: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    phone_number: { type: String, required: true },
    name: { type: String },
    notes: { type: String },
    custom_data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

CustomerSchema.index({ merchant: 1, phone_number: 1 }, { unique: true });

export const Customer = mongoose.model<ICustomer>('Customer', CustomerSchema);
