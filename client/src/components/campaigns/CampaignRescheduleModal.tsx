import { useState, useEffect, useMemo } from 'react'
import {
  CalendarClock,
  Check,
  Clock,
  ExternalLink,
  Info,
  Loader2,
  Smartphone,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'

import { api, getErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface CampaignRescheduleModalProps {
  isOpen: boolean
  onClose: () => void
  campaign: any
  pendingCount?: number
  onSuccess?: () => void
}

export function CampaignRescheduleModal({
  isOpen,
  onClose,
  campaign,
  pendingCount = 0,
  onSuccess,
}: CampaignRescheduleModalProps) {
  const queryClient = useQueryClient()
  const campaignId = campaign?.id || campaign?._id

  // Fetch WhatsApp sessions
  const { data: userSessions = [], isLoading: isLoadingSessions } = useQuery({
    queryKey: ['whatsapp-sessions'],
    queryFn: () => api.get('whatsapp-sessions/').json<any[]>(),
    enabled: isOpen,
  })

  const connectedSessions = useMemo(() => {
    return userSessions.filter(
      (s) => (s.status || '').toUpperCase() === 'CONNECTED'
    )
  }, [userSessions])

  // Selected session IDs state
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([])

  // Interval state (in minutes)
  const defaultMin = Number(campaign?.min_interval_seconds) || 10
  const defaultMax = Number(campaign?.max_interval_seconds) || 15
  const [minInterval, setMinInterval] = useState<number>(defaultMin)
  const [maxInterval, setMaxInterval] = useState<number>(defaultMax)

  const [hasInitialized, setHasInitialized] = useState(false)

  // Whenever modal opens, initialize selections and intervals
  useEffect(() => {
    if (isOpen) {
      if (!hasInitialized && connectedSessions.length > 0) {
        setSelectedSessionIds(
          connectedSessions.map((s) => s.id || s._id || s.session_id)
        )
        setHasInitialized(true)
      }
      setMinInterval(Number(campaign?.min_interval_seconds) || 10)
      setMaxInterval(Number(campaign?.max_interval_seconds) || 15)
    } else {
      setHasInitialized(false)
    }
  }, [isOpen, connectedSessions.length, campaign?.min_interval_seconds, campaign?.max_interval_seconds, hasInitialized])

  const toggleSession = (id: string) => {
    setSelectedSessionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    setSelectedSessionIds(
      connectedSessions.map((s) => s.id || s._id || s.session_id)
    )
  }

  const deselectAll = () => {
    setSelectedSessionIds([])
  }

  // Calculate estimated completion
  const selectedCount = selectedSessionIds.length
  const fallbackPending =
    campaign?.stats?.pending !== undefined && campaign?.stats?.pending > 0
      ? campaign.stats.pending
      : Math.max(
          0,
          (campaign?.stats?.total || campaign?.recipient_phones?.length || campaign?.contacts?.length || 0) -
            ((campaign?.stats?.sent || 0) + (campaign?.stats?.failed || 0))
        )
  const effectivePending = pendingCount > 0 ? pendingCount : fallbackPending
  const messagesPerPhone =
    selectedCount > 0 ? Math.ceil(effectivePending / selectedCount) : 0
  const avgIntervalMins = Math.max(0.1, (minInterval + maxInterval) / 2)
  const totalEstimatedMins = Math.round(messagesPerPhone * avgIntervalMins)
  const estHours = Math.floor(totalEstimatedMins / 60)
  const estMins = totalEstimatedMins % 60

  // Reschedule mutation
  const rescheduleMutation = useMutation({
    mutationFn: () =>
      api
        .post(`blast-campaigns/${campaignId}/reschedule`, {
          json: {
            sessionIds: selectedSessionIds,
            minInterval,
            maxInterval,
          },
        })
        .json<any>(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign-logs', campaignId] })
      toast.success(data?.message || 'Campaign rescheduled successfully!')
      onSuccess?.()
      onClose()
    },
    onError: async (err) => {
      toast.error(
        await getErrorMessage(err, 'Failed to reschedule campaign.')
      )
    },
  })

  const isRunning = (campaign?.status || '').toLowerCase() === 'running'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/80">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Reschedule & Redistribute Campaign
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Campaign:{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {campaign?.name || 'Untitled Campaign'}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Information Notice */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5 text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-indigo-900 dark:text-indigo-200">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Evenly Distribute to New or Existing Sending Phones</span>
            </div>
            <p className="text-[11px] leading-relaxed text-indigo-800/90 dark:text-indigo-300/90">
              Connected a new sending phone halfway while the campaign is running?
              Rescheduling redistributes the <strong>{effectivePending} remaining message(s)</strong> evenly across all selected active phones and restarts their queues concurrently from now.
              {isRunning && (
                <span className="block mt-1 font-semibold text-emerald-700 dark:text-emerald-300">
                  ⚡ Campaign is currently RUNNING — all selected phones will begin blasting in parallel immediately.
                </span>
              )}
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
              <span className="text-[10px] text-slate-400 uppercase font-medium">Remaining to Blast</span>
              <p className="text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {effectivePending} msg{effectivePending === 1 ? '' : 's'}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
              <span className="text-[10px] text-slate-400 uppercase font-medium">Selected Phones</span>
              <p className="text-base font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                {selectedCount} phone{selectedCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-slate-400 uppercase font-medium">Load Per Phone</span>
              <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                ~{messagesPerPhone} msg{messagesPerPhone === 1 ? '' : 's'} / phone
              </p>
            </div>
          </div>

          {/* Sending Phones Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5 text-slate-500" />
                Select Sending Phones ({selectedCount}/{connectedSessions.length})
              </Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={connectedSessions.length === 0}
                  className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer disabled:opacity-50"
                >
                  Select All
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  disabled={selectedCount === 0}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:underline cursor-pointer disabled:opacity-50"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {isLoadingSessions ? (
              <div className="p-6 text-center border border-dashed rounded-lg border-slate-200 dark:border-slate-800">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-emerald-600 mb-1.5" />
                <span className="text-xs text-slate-400">Loading WhatsApp sessions...</span>
              </div>
            ) : connectedSessions.length === 0 ? (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <Info className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>No connected WhatsApp phone detected</span>
                </div>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Please connect at least one phone number in WhatsApp Sessions before rescheduling.
                </p>
                <Link
                  to="/merchant/whatsapp-sessions"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 underline hover:text-emerald-800"
                >
                  Open WhatsApp Sessions <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {connectedSessions.map((session) => {
                  const sId = session.id || session._id || session.session_id
                  const isChecked = selectedSessionIds.includes(sId)
                  const displayPhone = session.phone_number || session.session_id

                  return (
                    <div
                      key={sId}
                      onClick={() => toggleSession(sId)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                        isChecked
                          ? 'border-indigo-300 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/40 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                            isChecked
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <Smartphone className="h-4 w-4 text-slate-400 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-mono text-xs font-semibold truncate">
                            {displayPhone}
                          </span>
                          {session.alias && (
                            <span className="text-[10px] text-slate-400 truncate">
                              {session.alias}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Connected
                        </span>
                        {isChecked && (
                          <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-100/70 dark:bg-indigo-900/50 px-2 py-0.5 rounded">
                            ~{messagesPerPhone} msgs
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Interval Settings */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              Sending Interval Settings (Minutes)
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-slate-500 font-medium">Min Delay (Mins)</span>
                <Input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={minInterval}
                  onChange={(e) => setMinInterval(Number(e.target.value))}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-medium">Max Delay (Mins)</span>
                <Input
                  type="number"
                  min={minInterval}
                  step={0.5}
                  value={maxInterval}
                  onChange={(e) => setMaxInterval(Number(e.target.value))}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400">
              Each sending phone pauses a random duration between {minInterval} and {maxInterval} minutes between messages to comply with anti-spam standards.
            </p>
          </div>

          {/* Time Projection Banner */}
          {selectedCount > 0 && effectivePending > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-200">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-xs">
                  Estimated parallel blast duration:
                </span>
              </div>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                {estHours > 0 ? `${estHours}h ${estMins}m` : `${estMins} mins`}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={rescheduleMutation.isPending}
            className="text-xs h-8"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => rescheduleMutation.mutate()}
            disabled={
              rescheduleMutation.isPending ||
              selectedCount === 0 ||
              effectivePending === 0
            }
            className="text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs gap-1.5"
          >
            {rescheduleMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Rescheduling...
              </>
            ) : (
              <>
                <CalendarClock className="h-3.5 w-3.5" />
                Reschedule {effectivePending > 0 ? `${effectivePending} Messages` : 'Campaign'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
