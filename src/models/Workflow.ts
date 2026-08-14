import mongoose, { Schema, Document } from 'mongoose';

export type TriggerType = 'CRON' | 'REPLY' | 'MANUAL';
export type MatchType = 'contains' | 'exact' | 'starts_with' | 'all';
export type ReplyTarget = 'SENDER' | 'MASTER_PHONE' | 'BOTH';
export type SessionMode = 'ALL' | 'SPECIFIC' | 'SAME_SESSION';

export interface ITriggerConfig {
  // CRON
  cron_expression?: string;
  schedule_type?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  schedule_params?: {
    minute?: number;
    hour?: number;
    day_of_week?: number;
    day_of_month?: number;
  };
  timezone?: string;

  // REPLY
  match_type?: MatchType;
  keywords?: string[];
  case_sensitive?: boolean;
  reply_session_mode?: 'SAME_SESSION' | 'SPECIFIC';
  reply_selected_sessions?: string[];
  filter_rapid_autoreplies?: boolean;

  // MANUAL
  note?: string;
}

export interface IActionConfig {
  // For Reply
  reply_target?: ReplyTarget;
  master_phones?: string[];
  reply_session_id?: string;

  // For Cron / Manual
  recipient_phones?: string[];
  session_mode?: 'ALL' | 'SPECIFIC';
  selected_sessions?: string[];
  min_interval_seconds?: number;
  max_interval_seconds?: number;
}

export interface IWorkflow extends Document {
  user: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  is_active: boolean;
  trigger_type: TriggerType;
  trigger_config: ITriggerConfig;
  action_config: IActionConfig;
  templates: Array<any>;
  stats: {
    triggered_count: number;
    sent_count: number;
    failed_count: number;
    last_run_at?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowSchema = new Schema<IWorkflow>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    is_active: { type: Boolean, default: true, index: true },
    trigger_type: {
      type: String,
      enum: ['CRON', 'REPLY', 'MANUAL'],
      required: true,
      index: true,
    },
    trigger_config: {
      cron_expression: { type: String },
      schedule_type: { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly', 'custom'] },
      schedule_params: { type: Schema.Types.Mixed },
      timezone: { type: String, default: 'UTC' },
      match_type: { type: String, enum: ['contains', 'exact', 'starts_with', 'all'] },
      keywords: [{ type: String }],
      case_sensitive: { type: Boolean, default: false },
      reply_session_mode: { type: String, enum: ['SAME_SESSION', 'SPECIFIC'], default: 'SAME_SESSION' },
      reply_selected_sessions: [{ type: String }],
      filter_rapid_autoreplies: { type: Boolean, default: false },
      note: { type: String },
    },
    action_config: {
      reply_target: { type: String, enum: ['SENDER', 'MASTER_PHONE', 'BOTH'] },
      master_phones: [{ type: String }],
      reply_session_id: { type: String },
      recipient_phones: [{ type: String }],
      session_mode: { type: String, enum: ['ALL', 'SPECIFIC'], default: 'ALL' },
      selected_sessions: [{ type: String }],
      min_interval_seconds: { type: Number, default: 10 },
      max_interval_seconds: { type: Number, default: 15 },
    },
    templates: [{ type: Schema.Types.Mixed }],
    stats: {
      triggered_count: { type: Number, default: 0 },
      sent_count: { type: Number, default: 0 },
      failed_count: { type: Number, default: 0 },
      last_run_at: { type: Date },
    },
  },
  { timestamps: true }
);

WorkflowSchema.index({ user: 1, trigger_type: 1 });
WorkflowSchema.index({ user: 1, is_active: 1 });

export const Workflow = mongoose.model<IWorkflow>('Workflow', WorkflowSchema);
