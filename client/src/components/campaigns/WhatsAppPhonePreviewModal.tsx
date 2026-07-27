import React from 'react'
import { ArrowLeft, CheckCheck, Mic, MoreVertical, User as UserIcon } from 'lucide-react'
import dayjs from 'dayjs'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export interface WhatsAppPhonePreviewModalProps {
  isOpen?: boolean
  onClose: () => void
  title?: string
  campaign?: any | null
  templates?: any[]
}

export const getCampaignTemplates = (campaign: any) => {
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

export const resolveTemplateMediaList = (template: any) => {
  const list: Array<{ url: string; type: string; name?: string }> = []
  if (!template) return list

  const seenUrls = new Set<string>()

  const addMedia = (rawUrl: any, rawType?: any, name?: string) => {
    if (!rawUrl) return
    const url = formatMediaUrl(rawUrl)
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url)
      const type = String(rawType || 'image').toLowerCase()
      list.push({ url, type, name })
    }
  }

  // 1. Array properties: files, attachedFiles, media, attachments
  if (Array.isArray(template.files)) {
    template.files.forEach((f: any) => {
      if (typeof f === 'string') addMedia(f, 'image')
      else if (f && typeof f === 'object') {
        addMedia(f.file_url || f.file_path || f.url || f.file, f.file_type || f.type || 'image', f.file_name || f.name)
      }
    })
  }

  if (Array.isArray(template.attachedFiles)) {
    template.attachedFiles.forEach((f: any) => {
      if (typeof f === 'string') addMedia(f, 'image')
      else if (f && typeof f === 'object') {
        addMedia(f.url || f.file_url || f.file_path || f.file, f.type || f.file_type || 'image', f.name || f.file_name)
      }
    })
  }

  if (Array.isArray(template.mediaList)) {
    template.mediaList.forEach((f: any) => {
      if (typeof f === 'string') addMedia(f, 'image')
      else if (f && typeof f === 'object') {
        addMedia(f.url || f.file_url || f.file_path || f.file, f.type || f.file_type || 'image', f.name || f.file_name)
      }
    })
  }

  // 2. Objects containing media array
  if (template.media && typeof template.media === 'object') {
    if (Array.isArray(template.media.files)) {
      template.media.files.forEach((f: any) => addMedia(f.url || f.file_path || f, f.type || 'image', f.name))
    }
  }

  if (template.custom_fields && typeof template.custom_fields === 'object') {
    const c = template.custom_fields
    addMedia(c.url, c.file_type || c.type || template.type)
  }

  // 3. Single objects or strings on template
  if (template.file) {
    if (typeof template.file === 'string') addMedia(template.file, template.type || template.messageType)
    else if (typeof template.file === 'object') {
      addMedia(template.file.file_url || template.file.file_path || template.file.url || template.file.file, template.file.file_type || template.file.type || template.type, template.file.file_name)
    }
  }

  if (template.button_image) {
    if (typeof template.button_image === 'string') addMedia(template.button_image, 'image')
    else if (typeof template.button_image === 'object') {
      addMedia(template.button_image.file_url || template.button_image.file_path || template.button_image.url, 'image', template.button_image.file_name)
    }
  }

  // 4. Direct properties on template
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
                {campaign?.recipient_phones?.[0] || campaign?.contacts?.[0] || campaign?.name || 'Sample Contact'}
              </span>
              <span className="text-xs text-white/80 font-medium">online</span>
            </div>
            <MoreVertical className="w-5 h-5 text-white/90 shrink-0" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative z-10">
            <div className="flex justify-center my-2">
              <span className="bg-[#e1f3fb]/90 dark:bg-[#182229]/90 text-[#54656f] dark:text-[#8696a0] text-xs px-3 py-1.5 rounded-lg shadow-xs font-medium uppercase tracking-wide text-[10px]">
                {campaign?.created_at || campaign?.createdAt
                  ? dayjs(campaign.created_at || campaign.createdAt).format('MMMM D, YYYY')
                  : 'Today'}
              </span>
            </div>

            {campaign && (() => {
              const templates = getCampaignTemplates(campaign)
              const displayTemplates = templates.length > 0 ? templates : [{ text: 'No template content' }]

              return displayTemplates.map((template: any, idx: number) => {
                const mediaList = resolveTemplateMediaList(template)
                const hasMedia = mediaList.length > 0

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

                      {(template.text || template.template || !hasMedia) && (
                        <div className="mb-1 font-normal">
                          {template.text || template.template || '[message]'}
                        </div>
                      )}

                      {template.footer ? (
                        <div className="text-[12px] text-[#667781] dark:text-[#8696a0] mt-1 italic border-t border-black/5 dark:border-white/5 pt-1">
                          {template.footer}
                        </div>
                      ) : null}

                      {template.buttons?.length ? (
                        <div className="clear-both mt-2 space-y-1 border-t border-black/10 pt-1 dark:border-white/10">
                          {template.buttons.map((button: any, bIdx: number) => {
                            const label = button.displayText || button.display_text || button.text || button.title || button.value || `Button ${bIdx + 1}`
                            const val = button.value || button.url || button.phone_number || button.copy_code || ''
                            return (
                              <div
                                key={button.id || bIdx}
                                className="rounded-md bg-white/70 px-3 py-2 text-center text-sm font-medium text-[#027eb5] shadow-xs dark:bg-[#111b21]/50 dark:text-[#53bdeb] flex flex-col items-center justify-center"
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
