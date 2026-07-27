import React from 'react'
import { Megaphone, ArrowRight, Save, Flame, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface Step1Props {
  name: string
  setName: (v: string) => void
  enableWarmup?: boolean
  setEnableWarmup?: (v: boolean) => void
  onNext: () => void
  onSaveDraft?: () => void
  isSavingDraft?: boolean
}

export function Step1CampaignDetails({
  name,
  setName,
  enableWarmup = true,
  setEnableWarmup,
  onNext,
  onSaveDraft,
  isSavingDraft,
}: Step1Props) {
  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center font-bold">
            1
          </div>
          <div>
            <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">Campaign Details</h3>
            <p className="text-xs text-slate-500">Give your campaign a memorable name for tracking and reporting.</p>
          </div>
        </div>

        <div className="space-y-4 max-w-lg">
          <div className="space-y-2">
            <Label htmlFor="campaign-name" className="text-sm font-medium">
              Campaign Name *
            </Label>
            <div className="relative">
              <Megaphone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <Input
                id="campaign-name"
                placeholder="e.g. Summer Promo Blast 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onNext()
                  }
                }}
                className="pl-9 text-sm"
                autoFocus
              />
            </div>
          </div>

          {setEnableWarmup && (
            <div className="flex items-start space-x-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-900/50">
              <input
                type="checkbox"
                id="warmup-mode"
                checked={enableWarmup}
                onChange={(e) => setEnableWarmup(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
              />
              <div className="space-y-1">
                <Label htmlFor="warmup-mode" className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  Enable Account Warmup Protection
                </Label>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Gradually ramps up sending frequency to reduce WhatsApp account restriction risks.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation Controls */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
          <div>
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
            onClick={onNext}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-5 h-9 gap-1.5 shadow-xs"
          >
            Next: Message Templates
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
