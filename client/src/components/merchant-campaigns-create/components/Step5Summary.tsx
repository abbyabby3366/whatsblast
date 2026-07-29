import { useState } from 'react'
import { Rocket, Loader2, ArrowLeft, Save, Eye, Users, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { TemplateDraft } from '../types'

interface Step5Props {
  name: string
  templates?: TemplateDraft[]
  templateDrafts?: TemplateDraft[]
  userFiles?: any[]
  sessionMode: string
  selectedSessions: string[]
  recipients: string[]
  retryOnFailure?: boolean
  enableWarmup?: boolean
  editingCampaignId?: string | null
  setIsPhonePreviewOpen?: (v: boolean) => void
  setStep?: (step: number) => void
  deleteCampaignMutation?: any
  onBack?: () => void
  onSaveDraft?: () => void
  isSavingDraft?: boolean
  onSubmit?: () => void
  handleFinalSubmit?: () => void
  isSubmitting?: boolean
  isLaunching?: boolean
}

export function Step5Summary({
  name,
  templates: propsTemplates,
  templateDrafts: propsTemplateDrafts,
  sessionMode,
  selectedSessions,
  recipients,
  retryOnFailure: _retryOnFailure = true,
  enableWarmup: _enableWarmup = true,
  editingCampaignId,
  setIsPhonePreviewOpen,
  onBack,
  onSaveDraft,
  isSavingDraft,
  onSubmit,
  handleFinalSubmit,
  isSubmitting,
  isLaunching,
}: Step5Props) {
  const [isRecipientsModalOpen, setIsRecipientsModalOpen] = useState(false)
  const [recipientSearch, setRecipientSearch] = useState('')

  const templates = propsTemplates || propsTemplateDrafts || []
  const submitFn = handleFinalSubmit || onSubmit || (() => {})
  const isLoading = isLaunching || isSubmitting || false

  const filteredRecipients = recipients.filter((phone) =>
    !recipientSearch ? true : phone.toLowerCase().includes(recipientSearch.toLowerCase())
  )

  return (
    <>
      <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center font-bold">
                5
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">Review & Launch</h3>
                <p className="text-xs text-slate-500">Confirm your campaign settings before initiating the blast.</p>
              </div>
            </div>

            {setIsPhonePreviewOpen && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsPhonePreviewOpen(true)}
                className="text-xs gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" /> Preview Campaign Messages
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium">Campaign Name</span>
              <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{name || 'Untitled Campaign'}</div>
            </div>

            <button
              type="button"
              onClick={() => setIsRecipientsModalOpen(true)}
              className="p-4 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl space-y-1 text-left transition-colors cursor-pointer group w-full border border-slate-100 hover:border-emerald-300 dark:border-slate-800 dark:hover:border-emerald-700/50"
              title="Click to view recipient list"
            >
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Recipients</span>
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 group-hover:underline flex items-center gap-1">
                  <Eye className="w-3 h-3" /> View List
                </span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{recipients.length} Target Phone(s)</div>
            </button>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium">Message Sequence</span>
              <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{templates.length} Content(s)</div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium">Session Distribution</span>
              <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {sessionMode === 'ALL' || sessionMode === 'AUTO'
                  ? 'Auto Rotate All Connected'
                  : `${selectedSessions.length} Selected Session(s)`}
              </div>
            </div>
          </div>

          {/* Bottom Navigation Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              {onBack && (
                <Button type="button" variant="outline" size="sm" onClick={onBack} className="text-xs gap-1.5">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </Button>
              )}
              {onSaveDraft && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onSaveDraft}
                  disabled={isSavingDraft}
                  className="text-xs gap-1.5"
                >
                  {isSavingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Draft
                </Button>
              )}
            </div>

            <Button
              type="button"
              onClick={submitFn}
              disabled={isLoading || !name.trim() || recipients.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 text-xs px-6 gap-2 shadow-md"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              {editingCampaignId ? 'Update Campaign Settings' : 'Launch Campaign Blast Now'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recipients List Modal Pop-up */}
      <Dialog open={isRecipientsModalOpen} onOpenChange={setIsRecipientsModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-5">
          <DialogHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Target Recipients ({recipients.length})
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Recipient phone numbers scheduled for this campaign blast
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="relative pt-2">
            <Search className="absolute left-3 top-4 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search phone number..."
              value={recipientSearch}
              onChange={(e) => setRecipientSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
            {recipientSearch && (
              <button
                type="button"
                onClick={() => setRecipientSearch('')}
                className="absolute right-2.5 top-4 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto max-h-[320px] border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 my-2">
            {filteredRecipients.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">No matching phone numbers</div>
            ) : (
              filteredRecipients.map((phone, idx) => (
                <div
                  key={`${phone}-${idx}`}
                  className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-900/50"
                >
                  <span className="font-mono text-slate-400 text-[11px]">#{idx + 1}</span>
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">{phone}</span>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-4">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
