export type Message = {
  id: string
  direction: string
  message_type: string
  sender_phone?: string | null
  recipient_phone?: string | null
  from_jid?: string | null
  to_jid?: string | null
  user?: any
  template?: {
    text: string | null
    file?: any
    button_image?: any
    buttons?: any[]
  } | null
  created_at: string
  scheduled_at?: string | null
  scheduled_datetime?: string | null
  sent_at?: string | null
  status: string
  session_phone?: string | null
  [key: string]: any
}
