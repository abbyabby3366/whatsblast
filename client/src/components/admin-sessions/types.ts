export type User = { id: string; phone_number?: string; role?: string }

export type Session = {
  id: string
  session_id?: string
  phone_number?: string
  alias?: string
  labels?: string[]
  status?: string
  user?: string | User
  warmup_schedule?: number[]
  max_message_count_per_day?: number
  min_interval_seconds?: number
  max_interval_seconds?: number
  active_start_time?: string
  active_end_time?: string
  last_phone_activity_at?: string
  last_physical_phone_sent_message_at?: string
  created_at?: string
}

export type MasterPhone = {
  id: string
  session: string
  session_id?: string
  session_status?: string
  phone_number?: string
  is_active: boolean
  created_at?: string
}

export function rows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && 'results' in data) return (data as { results?: T[] }).results ?? []
  return []
}

export function ownerDisplay(user: Session['user']) {
  if (!user) return '-'
  if (typeof user === 'string') return user
  return user.phone_number ? `${user.phone_number} (${user.role || 'user'})` : user.id
}

export function ownerId(user: Session['user']) {
  if (!user) return ''
  if (typeof user === 'string') return user
  return user.id
}
