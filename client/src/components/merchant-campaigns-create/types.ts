export type ButtonDraft = {
  id: string
  type: 'reply' | 'url' | 'call' | 'copy'
  display_text: string
  value?: string
}

export type AttachedFile = {
  id: string
  url: string | null
  name?: string
  type?: string
  size?: number
}

export type TemplateDraft = {
  id?: string
  messageType: string
  template: string
  footer?: string
  fileId: string
  attachedFiles?: AttachedFile[]
  buttons: ButtonDraft[]
  buttonMediaType: string
  previewUrl: string | null
}

export const formatFileSize = (bytes?: number | string | null): string => {
  if (bytes === undefined || bytes === null || bytes === '') return ''
  const num = typeof bytes === 'string' ? parseFloat(bytes) : bytes
  if (isNaN(num) || num <= 0) return ''
  if (num < 1024) return `${num} B`
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`
  return `${(num / (1024 * 1024)).toFixed(2)} MB`
}

export type MediaReq = {
  type: 'image' | 'video' | 'document'
  title: string
  preferredSizeText: string
  preferredMaxBytes: number
  hardMaxBytes: number
  formats: string
  recommendation: string
  notes: string
}

export const MEDIA_REQUIREMENTS: Record<string, MediaReq> = {
  image: {
    type: 'image',
    title: 'Image Requirements',
    preferredSizeText: '< 5 MB (Ideal: 1–3 MB)',
    preferredMaxBytes: 5 * 1024 * 1024,
    hardMaxBytes: 16 * 1024 * 1024,
    formats: 'JPG, JPEG, PNG, WEBP',
    recommendation: 'Aspect Ratio: 1:1 or 16:9',
    notes: '',
  },
  video: {
    type: 'video',
    title: 'Video Requirements',
    preferredSizeText: '< 16 MB',
    preferredMaxBytes: 16 * 1024 * 1024,
    hardMaxBytes: 16 * 1024 * 1024,
    formats: 'MP4 (H.264), 3GP, MOV',
    recommendation: '720p/1080p | Duration: < 90s',
    notes: '',
  },
  document: {
    type: 'document',
    title: 'Document Requirements',
    preferredSizeText: '< 10 MB',
    preferredMaxBytes: 10 * 1024 * 1024,
    hardMaxBytes: 100 * 1024 * 1024,
    formats: 'PDF, DOC, DOCX, XLS, XLSX, TXT',
    recommendation: 'PDF format recommended for mobile compatibility',
    notes: '',
  },
}

export const DRAFT_STORAGE_KEY = 'whatsblast_campaign_draft'

export const createEmptyTemplateDraft = (): TemplateDraft => ({
  messageType: 'text',
  template: '',
  footer: '',
  fileId: '',
  attachedFiles: [],
  buttons: [],
  buttonMediaType: 'none',
  previewUrl: null,
})

export const isTemplateTextRequired = (tmpl: TemplateDraft) => {
  const isMedia = ['image', 'video', 'document'].includes(tmpl.messageType)
  const hasFiles = Boolean((tmpl.attachedFiles && tmpl.attachedFiles.length > 0) || tmpl.fileId || tmpl.previewUrl)
  if (isMedia || hasFiles) return false
  return true
}

export const isTemplateComplete = (tmpl: TemplateDraft) => {
  const isMedia = ['image', 'video', 'document'].includes(tmpl.messageType)
  const hasFiles = Boolean((tmpl.attachedFiles && tmpl.attachedFiles.length > 0) || tmpl.fileId || tmpl.previewUrl)
  if (isMedia && !hasFiles) return false
  if (isTemplateTextRequired(tmpl) && !tmpl.template.trim()) return false
  return true
}

export const filePreviewUrl = (fileObj: any, buttonImageObj?: any) =>
  fileObj?.file_path ||
  fileObj?.file ||
  fileObj?.url ||
  fileObj?.file_url ||
  fileObj?.image ||
  fileObj?.video ||
  fileObj?.document ||
  buttonImageObj?.file_path ||
  buttonImageObj?.file ||
  buttonImageObj?.url ||
  buttonImageObj?.file_url ||
  buttonImageObj?.image ||
  null

export const normalizeButtonType = (type?: string): ButtonDraft['type'] => {
  if (type === 'cta_url') return 'url'
  if (type === 'cta_call') return 'call'
  if (type === 'cta_copy') return 'copy'
  if (type === 'url' || type === 'call' || type === 'copy') return type
  return 'reply'
}

export const resolveDraftMediaList = (tmpl: TemplateDraft, userFiles?: any[]) => {
  const list: Array<{ id?: string; url: string; type: string; name?: string; size?: number }> = []
  const currentMediaType = tmpl.messageType === 'buttons' ? tmpl.buttonMediaType : tmpl.messageType

  if (tmpl.attachedFiles && tmpl.attachedFiles.length > 0) {
    tmpl.attachedFiles.forEach((f) => {
      const matched = userFiles?.find((uf: any) => uf.id === f.id || uf._id === f.id)
      const url = f.url || matched?.file_path || matched?.url || matched?.file_url || matched?.file || null
      const type = f.type || currentMediaType || matched?.file_type || 'image'
      const name = f.name || matched?.file_name || 'Attachment'
      const size = f.size ?? matched?.file_size ?? matched?.size
      if (url) list.push({ id: f.id, url, type: String(type).toLowerCase(), name, size })
    })
  } else if (tmpl.fileId || tmpl.previewUrl) {
    const matched = userFiles?.find((uf: any) => uf.id === tmpl.fileId || uf._id === tmpl.fileId)
    const url = tmpl.previewUrl || matched?.file_path || matched?.url || matched?.file_url || matched?.file || null
    const type = currentMediaType || matched?.file_type || 'image'
    const name = matched?.file_name || 'Attachment'
    const size = matched?.file_size ?? matched?.size
    if (url) list.push({ id: tmpl.fileId, url, type: String(type).toLowerCase(), name, size })
  }

  return list
}

export const buildTemplatePayload = (tmpl: TemplateDraft) => {
  const isMedia = ['image', 'video', 'document'].includes(tmpl.messageType)
  const isButtons = tmpl.messageType === 'buttons'

  const file_ids = (tmpl.attachedFiles || []).map((f) => f.id).filter(Boolean)
  if (tmpl.fileId && !file_ids.includes(tmpl.fileId)) file_ids.push(tmpl.fileId)

  return {
    template: isMedia || isButtons ? (tmpl.template.trim() || undefined) : tmpl.template.trim(),
    message_type: tmpl.messageType,
    footer_text: tmpl.footer?.trim() || undefined,
    footer: tmpl.footer?.trim() || undefined,
    file_id: file_ids[0] || undefined,
    file_ids: file_ids.length > 0 ? file_ids : undefined,
    buttons: isButtons && tmpl.buttons.length > 0
      ? tmpl.buttons.map((b) => ({
          type: b.type,
          display_text: b.display_text.trim(),
          ...(b.type === 'url' ? { url: b.value?.trim() } : {}),
          ...(b.type === 'call' ? { phone_number: b.value?.trim() } : {}),
          ...(b.type === 'copy' ? { copy_code: b.value?.trim() } : {}),
        }))
      : undefined,
  }
}
