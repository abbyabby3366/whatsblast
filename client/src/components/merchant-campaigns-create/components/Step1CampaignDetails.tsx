import React from 'react'
import { Megaphone, ArrowRight, Save, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface Step1Props {
  name: string
  setName: (v: string) => void
  onNext: () => void
  onSaveDraft?: () => void
  isSavingDraft?: boolean
}

export function Step1CampaignDetails({
  name,
  setName,
  onNext,
  onSaveDraft,
  isSavingDraft,
}: Step1Props) {
  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
      <CardContent className="p-6 space-y-6">
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
