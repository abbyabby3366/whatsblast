import React from 'react'
import { Megaphone } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Step1Props {
  name: string
  setName: (v: string) => void
  onNext: () => void
}

export function Step1CampaignDetails({ name, setName, onNext }: Step1Props) {
  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            1
          </div>
          <div>
            <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">Campaign Details</h3>
            <p className="text-xs text-slate-500">Give your campaign a memorable name for tracking and reporting.</p>
          </div>
        </div>

        <div className="space-y-2 max-w-lg">
          <Label htmlFor="campaign-name" className="text-sm font-medium">Campaign Name *</Label>
          <div className="relative">
            <Megaphone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input
              id="campaign-name"
              placeholder="e.g. Summer Promo Blast 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
