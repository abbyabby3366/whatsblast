import React from 'react'
import { Rocket, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { TemplateDraft } from '../types'

interface Step5Props {
  name: string
  templates: TemplateDraft[]
  sessionMode: string
  selectedSessions: string[]
  recipients: string[]
  onSubmit: () => void
  isSubmitting: boolean
  isEditMode?: boolean
}

export function Step5Summary({
  name,
  templates,
  sessionMode,
  selectedSessions,
  recipients,
  onSubmit,
  isSubmitting,
  isEditMode,
}: Step5Props) {
  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            5
          </div>
          <div>
            <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">Review & Launch</h3>
            <p className="text-xs text-slate-500">Confirm your campaign settings before initiating the blast.</p>
          </div>
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
              {sessionMode === 'AUTO' ? 'Auto Rotate All Connected' : `${selectedSessions.length} Selected Session(s)`}
            </div>
          </div>
        </div>

        <Button
          onClick={onSubmit}
          disabled={isSubmitting || !name.trim() || recipients.length === 0}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 text-sm gap-2 shadow-md"
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Rocket className="w-5 h-5" />
          )}
          {isEditMode ? 'Update Campaign Settings' : 'Launch Campaign Blast Now'}
        </Button>
      </CardContent>
    </Card>
  )
}
