import { createFileRoute, useNavigate, useSearch, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, getErrorMessage } from '@/lib/api'
import { safeText } from '@/lib/utils'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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

  // Fetch campaign execution logs
  const {
    data: campaignLogsData,
    isLoading: isLoadingLogs,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ['campaign-logs', campaignId],
    queryFn: () =>
      api
        .get('messages/', {
          searchParams: { campaign_id: campaignId, page_size: '100' },
        })
        .json<any>(),
    enabled: Boolean(campaignId),
    refetchInterval: () =>
      (campaign?.status || '').toLowerCase() === 'running' ? 3000 : false,
  })

  // Retry failed mutation
  const retryFailedMutation = useMutation({
    mutationFn: (id: string | number) =>
      api.post(`blast-campaigns/${id}/retry-failed/`).json<any>(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign-logs', campaignId] })
      toast.success(data?.message || 'Retrying failed campaign messages...')
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
    }: {
      cId: string | number
      phone: string
    }) =>
      api
        .post(`blast-campaigns/${cId}/retry-recipient/`, {
          json: { phone },
        })
        .json<any>(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign-logs', campaignId] })
      toast.success(data?.message || 'Message retried successfully!')
    },
    onError: async (err: any) => {
      toast.error(
        await getErrorMessage(err, 'Failed to retry message for recipient.')
      )
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

  const stats = campaign.stats || {}
  const total =
    stats.total ||
    campaign.recipient_phones?.length ||
    campaign.contacts?.length ||
    0
  const sent = stats.sent || campaign.current_index || 0
  const failed = stats.failed || 0
  const pending = Math.max(0, total - sent - failed)
  const percent =
    total > 0 ? Math.min(100, Math.round(((sent + failed) / total) * 100)) : 0
  const cStatus = (campaign.status || 'draft').toUpperCase()

  const logs: any[] = campaignLogsData?.results || []
  const recipientPhones: string[] =
    campaign.recipient_phones ||
    campaign.contacts?.map((c: any) =>
      typeof c === 'string' ? c : c.phone || c.recipient_phone
    ) ||
    []

  // Generate detailed report rows
  const reportRows =
    recipientPhones.length > 0
      ? recipientPhones.map((phone, idx) => {
          const cleanP = phone.replace(/[^0-9]/g, '')
          const matchedLog = logs.find(
            (l) =>
              l.recipient_phone?.replace(/[^0-9]/g, '') === cleanP ||
              l.to_jid?.includes(cleanP)
          )

          if (matchedLog) {
            return {
              phone: phone,
              status: matchedLog.status || 'sent',
              scheduled_at: matchedLog.scheduled_at,
              sent_at: matchedLog.sent_at || matchedLog.wa_timestamp,
              created_at: matchedLog.created_at || matchedLog.createdAt,
              error: matchedLog.error ? safeText(matchedLog.error) : null,
              message: safeText(matchedLog.content?.text || matchedLog.content, 'Template message sent'),
            }
          }

          if (idx < (campaign.current_index || 0)) {
            return {
              phone: phone,
              status: 'failed',
              scheduled_at: null,
              sent_at: null,
              created_at: null,
              error: 'Send failed during execution',
              message: 'Template message failed',
            }
          }

          return {
            phone: phone,
            status: 'pending',
            scheduled_at: null,
            sent_at: null,
            created_at: null,
            error: null,
            message: 'Scheduled in queue',
          }
        })
      : logs.map((l) => ({
          phone: l.recipient_phone || l.to_jid || 'Recipient',
          status: l.status || 'sent',
          scheduled_at: l.scheduled_at,
          sent_at: l.sent_at || l.wa_timestamp,
          created_at: l.created_at || l.createdAt,
          error: l.error ? safeText(l.error) : null,
          message: safeText(l.content?.text || l.content, 'Message'),
        }))

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

          {failed > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={() => retryFailedMutation.mutate(campaign.id)}
              disabled={retryFailedMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs font-medium"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Retry All Failed ({failed})
            </Button>
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
            <p className="text-xs text-slate-500 mt-1">
              Created: {dayjs(campaign.created_at || campaign.createdAt).format('DD/MM/YY h:mm A')}
              {campaign.completed_at && (
                <span className="ml-3">
                  Completed: {dayjs(campaign.completed_at).format('DD/MM/YY h:mm A')}
                </span>
              )}
            </p>
          </div>
          <div>
            <span
              className={`inline-block rounded-full px-3.5 py-1 text-xs font-semibold border ${
                cStatus === 'COMPLETED' || cStatus === 'completed'
                  ? 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
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
              {cStatus}
            </span>
          </div>
        </div>

        {/* Error message notice if any */}
        {campaign.error_message && (
          <div
            onClick={() => navigate({ to: '/merchant/whatsapp-sessions' })}
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
          </div>
        )}

        {/* Blast Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span className="text-slate-700 dark:text-slate-300">Blast Progress</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              {percent}% ({sent + failed}/{total})
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-xs font-medium text-slate-500">Total Recipients</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{total}</p>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Success / Sent</p>
            <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{sent}</p>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
            <p className="text-xs font-medium text-rose-700 dark:text-rose-400">Failed</p>
            <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">{failed}</p>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-xs font-medium text-slate-500">Pending</p>
            <p className="mt-2 text-2xl font-bold text-slate-700 dark:text-slate-300">{pending}</p>
          </div>
        </div>

        {/* Detailed Recipient Delivery Log */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Recipient Delivery Log ({reportRows.length})
            </h2>
            {isLoadingLogs && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
                <TableRow>
                  <TableHead className="text-xs">Recipient Phone</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Scheduled Send Time</TableHead>
                  <TableHead className="text-xs">Message Preview</TableHead>
                  <TableHead className="text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportRows.map((row, idx) => {
                  const st = (row.status || 'pending').toLowerCase()
                  const isSuccess = st === 'sent' || st === 'delivered' || st === 'read'
                  const isFailed = st === 'failed' || st === 'error'

                  return (
                    <TableRow key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-xs">
                      <TableCell className="font-mono font-medium text-slate-800 dark:text-slate-200">
                        {row.phone}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            isSuccess
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                              : isFailed
                              ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                              : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                          }`}
                        >
                          {isSuccess && <CheckCircle2 className="h-3 w-3" />}
                          {isFailed && <AlertCircle className="h-3 w-3" />}
                          {row.status ? row.status.toUpperCase() : 'PENDING'}
                        </span>
                        {row.error && (
                          <p className="mt-0.5 text-[10px] text-rose-600 dark:text-rose-400 font-normal">
                            {safeText(row.error)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {(() => {
                          const targetTime = isSuccess
                            ? (row.sent_at || row.scheduled_at || row.created_at)
                            : (row.scheduled_at || row.created_at)

                          if (!targetTime) return <span className="text-slate-400">-</span>

                          return (
                            <div className="flex flex-col">
                              <span
                                className={`font-mono text-xs font-semibold ${
                                  isSuccess
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : isFailed
                                    ? 'text-rose-700 dark:text-rose-400'
                                    : 'text-amber-700 dark:text-amber-400'
                                }`}
                              >
                                {dayjs(targetTime).format('DD/MM/YY hh:mm:ss A')}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                {isSuccess ? 'Sent' : isFailed ? 'Failed' : 'Scheduled'}
                              </span>
                            </div>
                          )
                        })()}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400 max-w-xs truncate">
                        {safeText(row.message)}
                      </TableCell>
                      <TableCell className="text-right">
                        {isFailed ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                            disabled={retryRecipientMutation.isPending}
                            onClick={() =>
                              retryRecipientMutation.mutate({
                                cId: campaign.id,
                                phone: row.phone,
                              })
                            }
                          >
                            {retryRecipientMutation.isPending &&
                            retryRecipientMutation.variables?.phone === row.phone ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <RotateCcw className="h-3 w-3 mr-1" />
                            )}
                            Retry
                          </Button>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}

                {reportRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                      No log records found for this campaign.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  )
}
