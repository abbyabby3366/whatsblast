export type User = { id?: string; _id?: string; phone_number?: string; role?: string }

export type Campaign = {
  id: string
  name?: string
  status?: string
  user?: string | User
  created_at?: string
  createdAt?: string
  completed_at?: string
  completedAt?: string
  updatedAt?: string
  recipient_phones?: string[]
  contacts?: any[]
  templates?: Array<any>
  template?: any
  min_interval_seconds?: number
  max_interval_seconds?: number
  enable_warmup?: boolean
  retry_on_failure?: boolean
  error_message?: string
  current_index?: number
  stats?: { total?: number; sent?: number; failed?: number }
}

export type FormState = {
  id?: string
  name: string
  user: string
  recipient_phones: string
  text: string
  enable_warmup: boolean
  retry_on_failure: boolean
}

export const emptyForm: FormState = {
  name: '',
  user: '',
  recipient_phones: '',
  text: '',
  enable_warmup: true,
  retry_on_failure: true,
}

export function rows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && 'results' in data) return (data as { results?: T[] }).results ?? []
  return []
}

export function owner(user: Campaign['user'], allUsers?: User[]) {
  if (!user) return '-'
  if (typeof user === 'object' && user.phone_number) return user.phone_number
  const uId = typeof user === 'string' ? user : user.id || user._id || ''
  if (uId && allUsers) {
    const found = allUsers.find((u) => u.id === uId || u._id === uId)
    if (found?.phone_number) return found.phone_number
  }
  return uId || '-'
}

export function ownerId(user: Campaign['user']) {
  if (!user) return ''
  if (typeof user === 'string') return user
  return user.id || user._id || ''
}

export const defaultFilters = { search: '', status: 'all', user: 'all', ordering: '-created_at' }
