import React from 'react'
import { ArrowLeft, CheckCheck, FileText, Mic, MoreVertical, User as UserIcon, Video as VideoIcon } from 'lucide-react'
import dayjs from 'dayjs'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export interface WhatsAppPhonePreviewModalProps {
  campaign: any | null
  onClose: () => void
}

export const getCampaignTemplates = (campaign: any) => {
  if (Array.isArray(campaign?.templates) && campaign.templates.length > 0) return campaign.templates
  if (campaign?.template) return [campaign.template]
  return []
}

export const resolveTemplateMediaList = (template: any) => {
  const list: Array<{ url: string; type: string; name?: string }> = []
  if (Array.isArray(template?.files) && template.files.length > 0) {
    template.files.forEach((f: any) => {
      const url = typeof f === 'string' ? f : f?.file_url || f?.file_path || f?.url || f?.file || null
      const type = typeof f === 'object' ? f?.file_type || 'image' : 'image'
      const name = typeof f === 'object' ? f?.file_name : undefined
      if (url) list.push({ url, type: String(type).toLowerCase(), name })
    })
  }
  if (list.length === 0 && Array.isArray(template?.attachedFiles) && template.attachedFiles.length > 0) {
    template.attachedFiles.forEach((f: any) => {
      const url = f?.url || f?.file_url || f?.file_path || null
      const type = f?.type || 'image'
      const name = f?.name
      if (url) list.push({ url, type: String(type).toLowerCase(), name })
    })
  }
  if (list.length === 0 && template) {
    const fileObj = typeof template.file === 'object' ? template.file : {}
    const buttonImgObj = typeof template.button_image === 'object' ? template.button_image : {}
    const mediaUrl =
      fileObj.file_url ||
      fileObj.file_path ||
      fileObj.url ||
      buttonImgObj.file_url ||
      buttonImgObj.file_path ||
      buttonImgObj.url ||
      template.file_url ||
      template.button_image_url ||
      template.previewUrl ||
      (typeof template.file === 'string' && (template.file.startsWith('http') || template.file.startsWith('/'))
        ? template.file
        : '')
    const rawType = fileObj.file_type || template.type || template.messageType || (mediaUrl ? 'image' : 'text')
    const fileType = String(rawType).toLowerCase()
    if (mediaUrl) list.push({ url: mediaUrl, type: fileType, name: fileObj.file_name })
  }
  return list
}

export function WhatsAppPhonePreviewModal({ campaign, onClose }: WhatsAppPhonePreviewModalProps) {
  return (
    <Dialog open={Boolean(campaign)} onOpenChange={(open) => !open && onClose()}>
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
                        <div className="mb-1 rounded-md overflow-hidden bg-black/5 dark:bg-white/5 p-1 flex flex-wrap gap-1">
                          {mediaList.map((item, mIdx) => {
                            if (item.type === 'video') {
                              return <video key={mIdx} src={item.url} controls className="w-full h-auto max-h-48 bg-black rounded" />
                            }
                            return (
                              <img
                                key={mIdx}
                                src={item.url}
                                alt={`Media ${mIdx + 1}`}
                                className="h-16 w-16 object-cover rounded border border-black/10 dark:border-white/10"
                              />
                            )
                          })}
                        </div>
                      )}

                      <div className="mb-2 font-normal">
                        {template.text || template.template || (hasMedia ? '' : `[message]`)}
                      </div>

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
