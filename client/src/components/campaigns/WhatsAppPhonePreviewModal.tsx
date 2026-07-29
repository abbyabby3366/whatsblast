import { ArrowLeft, CheckCheck, Mic, MoreVertical, User as UserIcon } from 'lucide-react'
import dayjs from 'dayjs'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { safeText } from '@/lib/utils'

export interface WhatsAppPhonePreviewModalProps {
  isOpen?: boolean
  onClose: () => void
  title?: string
  campaign?: any | null
  templates?: any[]
}

const getCampaignTemplates = (campaign: any) => {
  if (Array.isArray(campaign?.templates) && campaign.templates.length > 0) return campaign.templates
  if (campaign?.template) return [campaign.template]
  return []
}

const formatMediaUrl = (u: any): string => {
  if (!u || typeof u !== 'string') return ''
  const trimmed = u.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed
  }
  if (trimmed.startsWith('/')) return trimmed
  return `/${trimmed}`
}

const resolveTemplateMediaList = (template: any) => {
  const list: Array<{ url: string; type: string; name?: string }> = []
  if (!template) return list

  const seenUrls = new Set<string>()

  const addMedia = (rawUrl: any, rawType?: any, name?: string) => {
    if (!rawUrl) return
    if (typeof rawUrl === 'object' && rawUrl !== null) {
      const u = rawUrl.file_url || rawUrl.file_path || rawUrl.url || rawUrl.file || rawUrl.previewUrl
      const t = rawUrl.file_type || rawUrl.type || rawType || 'image'
      const n = rawUrl.file_name || rawUrl.name || name
      if (u) addMedia(u, t, n)
      return
    }
    const url = formatMediaUrl(rawUrl)
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url)
      const type = String(rawType || 'image').toLowerCase()
      list.push({ url, type, name })
    }
  }

  // 1. Inspect template.content if present
  if (template.content && typeof template.content === 'object') {
    const cnt = template.content
    if (Array.isArray(cnt.files)) cnt.files.forEach((f: any) => addMedia(f))
    if (Array.isArray(cnt.attachedFiles)) cnt.attachedFiles.forEach((f: any) => addMedia(f))
    if (Array.isArray(cnt.mediaList)) cnt.mediaList.forEach((f: any) => addMedia(f))
    addMedia(cnt.file, cnt.file_type || cnt.type)
    addMedia(cnt.button_image, 'image')
    addMedia(cnt.file_url, cnt.file_type || cnt.type)
    addMedia(cnt.media_url, cnt.file_type || cnt.type)
    addMedia(cnt.image_url, cnt.file_type || cnt.type)
  }

  // 2. Array properties: files, attachedFiles, media, attachments
  if (Array.isArray(template.files)) {
    template.files.forEach((f: any) => addMedia(f))
  }

  if (Array.isArray(template.attachedFiles)) {
    template.attachedFiles.forEach((f: any) => addMedia(f))
  }

  if (Array.isArray(template.mediaList)) {
    template.mediaList.forEach((f: any) => addMedia(f))
  }

  // 3. Objects containing media array
  if (template.media && typeof template.media === 'object') {
    if (Array.isArray(template.media.files)) {
      template.media.files.forEach((f: any) => addMedia(f))
    }
  }

  if (template.custom_fields && typeof template.custom_fields === 'object') {
    const c = template.custom_fields
    addMedia(c.url, c.file_type || c.type || template.type)
  }

  // 4. Single objects or strings on template
  if (template.file) {
    addMedia(template.file, template.type || template.messageType)
  }

  if (template.button_image) {
    addMedia(template.button_image, 'image')
  }

  // 5. Direct properties on template
  addMedia(template.file_url, template.type || template.messageType)
  addMedia(template.media_url, template.type || template.messageType)
  addMedia(template.image_url, template.type || template.messageType)
  addMedia(template.previewUrl, template.type || template.messageType)
  addMedia(template.button_image_url, 'image')
  if (typeof template.url === 'string' && !template.url.startsWith('http') && (template.url.includes('/') || template.url.includes('.'))) {
    addMedia(template.url, template.type)
  }

  return list
}

export function WhatsAppPhonePreviewModal({ isOpen, campaign, templates, title, onClose }: WhatsAppPhonePreviewModalProps) {
  const activeCampaign = campaign || { name: title, templates: templates }
  const isModalOpen = isOpen !== undefined ? isOpen : Boolean(campaign || (templates && templates.length > 0))

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md bg-transparent border-none shadow-none p-0 flex justify-center">
        <DialogTitle className="sr-only">Message Preview</DialogTitle>
        <DialogDescription className="sr-only">WhatsApp UI Message Preview</DialogDescription>

        <div className="w-[340px] h-[650px] border-[14px] border-slate-900 rounded-[3rem] overflow-hidden relative shadow-2xl flex flex-col bg-[#efeae2] dark:bg-[#0b141a]">
          <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-20 pointer-events-none">
            <div className="w-32 h-6 bg-slate-900 rounded-b-2xl"></div>
          </div>

          <div className="bg-[#008069] dark:bg-[#202c33] text-white pt-8 pb-3 px-2 flex items-center gap-2 z-10 shadow-xs shrink-0">
            <button
              onClick={onClose}
              className="flex items-center justify-center p-1 -ml-1 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
              aria-label="Back"
            >
              <ArrowLeft className="w-[22px] h-[22px] text-white" />
            </button>
            <div className="w-10 h-10 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
              <UserIcon className="w-6 h-6 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="flex flex-col flex-1 min-w-0 ml-1">
              <span className="font-semibold text-[16px] truncate leading-tight">
                {activeCampaign?.recipient_phones?.[0] || activeCampaign?.contacts?.[0] || activeCampaign?.name || title || 'Sample Contact'}
              </span>
              <span className="text-xs text-white/80 font-medium">online</span>
            </div>
            <MoreVertical className="w-5 h-5 text-white/90 shrink-0" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative z-10">
            <div className="flex justify-center my-2">
              <span className="bg-[#e1f3fb]/90 dark:bg-[#182229]/90 text-[#54656f] dark:text-[#8696a0] text-xs px-3 py-1.5 rounded-lg shadow-xs font-medium uppercase tracking-wide text-[10px]">
                {activeCampaign?.created_at || activeCampaign?.createdAt
                  ? dayjs(activeCampaign.created_at || activeCampaign.createdAt).format('MMMM D, YYYY')
                  : 'Today'}
              </span>
            </div>

            {activeCampaign && (() => {
              const tmpls = getCampaignTemplates(activeCampaign)
              const displayTemplates = tmpls.length > 0 ? tmpls : (templates && templates.length > 0 ? templates : [{ text: 'No template content' }])

              return displayTemplates.map((template: any, idx: number) => {
                const mediaList = resolveTemplateMediaList(template)
                const hasMedia = mediaList.length > 0
                const rawText =
                  template.text ||
                  template.template ||
                  template.body ||
                  (typeof template.content === 'object'
                    ? template.content?.text || template.content?.template || template.content?.body
                    : typeof template.content === 'string'
                    ? template.content
                    : '')
                const mainText = safeText(rawText, hasMedia ? '' : '[message]')

                const rawFooter =
                  template.footer ||
                  template.footer_text ||
                  template.footerText ||
                  (typeof template.content === 'object'
                    ? template.content?.footer || template.content?.footer_text || template.content?.footerText
                    : '')
                const footerText = safeText(rawFooter, '')

                const rawButtons =
                  template.buttons ||
                  (typeof template.content === 'object' ? template.content?.buttons : null) ||
                  []
                const buttons = Array.isArray(rawButtons) ? rawButtons : []

                return (
                  <div key={idx} className="space-y-1">
                    {displayTemplates.length > 1 && (
                      <div className="text-[10px] font-semibold text-slate-500 text-right pr-1">
                        Template {idx + 1}
                      </div>
                    )}
                    <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-lg rounded-tr-none p-2 max-w-[85%] ml-auto relative shadow-[0_1px_0.5px_rgba(11,20,26,.13)] break-words whitespace-pre-wrap text-[14px] leading-[19px]">
                      {hasMedia && (
                        <div className="mb-1 rounded-md overflow-hidden bg-black/5 dark:bg-white/5 p-1">
                          {mediaList.length === 1 ? (
                            mediaList[0].type === 'video' ? (
                              <video src={mediaList[0].url} controls className="w-full h-auto max-h-48 bg-black rounded" />
                            ) : (
                              <img
                                src={mediaList[0].url}
                                alt={mediaList[0].name || 'Media'}
                                loading="eager"
                                decoding="async"
                                className="w-full h-auto max-h-52 object-cover rounded border border-black/10 dark:border-white/10"
                              />
                            )
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {mediaList.map((item, mIdx) => {
                                if (item.type === 'video') {
                                  return <video key={mIdx} src={item.url} controls className="w-24 h-24 object-cover bg-black rounded" />
                                }
                                return (
                                  <img
                                    key={mIdx}
                                    src={item.url}
                                    alt={item.name || `Media ${mIdx + 1}`}
                                    loading="eager"
                                    decoding="async"
                                    className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-md border border-black/10 dark:border-white/10 shrink-0"
                                  />
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {mainText ? (
                        <div className="mb-1 font-normal">
                          {mainText}
                        </div>
                      ) : null}

                      {footerText ? (
                        <div className="text-[12px] text-[#667781] dark:text-[#8696a0] mt-1 italic border-t border-black/5 dark:border-white/5 pt-1">
                          {footerText}
                        </div>
                      ) : null}

                      {buttons?.length ? (
                        <div className="clear-both mt-2 space-y-1 border-t border-black/10 pt-1 dark:border-white/10">
                          {buttons.map((button: any, bIdx: number) => {
                            let parsedParams: any = {}
                            if (typeof button === 'object' && button !== null && typeof button.buttonParamsJson === 'string') {
                              try {
                                parsedParams = JSON.parse(button.buttonParamsJson)
                              } catch (_) {}
                            }
                            const label = typeof button === 'string'
                              ? button
                              : safeText(
                                  button?.displayText || button?.display_text || button?.text || button?.title || button?.label || parsedParams?.display_text || button?.value,
                                  `Button ${bIdx + 1}`
                                )
                            const val = typeof button === 'object' && button !== null
                              ? safeText(
                                  button.value || button.url || button.phone_number || button.copy_code || parsedParams.url || parsedParams.phone_number || parsedParams.copy_code,
                                  ''
                                )
                              : ''
                            return (
                              <div
                                key={button?.id || bIdx}
                                className="rounded-md bg-white/70 px-3 py-2 text-center text-sm font-medium text-[#027eb5] shadow-xs dark:bg-[#111b21]/50 dark:text-[#53bdeb] flex flex-col items-center justify-center cursor-pointer hover:bg-white/90 dark:hover:bg-[#111b21]/70 transition-colors"
                              >
                                <span>{label}</span>
                                {val && val !== label && (
                                  <span className="text-[10px] opacity-75 truncate max-w-full font-normal">{val}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : null}

                      <div className="flex justify-end items-center gap-1 float-right mt-1 ml-2">
                        <span className="text-[11px] text-[#667781] dark:text-[#8696a0]">
                          12:00
                        </span>
                        <CheckCheck className="w-[15px] h-[15px] text-[#53bdeb]" />
                      </div>
                    </div>
                  </div>
                )
              })
            })()}
          </div>

          <div className="bg-[#f0f2f5] dark:bg-[#202c33] px-2 py-2.5 flex items-center gap-2 z-10 shrink-0 pb-6 sm:pb-3 border-t border-black/5 dark:border-white/5">
            <div className="flex-1 bg-white dark:bg-[#2a3942] h-10 rounded-full flex items-center px-4 shadow-xs border border-transparent dark:border-white/5">
              <span className="text-[#8696a0] text-[15px]">Message</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center shrink-0 shadow-xs text-white">
              <Mic className="w-5 h-5 fill-current" />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
