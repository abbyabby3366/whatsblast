import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safeText(val: any, fallback = ''): string {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  let target = val
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        target = JSON.parse(trimmed)
      } catch {
        return val
      }
    } else {
      return val
    }
  }
  if (target && typeof target === 'object') {
    if (typeof target.text === 'string' && target.text.trim()) return target.text
    if (typeof target.template === 'string' && target.template.trim()) return target.template
    if (typeof target.message === 'string' && target.message.trim()) return target.message
    if (typeof target.caption === 'string' && target.caption.trim()) return target.caption
    if (typeof target.body === 'string' && target.body.trim()) return target.body
    if (typeof target.error === 'string' && target.error.trim()) return target.error
    if (typeof target.title === 'string' && target.title.trim()) return target.title
    if (typeof target.subtitle === 'string' && target.subtitle.trim()) return target.subtitle
    if (target.content) {
      const res = safeText(target.content, '')
      if (res) return res
    }
    if (target.file || target.file_url || target.media_url || target.image_url || target.url) {
      return '📷 [Media / Image]'
    }
    try {
      return JSON.stringify(target)
    } catch {
      return fallback
    }
  }
  return String(target)
}

