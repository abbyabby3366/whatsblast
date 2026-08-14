import { useState, useEffect } from 'react'
import {
  Clock,
  MessageSquareReply,
  PlayCircle,
  Sparkles,
  Info,
  Calendar,
  Layers,
  Check,
  Smartphone,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { TriggerType, MatchType, ITriggerConfig } from './types'

interface Step1WorkflowTriggerProps {
  name: string
  setName: (v: string) => void
  description: string
  setDescription: (v: string) => void
  isActive: boolean
  setIsActive: (v: boolean) => void
  triggerType: TriggerType
  setTriggerType: (v: TriggerType) => void
  triggerConfig: ITriggerConfig
  setTriggerConfig: (v: ITriggerConfig | ((prev: ITriggerConfig) => ITriggerConfig)) => void
  availableSessions: any[]
}

export function Step1WorkflowTrigger({
  name,
  setName,
  description,
  setDescription,
  isActive,
  setIsActive,
  triggerType,
  setTriggerType,
  triggerConfig,
  setTriggerConfig,
  availableSessions,
}: Step1WorkflowTriggerProps) {
  const [keywordInput, setKeywordInput] = useState('')

  const scheduleType = triggerConfig.schedule_type || 'daily'
  const scheduleHour = triggerConfig.schedule_params?.hour ?? 9
  const scheduleMinute = triggerConfig.schedule_params?.minute ?? 0
  const scheduleDayOfWeek = triggerConfig.schedule_params?.day_of_week ?? 1
  const scheduleDayOfMonth = triggerConfig.schedule_params?.day_of_month ?? 1

  const computeCron = (
    type: string,
    hour: number,
    minute: number,
    dow: number,
    dom: number
  ): string => {
    switch (type) {
      case 'hourly':
        return `${minute} * * * *`
      case 'daily':
        return `${minute} ${hour} * * *`
      case 'weekly':
        return `${minute} ${hour} * * ${dow}`
      case 'monthly':
        return `${minute} ${hour} ${dom} * *`
      default:
        return triggerConfig.cron_expression || `${minute} ${hour} * * *`
    }
  }

  const handleSchedulePresetChange = (type: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom') => {
    if (type === 'custom') {
      setTriggerConfig((prev) => ({
        ...prev,
        schedule_type: 'custom',
        cron_expression: prev.cron_expression || '0 9 * * *',
      }))
    } else {
      const generated = computeCron(type, scheduleHour, scheduleMinute, scheduleDayOfWeek, scheduleDayOfMonth)
      setTriggerConfig((prev) => ({
        ...prev,
        schedule_type: type,
        cron_expression: generated,
        schedule_params: {
          hour: scheduleHour,
          minute: scheduleMinute,
          day_of_week: scheduleDayOfWeek,
          day_of_month: scheduleDayOfMonth,
        },
      }))
    }
  }

  const updateScheduleParam = (key: string, val: number) => {
    const nextHour = key === 'hour' ? val : scheduleHour
    const nextMinute = key === 'minute' ? val : scheduleMinute
    const nextDow = key === 'day_of_week' ? val : scheduleDayOfWeek
    const nextDom = key === 'day_of_month' ? val : scheduleDayOfMonth

    const generated = computeCron(scheduleType, nextHour, nextMinute, nextDow, nextDom)

    setTriggerConfig((prev) => ({
      ...prev,
      cron_expression: generated,
      schedule_params: {
        hour: nextHour,
        minute: nextMinute,
        day_of_week: nextDow,
        day_of_month: nextDom,
      },
    }))
  }

  const handleAddKeyword = () => {
    const trimmed = keywordInput.trim()
    if (!trimmed) return
    const current = triggerConfig.keywords || []
    if (!current.includes(trimmed)) {
      setTriggerConfig((prev) => ({
        ...prev,
        keywords: [...(prev.keywords || []), trimmed],
      }))
    }
    setKeywordInput('')
  }

  const handleRemoveKeyword = (kw: string) => {
    setTriggerConfig((prev) => ({
      ...prev,
      keywords: (prev.keywords || []).filter((k) => k !== kw),
    }))
  }

  return (
    <div className="space-y-4">
      {/* Workflow General Info */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Workflow Information</h3>
            <p className="text-[11px] text-slate-500">Give your automated workflow a recognizable name and description.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {isActive ? 'Active' : 'Inactive'}
            </span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Workflow Name <span className="text-rose-500">*</span>
            </Label>
            <Input
              placeholder="e.g. Daily Promo Blast or Support Auto-Reply"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-xs h-9"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Description (Optional)
            </Label>
            <Input
              placeholder="Brief note on what this workflow automates..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-xs h-9"
            />
          </div>
        </div>
      </div>

      {/* Step 1: Trigger Selection */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[11px]">
              1
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Choose Trigger Event
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 pl-7">
            Select what condition initiates this workflow action.
          </p>
        </div>

        {/* 3 Trigger Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Reply Trigger */}
          <div
            onClick={() => {
              setTriggerType('REPLY')
              if (!triggerConfig.match_type) {
                setTriggerConfig((prev) => ({
                  ...prev,
                  match_type: 'contains',
                  keywords: [],
                  reply_session_mode: 'SAME_SESSION',
                }))
              }
            }}
            className={`relative rounded-xl p-4 border-2 cursor-pointer transition-all ${
              triggerType === 'REPLY'
                ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30 ring-2 ring-emerald-600/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-950/80 text-sky-600 flex items-center justify-center">
                <MessageSquareReply className="w-5 h-5" />
              </div>
              {triggerType === 'REPLY' && (
                <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">1. Reply Trigger</h4>
            <p className="text-xs text-slate-500 mt-1">
              Triggers when a customer messages your WhatsApp number matching keywords or any text.
            </p>
          </div>

          {/* Cron Trigger */}
          <div
            onClick={() => {
              setTriggerType('CRON')
              if (!triggerConfig.cron_expression) {
                setTriggerConfig((prev) => ({
                  ...prev,
                  schedule_type: 'daily',
                  cron_expression: '0 9 * * *',
                }))
              }
            }}
            className={`relative rounded-xl p-4 border-2 cursor-pointer transition-all ${
              triggerType === 'CRON'
                ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30 ring-2 ring-emerald-600/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/80 text-amber-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              {triggerType === 'CRON' && (
                <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">2. Cron Trigger</h4>
            <p className="text-xs text-slate-500 mt-1">
              Runs automatically on a scheduled recurring timer or interval (Hourly, Daily, Weekly, Custom).
            </p>
          </div>

          {/* Manual Trigger */}
          <div
            onClick={() => setTriggerType('MANUAL')}
            className={`relative rounded-xl p-4 border-2 cursor-pointer transition-all ${
              triggerType === 'MANUAL'
                ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30 ring-2 ring-emerald-600/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/80 text-purple-600 flex items-center justify-center">
                <PlayCircle className="w-5 h-5" />
              </div>
              {triggerType === 'MANUAL' && (
                <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">3. Manual Trigger</h4>
            <p className="text-xs text-slate-500 mt-1">
              Triggered on-demand when you click "Run Now" or call via system API.
            </p>
          </div>
        </div>

        {/* Trigger Deep-dive Configuration */}
        {triggerType === 'CRON' && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Cron Schedule Settings
            </h4>

            {/* Schedule Presets */}
            <div className="flex flex-wrap gap-1.5">
              {(['hourly', 'daily', 'weekly', 'monthly', 'custom'] as const).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={scheduleType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSchedulePresetChange(type)}
                  className="capitalize text-xs h-7 px-3"
                >
                  {type}
                </Button>
              ))}
            </div>

            {/* Hourly Settings */}
            {scheduleType === 'hourly' && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  Run every hour at minute:
                </span>
                <select
                  value={scheduleMinute}
                  onChange={(e) => updateScheduleParam('minute', parseInt(e.target.value, 10))}
                  className="h-8 px-2 rounded-md border text-xs bg-white dark:bg-slate-900"
                >
                  {[0, 15, 30, 45].map((m) => (
                    <option key={m} value={m}>
                      :{m < 10 ? `0${m}` : m}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Daily Settings */}
            {scheduleType === 'daily' && (
              <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  Run every day at:
                </span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={scheduleHour}
                    onChange={(e) => updateScheduleParam('hour', parseInt(e.target.value, 10))}
                    className="h-8 px-2 rounded-md border text-xs bg-white dark:bg-slate-900 font-mono"
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>
                        {h < 10 ? `0${h}` : h}:00
                      </option>
                    ))}
                  </select>
                  <span>:</span>
                  <select
                    value={scheduleMinute}
                    onChange={(e) => updateScheduleParam('minute', parseInt(e.target.value, 10))}
                    className="h-8 px-2 rounded-md border text-xs bg-white dark:bg-slate-900 font-mono"
                  >
                    {[0, 10, 15, 20, 30, 45].map((m) => (
                      <option key={m} value={m}>
                        {m < 10 ? `0${m}` : m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Weekly Settings */}
            {scheduleType === 'weekly' && (
              <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Every:</span>
                <select
                  value={scheduleDayOfWeek}
                  onChange={(e) => updateScheduleParam('day_of_week', parseInt(e.target.value, 10))}
                  className="h-8 px-2 rounded-md border text-xs bg-white dark:bg-slate-900"
                >
                  <option value={1}>Monday</option>
                  <option value={2}>Tuesday</option>
                  <option value={3}>Wednesday</option>
                  <option value={4}>Thursday</option>
                  <option value={5}>Friday</option>
                  <option value={6}>Saturday</option>
                  <option value={0}>Sunday</option>
                </select>
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">at</span>
                <select
                  value={scheduleHour}
                  onChange={(e) => updateScheduleParam('hour', parseInt(e.target.value, 10))}
                  className="h-8 px-2 rounded-md border text-xs bg-white dark:bg-slate-900 font-mono"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>
                      {h < 10 ? `0${h}` : h}:00
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Monthly Settings */}
            {scheduleType === 'monthly' && (
              <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">On Day:</span>
                <select
                  value={scheduleDayOfMonth}
                  onChange={(e) => updateScheduleParam('day_of_month', parseInt(e.target.value, 10))}
                  className="h-8 px-2 rounded-md border text-xs bg-white dark:bg-slate-900"
                >
                  {Array.from({ length: 31 }).map((_, d) => (
                    <option key={d + 1} value={d + 1}>
                      {d + 1}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">at</span>
                <select
                  value={scheduleHour}
                  onChange={(e) => updateScheduleParam('hour', parseInt(e.target.value, 10))}
                  className="h-8 px-2 rounded-md border text-xs bg-white dark:bg-slate-900 font-mono"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>
                      {h < 10 ? `0${h}` : h}:00
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Custom Cron Expression */}
            {scheduleType === 'custom' && (
              <div className="space-y-1.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Standard 5-Part Cron Expression
                </Label>
                <Input
                  value={triggerConfig.cron_expression || ''}
                  onChange={(e) =>
                    setTriggerConfig((prev) => ({ ...prev, cron_expression: e.target.value }))
                  }
                  placeholder="e.g. */10 * * * * or 0 9 * * 1-5"
                  className="font-mono text-xs h-9"
                />
                <p className="text-[10px] text-slate-500">
                  Format: <code>minute hour day-of-month month day-of-week</code> (e.g. <code>0 9 * * 1</code> for every Monday at 09:00).
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                Active Cron Expression: <strong className="font-mono text-amber-700 dark:text-amber-300">{triggerConfig.cron_expression || '0 9 * * *'}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Reply Trigger Configuration */}
        {triggerType === 'REPLY' && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Auto-Reply Matching Rules
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Match Condition
                </Label>
                <select
                  value={triggerConfig.match_type || 'contains'}
                  onChange={(e) =>
                    setTriggerConfig((prev) => ({ ...prev, match_type: e.target.value as MatchType }))
                  }
                  className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium"
                >
                  <option value="contains">Contains Keyword</option>
                  <option value="exact">Exact Match Only</option>
                  <option value="starts_with">Starts With Keyword</option>
                  <option value="all">Match All Incoming Messages (Any)</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Session Scope
                </Label>
                <select
                  value={triggerConfig.reply_session_mode || 'SAME_SESSION'}
                  onChange={(e) =>
                    setTriggerConfig((prev) => ({
                      ...prev,
                      reply_session_mode: e.target.value as any,
                    }))
                  }
                  className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium"
                >
                  <option value="SAME_SESSION">Listen on All Active WhatsApp Sessions</option>
                  <option value="SPECIFIC">Listen on Specific WhatsApp Sessions Only</option>
                </select>
              </div>
            </div>

            {/* Rapid Auto-reply Filter for Match All Incoming Messages */}
            {triggerConfig.match_type === 'all' && (
              <div className="flex items-start gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <input
                  type="checkbox"
                  id="filter_rapid_autoreplies"
                  checked={Boolean(triggerConfig.filter_rapid_autoreplies)}
                  onChange={(e) =>
                    setTriggerConfig((prev) => ({
                      ...prev,
                      filter_rapid_autoreplies: e.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <label
                  htmlFor="filter_rapid_autoreplies"
                  className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                >
                  <span className="font-semibold block text-slate-900 dark:text-white">
                    Filter out rapid auto-replies (&lt; 15 seconds)
                  </span>
                  <span className="text-slate-500 text-[11px] mt-0.5 block">
                    Automatically ignores automated bot or business greeting replies received within 15 seconds of an outbound message to prevent infinite reply loops.
                  </span>
                </label>
              </div>
            )}

            {/* Specific Session Selector if enabled */}
            {triggerConfig.reply_session_mode === 'SPECIFIC' && (
              <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Select WhatsApp Sessions to Monitor:
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableSessions.map((s) => {
                    const isSelected = (triggerConfig.reply_selected_sessions || []).includes(s.session_id)
                    return (
                      <div
                        key={s.session_id}
                        onClick={() => {
                          const curr = triggerConfig.reply_selected_sessions || []
                          const updated = isSelected
                            ? curr.filter((id) => id !== s.session_id)
                            : [...curr, s.session_id]
                          setTriggerConfig((prev) => ({ ...prev, reply_selected_sessions: updated }))
                        }}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
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
              </div>
            )}

            {/* Keywords Input */}
            {triggerConfig.match_type !== 'all' && (
              <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Trigger Keywords
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">Case Sensitive</span>
                    <Switch
                      checked={Boolean(triggerConfig.case_sensitive)}
                      onCheckedChange={(checked) =>
                        setTriggerConfig((prev) => ({ ...prev, case_sensitive: checked }))
                      }
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Type keyword and press Enter or click Add (e.g. price, promo, info)"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddKeyword()
                      }
                    }}
                    className="text-xs bg-white dark:bg-slate-900"
                  />
                  <Button type="button" size="sm" onClick={handleAddKeyword} className="text-xs h-9">
                    Add
                  </Button>
                </div>

                {/* Keyword tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(triggerConfig.keywords || []).map((kw, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="gap-1.5 py-1 px-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    >
                      <span>"{kw}"</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyword(kw)}
                        className="text-slate-400 hover:text-rose-500 font-bold ml-1"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                  {(triggerConfig.keywords || []).length === 0 && (
                    <span className="text-xs text-slate-400 italic">
                      No keywords added yet. Workflow will trigger on any message until keywords are added.
                    </span>
                  )}
                </div>

                {/* Case sensitivity helper note & examples (only when switch is ON and a keyword is available) */}
                {Boolean(triggerConfig.case_sensitive) &&
                  ((triggerConfig.keywords && triggerConfig.keywords.length > 0) || keywordInput.trim().length > 0) &&
                  (() => {
                    const sampleKw =
                      triggerConfig.keywords && triggerConfig.keywords.length > 0
                        ? triggerConfig.keywords[0]
                        : keywordInput.trim()
                    const sampleUpper = sampleKw.toUpperCase()
                    const sampleAlt = sampleKw === sampleUpper ? sampleKw.toLowerCase() : sampleUpper

                    return (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-800/60 mt-1.5">
                        <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>
                          <strong className="text-slate-700 dark:text-slate-300">Case-Sensitive ON:</strong> Only exact letter casing will match (e.g. <code>"{sampleKw}"</code> will trigger, but <code>"{sampleAlt}"</code> will NOT).
                        </span>
                      </div>
                    )
                  })()}
              </div>
            )}
          </div>
        )}

        {/* Manual Trigger Info */}
        {triggerType === 'MANUAL' && (
          <div className="pt-5 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-start gap-3 p-4 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl text-xs text-purple-900 dark:text-purple-200">
              <Info className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">On-Demand Execution Workflow</p>
                <p className="mt-1 leading-relaxed opacity-90">
                  This workflow does not listen on a background schedule or customer replies. It executes whenever you click <strong>Run Now</strong> in the dashboard or trigger it via the backend API.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
