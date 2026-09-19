import React from 'react'
import dayjs from 'dayjs'
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Loader2, Pause } from 'lucide-react'
import { safeText } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RecipientRetryDropdown } from '@/components/campaigns/CampaignRetryDropdown'

interface CampaignProgressTableProps {
  reportRowsCount: number
  sortedReportRows: any[]
  sortOrder: 'asc' | 'desc'
  setSortOrder: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>
  cStatus: string
  campaignId: string
  isLoadingLogs: boolean
  isRecipientPending: (phone: string) => boolean
  onRetryRecipient: (payload: { phone: string; sessionId?: string }) => void
}

export const CampaignProgressTable: React.FC<CampaignProgressTableProps> = ({
  reportRowsCount,
  sortedReportRows,
  sortOrder,
  setSortOrder,
  cStatus,
  campaignId,
  isLoadingLogs,
  isRecipientPending,
  onRetryRecipient,
}) => {
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Recipient Delivery Log ({reportRowsCount})
        </h2>
        {isLoadingLogs && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
            <TableRow>
              <TableHead className="text-xs">Recipient Phone</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead
                className="text-xs cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                title={`Sort by Scheduled Send Time (${sortOrder === 'asc' ? 'Click for Descending' : 'Click for Ascending'})`}
              >
                <div className="flex items-center gap-1.5">
                  <span>Scheduled Send Time</span>
                  <span className="inline-flex shrink-0">
                    {sortOrder === 'asc' ? (
                      <ArrowUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </span>
                </div>
              </TableHead>
              <TableHead className="text-xs">Message Preview</TableHead>
              <TableHead className="text-xs text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedReportRows.map((row, idx) => {
              const st = (row.status || 'pending').toLowerCase()
              const isCampaignPaused = cStatus === 'paused'
              const isSuccess = st === 'sent' || st === 'delivered' || st === 'read'
              const isFailed = st === 'failed' || st === 'error'
              const isExpired = !isCampaignPaused && (st === 'expired' || ((st === 'pending' || st === 'queued') && row.scheduled_at && dayjs(row.scheduled_at).add(2, 'minute').isBefore(dayjs())))
              const isPaused = isCampaignPaused && (st === 'pending' || st === 'queued' || st === 'paused')
              const canRetry = isFailed || isExpired

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
                          : isPaused
                          ? 'bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800'
                          : isExpired
                          ? 'bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800'
                          : isFailed
                          ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                          : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                      }`}
                    >
                      {isSuccess && <CheckCircle2 className="h-3 w-3" />}
                      {isFailed && <AlertCircle className="h-3 w-3" />}
                      {isPaused && <Pause className="h-3 w-3" />}
                      {isPaused ? 'PAUSED' : isExpired ? 'EXPIRED' : row.status ? row.status.toUpperCase() : 'PENDING'}
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
                                : isPaused
                                ? 'text-orange-700 dark:text-orange-400'
                                : isExpired
                                ? 'text-orange-700 dark:text-orange-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {dayjs(targetTime).format('DD/MM/YYYY hh:mm:ss A')}
                          </span>
                          <span className={`text-[10px] font-medium ${
                            isPaused
                              ? 'text-orange-600 dark:text-orange-400 font-semibold'
                              : isExpired
                              ? 'text-orange-600 dark:text-orange-400 font-semibold'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}>
                            {isPaused ? 'Waiting (Paused)' : isSuccess ? 'Sent' : isFailed ? 'Failed' : isExpired ? 'Expired' : 'Scheduled'}
                          </span>
                        </div>
                      )
                    })()}
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 max-w-xs truncate">
                    {safeText(row.message)}
                  </TableCell>
                  <TableCell className="text-right">
                    {canRetry ? (
                      <RecipientRetryDropdown
                        phone={row.phone}
                        campaignId={campaignId}
                        originalSenderPhone={row.sender_phone}
                        isPending={isRecipientPending(row.phone)}
                        onRetry={onRetryRecipient}
                        title={isExpired ? 'Reschedule and retry message' : 'Retry sending message'}
                      />
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}

            {reportRowsCount === 0 && (
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
  )
}
