import React, { useState } from 'react'
import { Upload, Search, Trash2, CheckSquare, Loader2, ArrowLeft, ArrowRight, Save, UserCheck, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface Step4Props {
  recipients: string[]
  setRecipients: React.Dispatch<React.SetStateAction<string[]>>
  searchTerm?: string
  setSearchTerm?: (v: string) => void
  setIsCsvModalOpen?: (v: boolean) => void
  onOpenCsvModal?: () => void
  handleSelectAllMatching?: () => void
  onSelectAllMatching?: () => void
  isSelectingAllCustomers?: boolean
  isSelectingAll?: boolean
  allMatchingCustomersSelected?: boolean
  isLoadingCustomers?: boolean
  currentCustomers?: any[]
  onBack?: () => void
  onNext?: () => void
  onSaveDraft?: () => void
  isSavingDraft?: boolean
}

export function Step4Recipients({
  recipients,
  setRecipients,
  searchTerm = '',
  setSearchTerm,
  setIsCsvModalOpen,
  onOpenCsvModal,
  handleSelectAllMatching,
  onSelectAllMatching,
  isSelectingAllCustomers,
  isSelectingAll,
  allMatchingCustomersSelected,
  isLoadingCustomers,
  currentCustomers = [],
  onBack,
  onNext,
  onSaveDraft,
  isSavingDraft,
}: Step4Props) {
  const [manualText, setManualText] = useState('')

  const openCsv = onOpenCsvModal || (() => setIsCsvModalOpen?.(true))
  const selectAllMatching = handleSelectAllMatching || onSelectAllMatching || (() => {})
  const isSelecting = isSelectingAllCustomers || isSelectingAll || false

  const handleAddManual = () => {
    if (!manualText.trim()) return
    const newPhones = manualText
      .split(/[\n,]/)
      .map((p) => p.replace(/[^\d+]/g, '').trim())
      .filter(Boolean)

    const updated = Array.from(new Set([...recipients, ...newPhones]))
    setRecipients(updated)
    setManualText('')
  }

  const toggleRecipient = (phone: string) => {
    if (recipients.includes(phone)) {
      setRecipients(recipients.filter((p) => p !== phone))
    } else {
      setRecipients([...recipients, phone])
    }
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
      <CardContent className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center font-bold">
              4
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
                Recipients ({recipients.length})
              </h3>
              <p className="text-xs text-slate-500">Select target customer contacts or import phone numbers.</p>
            </div>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={openCsv} className="text-xs gap-1.5">
            <Upload className="w-3.5 h-3.5 text-emerald-600" /> Import CSV
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Customer Contacts List */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Search Customer Contacts</Label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <Input
                  placeholder="Search name or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm?.(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={allMatchingCustomersSelected ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={selectAllMatching}
                    disabled={isSelecting}
                    className="w-full text-xs gap-1.5 h-8"
                  >
                    {isSelecting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    {allMatchingCustomersSelected ? 'Deselect All Matching Customers' : 'Select All Customers Matching Search'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {allMatchingCustomersSelected
                    ? 'Click to deselect all matching recipients'
                    : searchTerm
                    ? `Select all contacts matching "${searchTerm}" across all pages`
                    : 'Select all contacts in your database as recipients'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 rounded-lg border border-slate-200 dark:border-slate-800 p-2 bg-slate-50/50 dark:bg-slate-900/50">
              {isLoadingCustomers ? (
                <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading customer list...
                </div>
              ) : currentCustomers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">No customers found.</div>
              ) : (
                currentCustomers.map((customer: any) => {
                  const phone = customer.phone_number || customer.phone || ''
                  if (!phone) return null
                  const isSelected = recipients.includes(phone)
                  return (
                    <div
                      key={customer.id || phone}
                      onClick={() => toggleRecipient(phone)}
                      className={`p-2 rounded-md flex items-center justify-between cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 font-semibold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="truncate">
                        <span className="font-medium">{customer.name || 'Unnamed'}</span>
                        <span className="text-slate-400 font-mono ml-2">({phone})</span>
                      </div>
                      {isSelected ? (
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Right Column: Manual Input & Selected Counter */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Manual Phone Entry</Label>
              <div className="space-y-2">
                <Textarea
                  placeholder="Enter phone numbers separated by comma or newline (e.g. 60123456789)..."
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  rows={4}
                  className="text-xs font-mono"
                />
                <Button type="button" size="sm" onClick={handleAddManual} className="w-full text-xs h-8 bg-slate-800 hover:bg-slate-900 text-white">
                  Add Manual Phone Numbers
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {recipients.length} phone number(s) targeted
              </span>
              {recipients.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRecipients([])}
                  className="text-xs text-red-500 hover:text-red-700 h-7 px-2"
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Clear List
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Navigation Controls */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
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

          {onNext && (
            <Button
              type="button"
              onClick={onNext}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-5 h-9 gap-1.5 shadow-xs"
            >
              Next: Campaign Summary
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
