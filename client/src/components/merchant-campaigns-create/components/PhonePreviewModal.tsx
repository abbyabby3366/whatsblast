import type { TemplateDraft } from '../types'
import { resolveDraftMediaList } from '../types'
import { WhatsAppPhonePreviewModal } from '@/components/campaigns/WhatsAppPhonePreviewModal'

interface PhonePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  templates?: TemplateDraft[]
  templateDrafts?: TemplateDraft[]
  campaignName?: string
  name?: string
  userFiles?: any[]
}

export function PhonePreviewModal({
  isOpen,
  onClose,
  templates,
  templateDrafts,
  campaignName,
  name,
  userFiles = [],
}: PhonePreviewModalProps) {
  const activeTemplates = templates || templateDrafts || []
  const titleText = campaignName || name || 'Campaign Preview'

  const formattedTemplates = activeTemplates.map((tmpl) => {
    const mediaList = resolveDraftMediaList(tmpl, userFiles)
    return {
      message_type: tmpl.messageType,
      template: tmpl.template,
      text: tmpl.template,
      footer_text: tmpl.footer,
      buttons: tmpl.buttons,
      mediaList,
      file_url: mediaList[0]?.url || tmpl.previewUrl,
    }
  })

  return (
    <WhatsAppPhonePreviewModal
      isOpen={isOpen}
      onClose={onClose}
      templates={formattedTemplates}
      title={titleText}
    />
  )
}
