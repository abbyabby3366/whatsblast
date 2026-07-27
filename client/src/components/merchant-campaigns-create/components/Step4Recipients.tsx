import React from 'react'
import { Users, Upload, Search, Trash2, CheckSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Step4Props {
  recipients: string[]
  setRecipients: React.Dispatch<React.SetStateAction<string[]>>
  manualRecipientsText: string
  setManualRecipientsText: (v: string) => void
  selectedLabelFilter: string
  setSelectedLabelFilter: (v: string) => void
  availableLabels: string[]
  searchTerm: string
  setSearchTerm: (v: string) => void
  onOpenCsvModal: () => void
  onSelectAllMatching: () => void
  isSelectingAll: boolean
}

export function Step4Recipients({
  recipients,
  setRecipients,
  manualRecipientsText,
  setManualRecipientsText,
  selectedLabelFilter,
  setSelectedLabelFilter,
  availableLabels,
  searchTerm,
  setSearchTerm,
  onOpenCsvModal,
  onSelectAllMatching,
  isSelectingAll,
}: Step4Props) {
  const handleAddManual = () => {
    if (!manualRecipientsText.trim()) return
    const newPhones = manualRecipientsText
      .split(/[\n,]/)
      .map((p) => p.replace(/[^\d+]/g, '').trim())
      .filter(Boolean)

    const updated = Array.from(new Set([...recipients, ...newPhones]))
    setRecipients(updated)
    setManualRecipientsText('')
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              4
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">Recipients ({recipients.length})</h3>
              <p className="text-xs text-slate-500">Select target customer contacts or import phone numbers.</p>
            </div>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={onOpenCsvModal} className="text-xs gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Filter & Select */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Filter Customer Contacts</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <Input
                    placeholder="Search name or phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9 text-xs"
                  />
                </div>
                <Select value={selectedLabelFilter} onValueChange={setSelectedLabelFilter}>
                  <SelectTrigger className="w-36 h-9 text-xs">
                    <SelectValue placeholder="All Labels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Labels</SelectItem>
                    {availableLabels.map((lbl) => (
                      <SelectItem key={lbl} value={lbl}>{lbl}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSelectAllMatching}
              disabled={isSelectingAll}
              className="w-full text-xs gap-1.5"
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
              Select All Customers Matching Search
            </Button>
          </div>

          {/* Right Column: Manual Input & Recipient List */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Manual Phone Entry</Label>
              <div className="space-y-2">
                <Textarea
                  placeholder="Enter phone numbers separated by comma or newline (e.g. 60123456789)..."
                  value={manualRecipientsText}
                  onChange={(e) => setManualRecipientsText(e.target.value)}
                  rows={3}
                  className="text-xs font-mono"
                />
                <Button type="button" size="sm" onClick={handleAddManual} className="w-full text-xs">
                  Add Manual Phones
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">{recipients.length} phone(s) selected</span>
              {recipients.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRecipients([])}
                  className="text-xs text-red-500 hover:text-red-700 h-7"
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Clear List
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
