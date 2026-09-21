import { useState, useMemo } from 'react'
import { createFileRoute, useNavigate, useSearch, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, getErrorMessage } from '@/lib/api'
import { safeText } from '@/lib/utils'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import { Activity, AlertCircle, ArrowLeft, Clock, ExternalLink, Loader2, Pause, Play, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CampaignRetryAllDropdown } from '@/components/campaigns/CampaignRetryDropdown'
import { CampaignProgressStatCards, type CampaignStatusFilter } from '@/components/campaigns/CampaignProgressStatCards'
import { CampaignProgressTable } from '@/components/campaigns/CampaignProgressTable'

export const Route = createFileRoute('/merchant/campaigns/progress')({
  component: CampaignProgressPage,
})

function CampaignProgressPage() {
  const navigate = useNavigate()
  const search: any = useSearch({ strict: false })
  const queryClient = useQueryClient()
  const campaignId = search?.id

  // Fetch campaign detail
  const {
    data: campaign,
    isLoading: isLoadingCampaign,
    isFetching: isFetchingCampaign,
    isError,
    refetch: refetchCampaign,
  } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api.get(`blast-campaigns/${campaignId}/`).json<any>(),
    enabled: Boolean(campaignId),
    refetchInterval: (data: any) =>
      (data?.status || '').toLowerCase() === 'running' ? 3000 : false,
  })

  // Track whether a retry recently happened, to keep auto-refresh active
  const campaignStatus = (campaign?.status || '').toLowerCase()
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [activeFilter, setActiveFilter] = useState<CampaignStatusFilter>('all')

  // Fetch campaign execution logs
  const {
    data: campaignLogsData,
    isLoading: isLoadingLogs,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ['campaign-logs', campaignId, sortOrder],
    queryFn: () =>
      api
        .get('messages/', {
          searchParams: {
            campaign_id: campaignId,
            page_size: '2000',
            sort_by: 'scheduled_at',
            order: sortOrder,
          },
        })
        .json<any>(),
    enabled: Boolean(campaignId),
    refetchInterval: campaignStatus === 'running' ? 3000 : false,
  })

  // Retry failed mutation
  const retryFailedMutation = useMutation({
    mutationFn: ({ id, sessionId }: { id: string | number; sessionId?: string }) =>
      api.post(`blast-campaigns/${id}/retry-failed/`, { json: { sessionId } }).json<any>(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign-logs', campaignId] })
      // Explicit refetch to ensure logs update immediately with new scheduled times
      refetchCampaign()
      refetchLogs()
      const msg = data?.message || 'Retrying failed & expired campaign messages...'
      if (data?.warning) {
        toast.warning(msg, { duration: 6000 })
      } else {
        toast.success(msg)
      }
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to retry campaign.'))
    },
  })

  // Retry recipient mutation
  const retryRecipientMutation = useMutation({
    mutationFn: ({
      cId,
      phone,
      sessionId,
    }: {
      cId: string | number
      phone: string
      sessionId?: string
    }) =>
      api
        .post(`blast-campaigns/${cId}/retry-recipient/`, {
          json: { phone, sessionId },
        })
        .json<any>(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign-logs', campaignId] })
      // Explicit refetch to ensure logs update immediately with new scheduled times
      refetchCampaign()
      refetchLogs()
      toast.success(data?.message || 'Message retried successfully!')
    },
    onError: async (err: any) => {
      toast.error(
        await getErrorMessage(err, 'Failed to retry message for recipient.')
      )
    },
  })

  // Pause campaign mutation
  const pauseMutation = useMutation({
    mutationFn: () => api.post(`blast-campaigns/${campaignId}/pause`).json<any>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign-logs', campaignId] })
      refetchCampaign()
      refetchLogs()
      toast.success('Campaign paused.')
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to pause campaign.'))
    },
  })

  // Resume campaign mutation
  const resumeMutation = useMutation({
    mutationFn: () => api.post(`blast-campaigns/${campaignId}/resume`).json<any>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign-logs', campaignId] })
      refetchCampaign()
      refetchLogs()
      toast.success('Campaign resumed.')
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to resume campaign.'))
    },
  })

  if (!campaignId) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">No campaign ID specified.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate({ to: '/merchant/campaigns' })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Campaigns
        </Button>
      </div>
    )
  }

  if (isLoadingCampaign) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  if (isError || !campaign) {
    return (
      <div className="p-8 text-center">
        <p className="text-rose-500">Failed to load campaign details.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate({ to: '/merchant/campaigns' })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Campaigns
        </Button>
      </div>
    )
  }

  const rawStats = campaign.stats || {}
  const logs: any[] = campaignLogsData?.results || []
  const recipientPhones: string[] =
    campaign.recipient_phones ||
    campaign.contacts?.map((c: any) =>
      typeof c === 'string' ? c : c.phone || c.recipient_phone
    ) ||
    []

  // Base start time & interval for calculating fallback estimated send times
  const baseStartTime = campaign.scheduled_at || campaign.created_at || campaign.createdAt
  const minInterval = Number(campaign.min_interval_seconds) || 10
  const maxInterval = Number(campaign.max_interval_seconds) || 15
  const avgIntervalMins = (minInterval + maxInterval) / 2

  // Generate detailed report rows following backend sorted logs
  let reportRows: any[] = []
  if (logs.length > 0) {
    const loggedPhoneSet = new Set<string>()
    const addPhoneVariants = (digits: string) => {
      if (!digits) return
      loggedPhoneSet.add(digits)
      if (digits.startsWith('60')) loggedPhoneSet.add('0' + digits.slice(2))
      else if (digits.startsWith('0')) loggedPhoneSet.add('60' + digits.slice(1))
    }
    reportRows = logs.map((l) => {
      const phone = l.recipient_phone || (l.to_jid ? l.to_jid.split('@')[0] : 'Recipient')
      const cleanPhone = phone.replace(/[^0-9]/g, '')
      addPhoneVariants(cleanPhone)
      return {
        phone,
        sender_phone: l.sender_phone || l.session?.phone_number || (l.from_jid ? l.from_jid.split('@')[0] : null),
        status: l.status || 'sent',
        scheduled_at: l.scheduled_at || l.scheduled_datetime,
        sent_at: l.sent_at || l.wa_timestamp,
        created_at: l.created_at || l.createdAt,
        error: l.error ? safeText(l.error) : null,
        message: safeText(l.content?.text || l.content, 'Template message sent'),
      }
    })

    // If there are any recipientPhones not yet recorded in logs, append them as pending
    if (recipientPhones.length > 0) {
      recipientPhones.forEach((phone, idx) => {
        const clean = phone.replace(/[^0-9]/g, '')
        if (!loggedPhoneSet.has(clean)) {
          const estimatedScheduledTime = baseStartTime
            ? dayjs(baseStartTime).add(idx * avgIntervalMins, 'minute').toISOString()
            : null
          reportRows.push({
            phone,
            status: 'pending',
            scheduled_at: estimatedScheduledTime,
            sent_at: null,
            created_at: null,
            error: null,
            message: 'Scheduled in queue',
          })
        }
      })
    }
  } else if (recipientPhones.length > 0) {
    reportRows = recipientPhones.map((phone, idx) => {
      const est = baseStartTime ? dayjs(baseStartTime).add(idx * avgIntervalMins, 'minute').toISOString() : null
      const isFailed = idx < (campaign.current_index || 0)
      return {
        phone, status: isFailed ? 'failed' : 'pending', scheduled_at: est,
        sent_at: null, created_at: null,
        error: isFailed ? 'Send failed during execution' : null,
        message: isFailed ? 'Template message failed' : 'Scheduled in queue',
      }
    })
  }

  // Sort reportRows chronologically by effective date & time
  const sortedReportRows = useMemo(() => {
    return [...reportRows].sort((a, b) => {
      const getTargetTime = (row: any) => {
        const st = (row.status || 'pending').toLowerCase()
        const isSuccess = st === 'sent' || st === 'delivered' || st === 'read'
        const t = isSuccess
          ? (row.sent_at || row.scheduled_at || row.created_at)
          : (row.scheduled_at || row.created_at)
        return t ? dayjs(t).valueOf() : 0
      }
      const timeA = getTargetTime(a)
      const timeB = getTargetTime(b)
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA
    })
  }, [reportRows, sortOrder])

  const cStatus = (campaign.status || 'draft').toUpperCase()
  const isCampaignPaused = cStatus === 'PAUSED'

  // Calculate live accurate counts from logs when available, falling back to campaign.stats
  const logSentCount = reportRows.filter((r) => ['sent', 'delivered', 'read'].includes((r.status || '').toLowerCase())).length
  const logFailedCount = reportRows.filter((r) => ['failed', 'error'].includes((r.status || '').toLowerCase())).length
  const logExpiredCount = reportRows.filter((r) => {
    const st = (r.status || '').toLowerCase()
    return !isCampaignPaused && (st === 'expired' || ((st === 'pending' || st === 'queued') && r.scheduled_at && dayjs(r.scheduled_at).add(2, 'minute').isBefore(dayjs())))
  }).length

  const hasLogData = logs.length > 0 || reportRows.length > 0
  const total = rawStats.total || recipientPhones.length || (hasLogData ? reportRows.length : 0) || 0
  const sent = hasLogData ? logSentCount : (rawStats.sent || 0)
  const failed = hasLogData ? logFailedCount : (rawStats.failed || 0)
  const expired = hasLogData ? logExpiredCount : (rawStats.expired || 0)
  const retryableCount = failed + expired
  const processed = sent + retryableCount
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-8">
      {/* Top Header / Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/merchant/campaigns"
          className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Campaigns
        </Link>

        <div className="flex items-center gap-2">
          {cStatus === 'running' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              className="h-8 text-xs border-orange-300 text-orange-700 hover:bg-orange-50 font-medium"
            >
              {pauseMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Pause className="mr-1.5 h-3.5 w-3.5" />
              )}
              Pause
            </Button>
          )}

          {cStatus === 'paused' && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {resumeMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
              )}
              Resume
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { refetchCampaign(); refetchLogs(); }}
            className="h-8 text-xs text-slate-600 hover:text-slate-900"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetchingCampaign ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {retryableCount > 0 && (
            <CampaignRetryAllDropdown
              retryableCount={retryableCount}
              isPending={retryFailedMutation.isPending}
              onRetryAll={(sessionId) =>
                retryFailedMutation.mutate({ id: campaign.id, sessionId })
              }
            />
          )}
        </div>
      </div>

      {/* Main Card Container */}
      <div className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        {/* Campaign Header Details */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600 shrink-0" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {campaign.name}
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Created: {dayjs(campaign.created_at || campaign.createdAt).format('DD/MM/YYYY h:mm A')}
              </span>
              {campaign.completed_at && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  Completed: {dayjs(campaign.completed_at).format('DD/MM/YYYY h:mm A')}
                </span>
              )}
            </p>
          </div>
          <div>
            <span
              className={`inline-block rounded-full px-3.5 py-1 text-xs font-semibold border ${
                cStatus === 'COMPLETED' || cStatus === 'completed'
                  ? retryableCount > 0
                    ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                  : cStatus === 'RUNNING' || cStatus === 'running'
                  ? 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800 animate-pulse'
                  : cStatus === 'PAUSED' || cStatus === 'paused'
                  ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800'
                  : cStatus === 'SCHEDULED' || cStatus === 'scheduled'
                  ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                  : cStatus === 'FAILED' || cStatus === 'failed'
                  ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                  : 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800'
              }`}
            >
              {cStatus === 'COMPLETED' && retryableCount > 0 ? `COMPLETED (${retryableCount} UNSENT)` : cStatus}
            </span>
          </div>
        </div>

        {/* Paused Campaign Notice Banner */}
        {cStatus === 'paused' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-lg border border-orange-200 bg-orange-50/90 p-3 text-xs text-orange-900 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-200">
            <div className="flex items-center gap-2">
              <Pause className="h-4 w-4 text-orange-600 shrink-0" />
              <span>
                <strong>Campaign is paused.</strong> Scheduled messages are frozen and will resume sequentially when you click Resume.
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium self-start sm:self-auto"
            >
              {resumeMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3 fill-current" />}
              Resume Campaign
            </Button>
          </div>
        )}

        {/* Failed / Expired messages banner if any */}
        {retryableCount > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                <strong>
                  {failed > 0 && expired > 0
                    ? `${failed} failed & ${expired} expired`
                    : failed > 0
                    ? `${failed} message(s) failed`
                    : `${expired} message(s) expired`}
                </strong>{' '}
                {cStatus === 'completed'
                  ? 'during blast execution. You can retry them now:'
                  : cStatus === 'paused'
                  ? 'contacts can be rescheduled to send once resumed:'
                  : 'contacts can be retried now:'}
              </span>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveFilter('failed')}
                className="h-8 text-xs border-amber-300 text-amber-900 bg-amber-100/60 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300 font-medium"
              >
                View Failed ({retryableCount})
              </Button>
              <CampaignRetryAllDropdown
                retryableCount={retryableCount}
                isPending={retryFailedMutation.isPending}
                size="sm"
                buttonText={`Retry All (${retryableCount})`}
                onRetryAll={(sessionId) =>
                  retryFailedMutation.mutate({ id: campaign.id, sessionId })
                }
                className="shrink-0"
              />
            </div>
          </div>
        )}

        {/* Error message notice if any */}
        {campaign.error_message && (
          <Link
            to="/merchant/whatsapp-sessions"
            className="flex items-center justify-between gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200 cursor-pointer hover:bg-rose-100/80 dark:hover:bg-rose-900/60 transition-all shadow-xs group"
            title="Click to redirect to Connect WhatsApp Sessions page"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-rose-700 dark:text-rose-300">Campaign Execution Notice:</span>{' '}
                <span>{safeText(campaign.error_message)}</span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 underline shrink-0 group-hover:text-rose-800 dark:group-hover:text-rose-200">
              Connect WhatsApp <ExternalLink className="w-3 h-3" />
            </span>
          </Link>
        )}

        {/* Modular Stat Cards & Progress Bar */}
        <CampaignProgressStatCards
          total={total}
          sent={sent}
          failed={failed}
          expired={expired}
          processed={processed}
          percent={percent}
          retryableCount={retryableCount}
          activeFilter={activeFilter}
          onSelectFilter={setActiveFilter}
        />

        {/* Detailed Recipient Delivery Log */}
        <CampaignProgressTable
          reportRowsCount={reportRows.length}
          sortedReportRows={sortedReportRows}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          cStatus={cStatus}
          campaignId={campaign.id}
          isLoadingLogs={isLoadingLogs}
          isRecipientPending={(phone) =>
            retryRecipientMutation.isPending &&
            retryRecipientMutation.variables?.phone === phone
          }
          onRetryRecipient={(payload) =>
            retryRecipientMutation.mutate({
              cId: campaign.id,
              phone: payload.phone,
              sessionId: payload.sessionId,
            })
          }
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
        />
      </div>
    </div>
  )
}
