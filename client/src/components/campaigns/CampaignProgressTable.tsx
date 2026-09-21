import React, { useState, useMemo } from 'react'
import dayjs from 'dayjs'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Pause,
  Search,
  X,
} from 'lucide-react'
import { safeText } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RecipientRetryDropdown } from '@/components/campaigns/CampaignRetryDropdown'
import type { CampaignStatusFilter } from '@/components/campaigns/CampaignProgressStatCards'

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
  activeFilter?: CampaignStatusFilter
  setActiveFilter?: (filter: CampaignStatusFilter) => void
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
  activeFilter,
  setActiveFilter,
}) => {
  const [internalFilter, setInternalFilter] = useState<CampaignStatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize, setPageSize] = useState<number>(50)
  const [currentPage, setCurrentPage] = useState<number>(1)

  const currentFilter = activeFilter ?? internalFilter

  const handleSetFilter = (filter: CampaignStatusFilter) => {
    if (setActiveFilter) {
      setActiveFilter(filter)
    } else {
      setInternalFilter(filter)
    }
    setCurrentPage(1)
  }

  // Determine row status classification
  const getRowCategory = (row: any): 'sent' | 'failed' | 'pending' => {
    const st = (row.status || 'pending').toLowerCase()
    const isCampaignPaused = cStatus === 'paused'
    const isSuccess = st === 'sent' || st === 'delivered' || st === 'read'
    if (isSuccess) return 'sent'
    const isFailed = st === 'failed' || st === 'error'
    const isExpired =
      !isCampaignPaused &&
      (st === 'expired' ||
        ((st === 'pending' || st === 'queued') &&
          row.scheduled_at &&
          dayjs(row.scheduled_at).add(2, 'minute').isBefore(dayjs())))
    if (isFailed || isExpired) return 'failed'
    return 'pending'
  }

  // Count by categories for quick tab badges
  const counts = useMemo(() => {
    let sent = 0
    let failed = 0
    let pending = 0
    for (const row of sortedReportRows) {
      const cat = getRowCategory(row)
      if (cat === 'sent') sent++
      else if (cat === 'failed') failed++
      else pending++
    }
    return {
      all: sortedReportRows.length,
      sent,
      failed,
      pending,
    }
  }, [sortedReportRows, cStatus])

  // Filter rows by active category and search query
  const filteredRows = useMemo(() => {
    let list = sortedReportRows
    if (currentFilter !== 'all') {
      list = list.filter((row) => getRowCategory(row) === currentFilter)
    }

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      const cleanDigits = q.replace(/[^0-9]/g, '')
      list = list.filter((row) => {
        const rowPhone = (row.phone || '').toString()
        const rowDigits = rowPhone.replace(/[^0-9]/g, '')
        const matchPhone = cleanDigits ? rowDigits.includes(cleanDigits) : rowPhone.toLowerCase().includes(q)
        const matchMsg = (row.message || '').toString().toLowerCase().includes(q)
        const matchError = (row.error || '').toString().toLowerCase().includes(q)
        return matchPhone || matchMsg || matchError
      })
    }
    return list
  }, [sortedReportRows, currentFilter, searchQuery, cStatus])

  // Pagination calculation
  const totalFiltered = filteredRows.length
  const effectivePageSize = pageSize === -1 ? totalFiltered : pageSize
  const totalPages = Math.max(1, Math.ceil(totalFiltered / (effectivePageSize || 1)))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)

  const paginatedRows = useMemo(() => {
    if (pageSize === -1) return filteredRows
    const start = (safeCurrentPage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, safeCurrentPage, pageSize])

  return (
    <div className="space-y-3 pt-2">
      {/* Controls Bar: Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => handleSetFilter('all')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors border cursor-pointer ${
              currentFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => handleSetFilter('failed')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors border cursor-pointer ${
              currentFilter === 'failed'
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : counts.failed > 0
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
            }`}
          >
            Failed / Expired ({counts.failed})
          </button>
          <button
            type="button"
            onClick={() => handleSetFilter('sent')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors border cursor-pointer ${
              currentFilter === 'sent'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
            }`}
          >
            Sent ({counts.sent})
          </button>
          <button
            type="button"
            onClick={() => handleSetFilter('pending')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors border cursor-pointer ${
              currentFilter === 'pending'
                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
            }`}
          >
            Pending ({counts.pending})
          </button>
        </div>

        {/* Search Input & Live Indicator */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="Search phone or error..."
              className="h-8 pl-8 pr-7 text-xs bg-slate-50 dark:bg-slate-800/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setCurrentPage(1)
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {isLoadingLogs && <Loader2 className="h-4 w-4 animate-spin text-emerald-600 shrink-0" />}
        </div>
      </div>

      {/* Table Container */}
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
            {paginatedRows.map((row, idx) => {
              const st = (row.status || 'pending').toLowerCase()
              const isCampaignPaused = cStatus === 'paused'
              const isSuccess = st === 'sent' || st === 'delivered' || st === 'read'
              const isFailed = st === 'failed' || st === 'error'
              const isExpired =
                !isCampaignPaused &&
                (st === 'expired' ||
                  ((st === 'pending' || st === 'queued') &&
                    row.scheduled_at &&
                    dayjs(row.scheduled_at).add(2, 'minute').isBefore(dayjs())))
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
                          <span
                            className={`text-[10px] font-medium ${
                              isPaused
                                ? 'text-orange-600 dark:text-orange-400 font-semibold'
                                : isExpired
                                ? 'text-orange-600 dark:text-orange-400 font-semibold'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
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

            {/* Empty matching search / filter state */}
            {totalFiltered === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <Filter className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                    <p className="font-medium text-slate-700 dark:text-slate-300 text-xs">
                      No records match the current filter {searchQuery ? `or search "${searchQuery}"` : ''}
                    </p>
                    {(currentFilter !== 'all' || searchQuery) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          handleSetFilter('all')
                          setSearchQuery('')
                          setCurrentPage(1)
                        }}
                        className="mt-2 text-xs"
                      >
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* No log records at all */}
            {reportRowsCount === 0 && totalFiltered === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                  No log records found for this campaign.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {totalFiltered > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 text-xs text-slate-600 dark:text-slate-400">
          <div>
            Showing{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {pageSize === -1 ? 1 : (safeCurrentPage - 1) * pageSize + 1}
            </span>{' '}
            to{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {pageSize === -1 ? totalFiltered : Math.min(safeCurrentPage * pageSize, totalFiltered)}
            </span>{' '}
            of{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{totalFiltered}</span>{' '}
            recipients
            {totalFiltered !== sortedReportRows.length && (
              <span className="text-slate-400 ml-1">
                (filtered from {sortedReportRows.length} total)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="flex items-center gap-1.5">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>All</option>
              </select>
            </div>

            {pageSize !== -1 && totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-7 px-2"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
                </Button>
                <span className="px-2 font-medium text-slate-700 dark:text-slate-300">
                  {safeCurrentPage} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 px-2"
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
