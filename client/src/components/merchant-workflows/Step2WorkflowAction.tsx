import { useState } from 'react'
import {
  Sparkles,
  Users,
  Smartphone,
  Plus,
  Trash2,
  Phone,
  FileSpreadsheet,
  Check,
  Search,
  MessageSquare,
  AlertCircle,
  HelpCircle,
  Clock,
  ShieldCheck,
  ExternalLink,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import type { TriggerType, IActionConfig } from './types'
import type { TemplateDraft, AttachedFile } from '@/components/merchant-campaigns-create/types'
import { Step2MessageTemplates } from '@/components/merchant-campaigns-create/components/Step2MessageTemplates'
import { CsvImportModal } from '@/components/merchant-campaigns-create/components/CsvImportModal'

interface Step2WorkflowActionProps {
  triggerType: TriggerType
  templates: TemplateDraft[]
  setTemplates: (drafts: TemplateDraft[] | ((prev: TemplateDraft[]) => TemplateDraft[])) => void
  activeTemplateIndex: number
  setActiveTemplateIndex: (idx: number) => void
  actionConfig: IActionConfig
  setActionConfig: (cfg: IActionConfig | ((prev: IActionConfig) => IActionConfig)) => void
  recipients: string[]
  setRecipients: (rcps: string[] | ((prev: string[]) => string[])) => void
  customers: any[]
  availableSessions: any[]
  userFiles?: any[]
}

export function Step2WorkflowAction({
  triggerType,
  templates,
  setTemplates,
  activeTemplateIndex,
  setActiveTemplateIndex,
  actionConfig,
  setActionConfig,
  recipients,
  setRecipients,
  customers,
  availableSessions,
  userFiles,
}: Step2WorkflowActionProps) {
  const [recipientInput, setRecipientInput] = useState('')
  const [masterPhoneInput, setMasterPhoneInput] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [isVariablesOpen, setIsVariablesOpen] = useState(false)

  const isReplyTrigger = triggerType === 'REPLY'
  const replyTarget = actionConfig.reply_target || 'SENDER'

  const handleAddManualRecipient = () => {
    const raw = recipientInput.trim()
    if (!raw) return
    const numbers = raw
      .split(/[\n,;]+/)
      .map((s) => s.replace(/[^0-9]/g, ''))
      .filter((s) => s.length >= 8)

    if (numbers.length > 0) {
      setRecipients((prev) => Array.from(new Set([...prev, ...numbers])))
      setRecipientInput('')
    }
  }

  const handleAddMasterPhone = () => {
    const raw = masterPhoneInput.trim().replace(/[^0-9]/g, '')
    if (raw && raw.length >= 8) {
      const current = actionConfig.master_phones || []
      if (!current.includes(raw)) {
        setActionConfig((prev) => ({
          ...prev,
          master_phones: [...(prev.master_phones || []), raw],
        }))
      }
      setMasterPhoneInput('')
    }
  }

  const handleRemoveMasterPhone = (phone: string) => {
    setActionConfig((prev) => ({
      ...prev,
      master_phones: (prev.master_phones || []).filter((p) => p !== phone),
    }))
  }

  const filteredCustomers = customers.filter((c) => {
    const term = customerSearch.toLowerCase()
    return (
      (c.phone_number && c.phone_number.includes(term)) ||
      (c.name && c.name.toLowerCase().includes(term))
    )
  })

  return (
    <div className="space-y-4">
      {/* Step 2 Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[11px]">
              2
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Message Content & Templates
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 pl-7">
            Compose message text with Spintax, attachments, dynamic variables, and interactive buttons.
          </p>
        </div>

        {/* Rich Template Editor */}
        <Step2MessageTemplates
          templateDrafts={templates}
          setTemplateDrafts={setTemplates}
          activeTemplateIndex={activeTemplateIndex}
          setActiveTemplateIndex={setActiveTemplateIndex}
          userFiles={userFiles}
        />

        {/* Dynamic variable injection tags helper for Reply Trigger (Inside Collapsible Accordion under Message Content) */}
        {isReplyTrigger && (
          <div className="border border-sky-200 dark:border-sky-800/80 rounded-xl overflow-hidden bg-sky-50/40 dark:bg-sky-950/20">
            <button
              type="button"
              onClick={() => setIsVariablesOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-sky-900 dark:text-sky-200 hover:bg-sky-100/60 dark:hover:bg-sky-900/40 transition-colors select-none"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>Available Dynamic Variables for Reply Trigger</span>
                <span className="text-[10px] text-slate-500 font-normal">({isVariablesOpen ? 'Click to collapse' : 'Click to expand'})</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-sky-600 transition-transform duration-200 ${
                  isVariablesOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isVariablesOpen && (
              <div className="p-3 pt-1 border-t border-sky-200/60 dark:border-sky-800/60 space-y-2">
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Click any tag below to insert it directly into your active message template:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { tag: '{sender_name}', label: 'Sender WhatsApp Name' },
                    { tag: '{sender_phone}', label: 'Sender Phone Number' },
                    { tag: '{incoming_message}', label: 'Original Message' },
                    { tag: '{time}', label: 'Current Time (HH:mm)' },
                    { tag: '{date}', label: 'Current Date (YYYY-MM-DD)' },
                  ].map(({ tag, label }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        const currentDraft = templates[activeTemplateIndex]
                        if (currentDraft) {
                          const updated = [...templates]
                          updated[activeTemplateIndex] = {
                            ...currentDraft,
                            template: (currentDraft.template || '') + ` ${tag} `,
                          }
                          setTemplates(updated)
                        }
                      }}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-300 text-xs font-mono font-medium hover:bg-sky-100 dark:hover:bg-sky-900 transition-colors shadow-2xs flex items-center gap-1"
                      title={`Insert ${label}`}
                    >
                      <span>{tag}</span>
                      <span className="text-[10px] text-slate-400 font-sans">({label})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recipient & Action Settings */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isReplyTrigger ? 'Reply Delivery & Recipient Target' : 'Target Recipients & Delivery Intervals'}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {isReplyTrigger
              ? 'Configure whether to reply back to the sender, notify Master phone(s), or both.'
              : 'Choose which contacts receive this automated message and set the interval delays.'}
          </p>
        </div>

        {/* REPLY TRIGGER ACTIONS */}
        {isReplyTrigger ? (
          <div className="space-y-3.5">
            {/* Target Options */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Action Target
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'SENDER',
                    title: '1. Reply to Sender',
                    desc: 'Sends automated response directly back to the contact who texted.',
                  },
                  {
                    id: 'MASTER_PHONE',
                    title: '2. Alert Master Phone(s)',
                    desc: 'Forwards notification formatted with sender details to master numbers.',
                  },
                  {
                    id: 'BOTH',
                    title: '3. Both (Reply & Alert)',
                    desc: 'Replies to the sender AND immediately alerts master phone(s).',
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    onClick={() =>
                      setActionConfig((prev) => ({ ...prev, reply_target: item.id as any }))
                    }
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      replyTarget === item.id
                        ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30 ring-2 ring-emerald-600/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white">{item.title}</h4>
                      {replyTarget === item.id && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Master Phone Input (if MASTER_PHONE or BOTH) */}
            {(replyTarget === 'MASTER_PHONE' || replyTarget === 'BOTH') && (
              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Master Phone Number(s) to Receive Notification
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter phone with country code (e.g. 60123456789)"
                    value={masterPhoneInput}
                    onChange={(e) => setMasterPhoneInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddMasterPhone()
                      }
                    }}
                    className="text-xs bg-white dark:bg-slate-900"
                  />
                  <Button type="button" size="sm" onClick={handleAddMasterPhone} className="text-xs h-9">
                    Add Number
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {(actionConfig.master_phones || []).map((phone) => (
                    <Badge
                      key={phone}
                      variant="secondary"
                      className="gap-1.5 py-1 px-2.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    >
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{phone}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMasterPhone(phone)}
                        className="text-slate-400 hover:text-rose-500 font-bold ml-1"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                  {(actionConfig.master_phones || []).length === 0 && (
                    <span className="text-xs text-rose-500 font-medium">
                      ⚠️ Please add at least one Master phone number.
                    </span>
                  )}
                </div>

                {/* Live Master Notification Format Preview */}
                <div className="mt-3 p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Master Notification Preview:
                  </span>
                  <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2.5 rounded whitespace-pre-wrap">
                    {`🔔 *Message Alert*\n\n*Sender:* John Doe (60123456789)\n*Recipient WhatsApp Session:* Main Line (60198765432)\n*Contact link:* https://wa.me/60123456789\n\n*Message content:*\nHi, how much is this item? (Original incoming message from customer)`}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* CRON & MANUAL TRIGGER ACTIONS */
          <div className="space-y-6">
            {/* Interval settings */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>Sending Interval (Random Delay per Message)</span>
                </Label>
                <span className="text-xs font-bold text-emerald-600 font-mono">
                  {actionConfig.min_interval_seconds || 10}s – {actionConfig.max_interval_seconds || 15}s
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[11px] text-slate-500">Min Interval (sec)</span>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={actionConfig.min_interval_seconds || 10}
                    onChange={(e) =>
                      setActionConfig((prev) => ({
                        ...prev,
                        min_interval_seconds: Math.max(1, parseInt(e.target.value, 10) || 5),
                      }))
                    }
                    className="h-8 text-xs font-mono bg-white dark:bg-slate-900 mt-1"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-500">Max Interval (sec)</span>
                  <Input
                    type="number"
                    min={2}
                    max={120}
                    value={actionConfig.max_interval_seconds || 15}
                    onChange={(e) =>
                      setActionConfig((prev) => ({
                        ...prev,
                        max_interval_seconds: Math.max(
                          prev.min_interval_seconds || 5,
                          parseInt(e.target.value, 10) || 10
                        ),
                      }))
                    }
                    className="h-8 text-xs font-mono bg-white dark:bg-slate-900 mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Session Mode Selector */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Sending WhatsApp Sessions
              </Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="wf_session_mode"
                    checked={(actionConfig.session_mode || 'ALL') === 'ALL'}
                    onChange={() =>
                      setActionConfig((prev) => ({ ...prev, session_mode: 'ALL' }))
                    }
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Distribute across all connected WhatsApp sessions</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="wf_session_mode"
                    checked={actionConfig.session_mode === 'SPECIFIC'}
                    onChange={() =>
                      setActionConfig((prev) => ({ ...prev, session_mode: 'SPECIFIC' }))
                    }
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Select specific sessions only</span>
                </label>
              </div>

              {actionConfig.session_mode === 'SPECIFIC' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  {availableSessions.map((s) => {
                    const isSelected = (actionConfig.selected_sessions || []).includes(s.session_id)
                    return (
                      <div
                        key={s.session_id}
                        onClick={() => {
                          const curr = actionConfig.selected_sessions || []
                          const updated = isSelected
                            ? curr.filter((id) => id !== s.session_id)
                            : [...curr, s.session_id]
                          setActionConfig((prev) => ({ ...prev, selected_sessions: updated }))
                        }}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 font-semibold'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{s.phone_number || s.session_id}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 ml-auto" />}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Recipient Selection (Manual, Customers, CSV) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Target Contacts ({recipients.length} selected)
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCsvModalOpen(true)}
                    className="text-xs h-7 gap-1"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    Import CSV
                  </Button>
                  {recipients.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setRecipients([])}
                      className="text-xs h-7 text-rose-500 hover:text-rose-600"
                    >
                      Clear All
                    </Button>
                  )}
                </div>
              </div>

              {/* Direct manual number input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Type or paste numbers separated by commas or linebreaks (e.g. 60123456789)"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddManualRecipient()
                    }
                  }}
                  className="text-xs bg-white dark:bg-slate-900"
                />
                <Button type="button" size="sm" onClick={handleAddManualRecipient} className="text-xs h-9">
                  Add
                </Button>
              </div>

              {/* Customer Selector dropdown / list */}
              {customers.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-900 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Pick from Customer Directory:
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const allPhones = customers.map((c) => c.phone_number.replace(/[^0-9]/g, ''))
                        setRecipients((prev) => Array.from(new Set([...prev, ...allPhones])))
                      }}
                      className="text-[11px] h-6 text-emerald-600"
                    >
                      Select All Customers ({customers.length})
                    </Button>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Search customers..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="h-8 pl-8 text-xs bg-slate-50 dark:bg-slate-800/50"
                    />
                  </div>

                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredCustomers.slice(0, 30).map((c) => {
                      const clean = c.phone_number.replace(/[^0-9]/g, '')
                      const isSelected = recipients.includes(clean)
                      return (
                        <div
                          key={c.id || clean}
                          onClick={() => {
                            setRecipients((prev) =>
                              isSelected ? prev.filter((p) => p !== clean) : [...prev, clean]
                            )
                          }}
                          className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded cursor-pointer text-xs"
                        >
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{c.name || 'Unnamed'}</span>
                            <span className="text-slate-400 font-mono ml-2">{c.phone_number}</span>
                          </div>
                          {isSelected ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">
                              Selected
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-slate-400">+ Add</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CSV Import Modal */}
      {isCsvModalOpen && (
        <CsvImportModal
          isOpen={isCsvModalOpen}
          onClose={() => setIsCsvModalOpen(false)}
          onImport={(importedPhones) => {
            setRecipients((prev) => Array.from(new Set([...prev, ...importedPhones])))
            setIsCsvModalOpen(false)
          }}
        />
      )}
    </div>
  )
}
