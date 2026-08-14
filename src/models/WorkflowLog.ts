import mongoose, { Schema, Document } from 'mongoose';

export type WorkflowLogStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface IWorkflowLog extends Document {
  workflow: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  trigger_type: 'CRON' | 'REPLY' | 'MANUAL';
  recipient_phone: string;
  session_id?: string;
  status: WorkflowLogStatus;
  message_id?: string;
  error_message?: string;
  trigger_details?: {
    incoming_text?: string;
    matched_keyword?: string;
    sender_name?: string;
    sender_phone?: string;
    schedule_expression?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowLogSchema = new Schema<IWorkflowLog>(
  {
    workflow: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trigger_type: {
      type: String,
      enum: ['CRON', 'REPLY', 'MANUAL'],
      required: true,
    },
    recipient_phone: { type: String, required: true },
    session_id: { type: String },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'SKIPPED'],
      required: true,
      default: 'SUCCESS',
    },
    message_id: { type: String },
    error_message: { type: String },
    trigger_details: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

WorkflowLogSchema.index({ workflow: 1, createdAt: -1 });
WorkflowLogSchema.index({ user: 1, createdAt: -1 });

export const WorkflowLog = mongoose.model<IWorkflowLog>('WorkflowLog', WorkflowLogSchema);
