import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safeText(val: any, fallback = ''): string {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    if (typeof val.text === 'string' && val.text) return val.text
    if (typeof val.template === 'string' && val.template) return val.template
    if (typeof val.message === 'string' && val.message) return val.message
    if (typeof val.content === 'string' && val.content) return val.content
    if (typeof val.body === 'string' && val.body) return val.body
    if (typeof val.error === 'string' && val.error) return val.error
    if (typeof val.title === 'string' && val.title) return val.title
    try {
      return JSON.stringify(val)
    } catch {
      return fallback
    }
  }
  return String(val)
}

