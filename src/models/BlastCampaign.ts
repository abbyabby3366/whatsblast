import mongoose, { Schema, Document } from 'mongoose';

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface IBlastCampaign extends Document {
  user: mongoose.Types.ObjectId;
  name: string;
  template?: mongoose.Types.ObjectId;
  templates?: Array<any>;
  contacts: string[];
  recipient_phones?: string[];
  status: CampaignStatus;
  min_interval_seconds: number;
  max_interval_seconds: number;
  enable_warmup: boolean;
  scheduled_at?: Date;
  started_at?: Date;
  completed_at?: Date;
  current_index: number;
  stats: {
    total: number;
    sent: number;
    failed: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const BlastCampaignSchema = new Schema<IBlastCampaign>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    template: { type: Schema.Types.ObjectId, ref: 'MessageTemplate' },
    templates: [{ type: Schema.Types.Mixed }],
    contacts: [{ type: String }],
    recipient_phones: [{ type: String }],
    status: { type: String, enum: Object.values(CampaignStatus), default: CampaignStatus.DRAFT },
    min_interval_seconds: { type: Number, default: 10 },
    max_interval_seconds: { type: Number, default: 15 },
    enable_warmup: { type: Boolean, default: false },
    scheduled_at: { type: Date },
    started_at: { type: Date },
    completed_at: { type: Date },
    current_index: { type: Number, default: 0 },
    stats: {
      total: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const BlastCampaign = mongoose.model<IBlastCampaign>('BlastCampaign', BlastCampaignSchema);
