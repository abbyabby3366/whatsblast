import type { TemplateDraft } from '@/components/merchant-campaigns-create/types'

export type TriggerType = 'CRON' | 'REPLY' | 'MANUAL'
export type MatchType = 'contains' | 'exact' | 'starts_with' | 'all'
export type ReplyTarget = 'SENDER' | 'MASTER_PHONE' | 'BOTH'
export type SessionMode = 'ALL' | 'SPECIFIC' | 'SAME_SESSION'

export interface ITriggerConfig {
  // CRON
  cron_expression?: string
  schedule_type?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'
  schedule_params?: {
    minute?: number
    hour?: number
    day_of_week?: number
    day_of_month?: number
  }
  timezone?: string

  // REPLY
  match_type?: MatchType
  keywords?: string[]
  case_sensitive?: boolean
  reply_session_mode?: 'SAME_SESSION' | 'SPECIFIC'
  reply_selected_sessions?: string[]
  filter_rapid_autoreplies?: boolean

  // MANUAL
  note?: string
}

export interface IActionConfig {
  // For Reply
  reply_target?: ReplyTarget
  master_phones?: string[]
  reply_session_id?: string

  // For Cron / Manual
  recipient_phones?: string[]
  session_mode?: 'ALL' | 'SPECIFIC'
  selected_sessions?: string[]
  min_interval_seconds?: number
  max_interval_seconds?: number
}

export interface WorkflowItem {
  id: string
  _id?: string
  name: string
  description?: string
  is_active: boolean
  trigger_type: TriggerType
  trigger_config: ITriggerConfig
  action_config: IActionConfig
  templates: TemplateDraft[]
  stats: {
    triggered_count: number
    sent_count: number
    failed_count: number
    last_run_at?: string
  }
  createdAt: string
  updatedAt: string
}

export interface WorkflowLogItem {
  id: string
  workflow: string
  trigger_type: TriggerType
  recipient_phone: string
  session_id?: string
  session_display?: string
  session_alias?: string
  session_phone?: string
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  message_id?: string
  error_message?: string
  trigger_details?: {
    incoming_text?: string
    matched_keyword?: string
    sender_name?: string
    sender_phone?: string
    schedule_expression?: string
  }
  createdAt: string
}
