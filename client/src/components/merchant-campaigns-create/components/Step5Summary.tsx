import React from 'react'
import { Rocket, Loader2, ArrowLeft, Save, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  retryOnFailure = true,
  enableWarmup = true,
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
  const templates = propsTemplates || propsTemplateDrafts || []
  const submitFn = handleFinalSubmit || onSubmit || (() => {})
  const isLoading = isLaunching || isSubmitting || false

  return (
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

          <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-1">
            <span className="text-slate-400 font-medium">Recipients</span>
            <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{recipients.length} Target Phone(s)</div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-1">
            <span className="text-slate-400 font-medium">Message Sequence</span>
            <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{templates.length} Variant(s)</div>
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
  )
}
