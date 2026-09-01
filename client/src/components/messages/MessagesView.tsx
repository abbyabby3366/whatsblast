import { useState, useMemo, useEffect } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Search,
  Loader2,
  Trash2,
  RotateCcw,
  Eye,
  Store,
  Send,
} from 'lucide-react'
import dayjs from 'dayjs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { api, getErrorMessage } from '@/lib/api'
import { safeText } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { WhatsAppPhonePreviewModal } from '@/components/campaigns/WhatsAppPhonePreviewModal'
import { TestSendMessageModal } from './TestSendMessageModal'
import type { Message } from './types'

export interface MessagesViewProps {
  isAdmin?: boolean
}

const columnHelper = createColumnHelper<Message>()

export function MessagesView({ isAdmin = false }: MessagesViewProps) {
  const queryClient = useQueryClient()
  const [globalFilter, setGlobalFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [selectedMerchant, setSelectedMerchant] = useState<string>('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)
  const [isRetryAllConfirmOpen, setIsRetryAllConfirmOpen] = useState(false)
  const [isTestSendOpen, setIsTestSendOpen] = useState(false)

  // Fetch users for admin merchant filter & display
  const { data: usersData } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('users/').json<any>(),
    enabled: isAdmin,
  })

  const allUsers: any[] = useMemo(() => {
    return usersData?.results || (Array.isArray(usersData) ? usersData : [])
  }, [usersData])

  const ownerDisplay = (userRef: any, msgObj: Message) => {
    if (userRef?.phone_number) return userRef.phone_number
    if (msgObj.campaign?.user?.phone_number) return msgObj.campaign.user.phone_number
    if (msgObj.session?.user?.phone_number) return msgObj.session.user.phone_number
    
    const userId = typeof userRef === 'object' ? userRef?.id || userRef?._id : userRef
    if (!userId) return '-'
    const found = allUsers.find((u) => u.id === userId || u._id === userId)
    return found?.phone_number || (typeof userId === 'string' ? userId.substring(0, 8) : '-')
  }

  const clearMessagesMutation = useMutation({
    mutationFn: () => api.delete('messages/').json<any>(),
    onSuccess: (data) => {
      toast.success(data?.message || 'All messages cleared successfully')
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      setIsClearConfirmOpen(false)
    },
    onError: async (err) => {
      toast.error(await getErrorMessage(err, 'Failed to clear messages.'))
    },
  })

  const retryAllFailedMutation = useMutation({
    mutationFn: () => {
      const searchParams = new URLSearchParams()
      if (isAdmin && selectedMerchant && selectedMerchant !== 'ALL') {
        searchParams.set('user', selectedMerchant)
      }
      return api.post('messages/retry-all-failed', { searchParams }).json<any>()
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Queued retry for all failed messages!')
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setIsRetryAllConfirmOpen(false)
    },
    onError: async (err) => {
      toast.error(await getErrorMessage(err, 'Failed to retry failed messages.'))
    },
  })

  const retrySingleMessageMutation = useMutation({
    mutationFn: (msgId: string) => api.post(`messages/${msgId}/retry`).json<any>(),
    onSuccess: (data) => {
      toast.success(data?.message || 'Message retried successfully!')
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
    onError: async (err) => {
      toast.error(await getErrorMessage(err, 'Failed to retry message.'))
    },
  })

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilter(globalFilter), 500)
    return () => clearTimeout(timer)
  }, [globalFilter])

  // Reset to first page on search or filter change
  useEffect(() => {
    setPageIndex(0)
  }, [debouncedFilter, statusFilter, selectedMerchant, startDate, endDate])

  const { data: response, isLoading } = useQuery({
    queryKey: ['messages', isAdmin ? 'admin' : 'merchant', pageIndex, pageSize, debouncedFilter, statusFilter, selectedMerchant, startDate, endDate],
    queryFn: () => {
      const searchParams = new URLSearchParams()
      searchParams.set('page', String(pageIndex + 1))
      searchParams.set('page_size', String(pageSize))
      searchParams.set('direction', 'out_bound')
      searchParams.set('is_campaign', 'true')

      if (debouncedFilter) {
        searchParams.set('search', debouncedFilter)
      }
      if (statusFilter && statusFilter !== 'ALL') {
        searchParams.set('status', statusFilter)
      }
      if (isAdmin && selectedMerchant && selectedMerchant !== 'ALL') {
        searchParams.set('user', selectedMerchant)
      }
      if (startDate) {
        searchParams.set('start_date', startDate)
        searchParams.set('created_at_after', startDate)
      }
      if (endDate) {
        searchParams.set('end_date', endDate)
        searchParams.set('created_at_before', endDate)
      }

      return api.get('messages/', { searchParams }).json<any>()
    },
    placeholderData: (previousData) => previousData,
  })

  const messages: Message[] = useMemo(() => {
    if (!response) return []
    return Array.isArray(response) ? response : response.results || []
  }, [response])

  const totalCount = Array.isArray(response) ? response.length : response?.count || 0
  const pageCount = Math.ceil(totalCount / pageSize)

  const columns = useMemo(() => {
    const cols: any[] = [
      columnHelper.accessor('recipient_phone', {
        header: 'Recipient Phone',
        cell: (info) => {
          const val = info.getValue() || info.row.original.to_jid?.split('@')[0] || '-'
          return <span className="font-mono font-medium text-slate-900 dark:text-slate-100">{val}</span>
        },
      }),
      columnHelper.accessor('sender_phone', {
        header: 'Sending Phone',
        cell: (info) => {
          const row = info.row.original
          const val =
            info.getValue() ||
            row.session_phone ||
            row.session?.phone_number ||
            (row.from_jid ? row.from_jid.split('@')[0] : null) ||
            '-'
          return <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{val}</span>
        },
      }),
      columnHelper.accessor('template', {
        header: 'Message Content',
        cell: (info) => {
          const tmpl = info.getValue()
          const row = info.row.original

          const parseContent = (val: any): string => {
            if (!val) return ''
            let obj = val
            if (typeof val === 'string') {
              const trimmed = val.trim()
              if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                  obj = JSON.parse(trimmed)
                } catch {
                  return val
                }
              } else {
                return val
              }
            }
            if (obj && typeof obj === 'object') {
              const bodyText = obj.text || obj.template || obj.body || obj.caption || obj.title || obj.subtitle
              if (bodyText && typeof bodyText === 'string') return bodyText
              if (obj.file || obj.file_url || obj.media_url || obj.image_url) {
                return '📷 [Media / Image]'
              }
            }
            return typeof obj === 'string' ? obj : ''
          }

          const rawText = tmpl?.text || row.content || row.body || tmpl
          let text = parseContent(rawText)
          if (!text) {
            text = safeText(rawText, '-')
          }

          return (
            <div className="max-w-[280px] sm:max-w-[360px] truncate text-slate-700 dark:text-slate-300 font-sans text-xs" title={text}>
              {text}
            </div>
          )
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => {
          const st = (info.getValue() || 'sent').toLowerCase()
          const msg = info.row.original
          const isFailed = st === 'failed'
          const isSent = st === 'delivered' || st === 'sent' || st === 'read'
          const isExpired = st === 'expired' || ((st === 'pending' || st === 'queued') && msg.scheduled_at && dayjs(msg.scheduled_at).add(2, 'minute').isBefore(dayjs()))
          const isPending = (st === 'pending' || st === 'queued') && !isExpired

          const failedReason =
            msg.error ||
            msg.error_message ||
            msg.failed_reason ||
            msg.failure_reason ||
            msg.reason ||
            msg.status_reason ||
            (typeof msg.content === 'object' && msg.content?.error) ||
            (typeof msg.content === 'object' && typeof msg.content?.text === 'string' && msg.content.text.startsWith('Send Failed') ? msg.content.text : null) ||
            'Message delivery failed'

          const badge = (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ${
                isSent
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                  : isExpired
                  ? 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800 cursor-pointer'
                  : isPending
                  ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                  : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800 cursor-pointer'
              }`}
            >
              {isExpired ? 'expired' : st}
            </span>
          )

          if (isFailed || isExpired) {
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {badge}
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs bg-slate-900 text-slate-100 shadow-md">
                    <p className={`font-semibold ${isExpired ? 'text-orange-400' : 'text-rose-400'} mb-0.5`}>
                      {isExpired ? 'Expired Status:' : 'Failed Reason:'}
                    </p>
                    <p className="break-words">
                      {isExpired
                        ? (msg.error || 'Scheduled time passed without being sent. Click Retry to reschedule.')
                        : failedReason}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          }

          return badge
        },
      }),
      columnHelper.accessor('created_at', {
        header: 'Created At',
        cell: (info) => {
          const val = info.getValue()
          return val ? (
            <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
              {dayjs(val).format('DD/MM/YY hh:mm:ss A')}
            </span>
          ) : '-'
        },
      }),
      columnHelper.accessor('scheduled_at', {
        header: 'Scheduled / Sent Time',
        cell: (info) => {
          const msg = info.row.original
          const st = (msg.status || '').toLowerCase()
          const isSent = st === 'sent' || st === 'delivered' || st === 'read'
          const isFailed = st === 'failed'
          const isExpired = st === 'expired' || ((st === 'pending' || st === 'queued') && msg.scheduled_at && dayjs(msg.scheduled_at).add(2, 'minute').isBefore(dayjs()))
          const targetTime = isSent
            ? (msg.sent_at || msg.wa_timestamp || msg.updatedAt)
            : (msg.scheduled_at || msg.created_at)

          if (!targetTime) return <span className="text-slate-400">-</span>

          const failedReason =
            msg.error ||
            msg.error_message ||
            msg.failed_reason ||
            msg.failure_reason ||
            msg.reason ||
            msg.status_reason ||
            (typeof msg.content === 'object' && msg.content?.error) ||
            (typeof msg.content === 'object' && typeof msg.content?.text === 'string' && msg.content.text.startsWith('Send Failed') ? msg.content.text : null) ||
            'Message delivery failed'

          const content = (
            <div className={`flex flex-col ${(isFailed || isExpired) ? 'cursor-pointer' : ''}`}>
              <span
                className={`font-mono text-xs font-medium ${
                  isSent
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : isFailed
                    ? 'text-rose-700 dark:text-rose-400'
                    : isExpired
                    ? 'text-orange-700 dark:text-orange-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {dayjs(targetTime).format('DD/MM/YY hh:mm:ss A')}
              </span>
              <span className={`text-[10px] font-medium ${
                isExpired ? 'text-orange-600 dark:text-orange-400 font-semibold' : 'text-slate-400 dark:text-slate-500'
              }`}>
                {isSent ? 'Sent' : isFailed ? 'Failed' : isExpired ? 'Expired' : 'Scheduled'}
              </span>
            </div>
          )

          if (isFailed || isExpired) {
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {content}
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs bg-slate-900 text-slate-100 shadow-md">
                    <p className={`font-semibold ${isExpired ? 'text-orange-400' : 'text-rose-400'} mb-0.5`}>
                      {isExpired ? 'Expired Details:' : 'Failed Reason:'}
                    </p>
                    <p className="break-words">
                      {isExpired
                        ? (msg.error || 'Scheduled time passed while waiting in queue. Click Retry to reschedule.')
                        : failedReason}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          }

          return content
        },
      }),
    ]

    if (isAdmin) {
      cols.splice(1, 0, columnHelper.accessor('user', {
        header: 'Merchant',
        cell: (info) => ownerDisplay(info.getValue(), info.row.original),
      }))
    }

    cols.push(
      columnHelper.display({
        id: 'actions',
        header: () => <div className="text-right">Actions</div>,
        cell: (info) => {
          const row = info.row.original
          const rowSt = (row.status || '').toLowerCase()
          const isRowExpired = rowSt === 'expired' || ((rowSt === 'pending' || rowSt === 'queued') && row.scheduled_at && dayjs(row.scheduled_at).add(2, 'minute').isBefore(dayjs()))
          const isFailed = rowSt === 'failed'
          const canRetry = isFailed || isRowExpired
          const isRetryingThis = retrySingleMessageMutation.isPending && retrySingleMessageMutation.variables === row.id

          return (
            <div className="flex items-center justify-end gap-1.5">
              {canRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRetryingThis}
                  onClick={() => retrySingleMessageMutation.mutate(row.id)}
                  className="h-8 px-2.5 text-xs gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900/60 dark:text-amber-400"
                  title={isRowExpired ? 'Reschedule and retry this message' : 'Retry sending this message'}
                >
                  {isRetryingThis ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  Retry
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedMessage(row)}
                className="h-8 px-2.5 text-xs gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" /> Preview
              </Button>
            </div>
          )
        },
      })
    )

    return cols
  }, [isAdmin, allUsers, retrySingleMessageMutation.isPending, retrySingleMessageMutation.variables])

  const table = useReactTable({
    data: messages,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: {
      pagination: { pageIndex, pageSize },
    },
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const newState = updater({ pageIndex, pageSize })
        setPageIndex(newState.pageIndex)
        setPageSize(newState.pageSize)
      } else {
        setPageIndex(updater.pageIndex)
        setPageSize(updater.pageSize)
      }
    },
  })

  const hasActiveFilters = Boolean(globalFilter || statusFilter !== 'ALL' || selectedMerchant !== 'ALL' || startDate || endDate)

  const handleResetFilters = () => {
    setGlobalFilter('')
    setStatusFilter('ALL')
    setSelectedMerchant('ALL')
    setStartDate('')
    setEndDate('')
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-10">
      {/* Header / Actions Bar */}
      <div className="flex items-center justify-end gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsRetryAllConfirmOpen(true)}
          disabled={retryAllFailedMutation.isPending}
          className="text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900/60 dark:text-amber-400 text-xs font-medium gap-1.5"
        >
          {retryAllFailedMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" />
          )}
          Retry All Failed
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsTestSendOpen(true)}
          className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900/60 dark:text-emerald-400 text-xs font-medium gap-1.5"
        >
          <Send className="w-3.5 h-3.5" /> Test Send Message
        </Button>

        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsClearConfirmOpen(true)}
            className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 text-xs font-medium gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear All Messages
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-50/80 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <Input
            placeholder="Search phone or text..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9 h-9 text-xs bg-white dark:bg-slate-950"
          />
        </div>

        <div className="w-[170px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-950">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="SENT">Sent / Delivered / Read</SelectItem>
              <SelectItem value="PENDING">Pending / Queued</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isAdmin && (
          <div className="w-[180px]">
            <Select value={selectedMerchant} onValueChange={setSelectedMerchant}>
              <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-950">
                <Store className="w-3.5 h-3.5 text-slate-400 mr-1" />
                <SelectValue placeholder="All Merchants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Merchants</SelectItem>
                {allUsers.map((u) => (
                  <SelectItem key={u.id || u._id} value={u.id || u._id}>
                    {u.phone_number || u.id} ({u.role || 'merchant'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">From</span>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 text-xs bg-white dark:bg-slate-950 w-[140px]"
            title="From Date"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">To</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 text-xs bg-white dark:bg-slate-950 w-[140px]"
            title="To Date"
          />
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const today = dayjs().format('YYYY-MM-DD')
              setStartDate(today)
              setEndDate(today)
            }}
            className={`h-9 px-2 text-xs transition-colors ${
              startDate === dayjs().format('YYYY-MM-DD') && endDate === dayjs().format('YYYY-MM-DD')
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400 font-medium'
                : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const yest = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
              setStartDate(yest)
              setEndDate(yest)
            }}
            className={`h-9 px-2 text-xs transition-colors ${
              startDate === dayjs().subtract(1, 'day').format('YYYY-MM-DD') && endDate === dayjs().subtract(1, 'day').format('YYYY-MM-DD')
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400 font-medium'
                : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            Yesterday
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setStartDate(dayjs().subtract(6, 'day').format('YYYY-MM-DD'))
              setEndDate(dayjs().format('YYYY-MM-DD'))
            }}
            className={`h-9 px-2 text-xs transition-colors ${
              startDate === dayjs().subtract(6, 'day').format('YYYY-MM-DD') && endDate === dayjs().format('YYYY-MM-DD')
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400 font-medium'
                : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            Last 7 Days
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleResetFilters}
          disabled={!hasActiveFilters}
          className={`h-9 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2.5 ml-auto shrink-0 transition-opacity duration-150 ${
            hasActiveFilters
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none invisible'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset filters
        </Button>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent border-slate-200 dark:border-slate-800">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs font-semibold">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-slate-500 text-sm">
                  No message history found.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2.5 text-xs">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
          <div>
            Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1} • {totalCount} total
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => {
                setPageIndex(0)
                table.setPageSize(Number(v))
              }}
            >
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="20">20 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
                <SelectItem value="100">100 / page</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Message Preview Modal */}
      {selectedMessage && (
        <WhatsAppPhonePreviewModal
          isOpen={Boolean(selectedMessage)}
          onClose={() => setSelectedMessage(null)}
          title={selectedMessage.recipient_phone || selectedMessage.campaign?.name || 'Preview'}
          campaign={
            selectedMessage.campaign &&
            ((Array.isArray(selectedMessage.campaign.templates) && selectedMessage.campaign.templates.length > 0) ||
              selectedMessage.campaign.template)
              ? selectedMessage.campaign
              : undefined
          }
          templates={
            selectedMessage.campaign &&
            ((Array.isArray(selectedMessage.campaign.templates) && selectedMessage.campaign.templates.length > 0) ||
              selectedMessage.campaign.template)
              ? Array.isArray(selectedMessage.campaign.templates) && selectedMessage.campaign.templates.length > 0
                ? selectedMessage.campaign.templates
                : [selectedMessage.campaign.template]
              : [
                  (() => {
                    const msg = selectedMessage
                    const tmplObj: any = typeof msg.template === 'object' && msg.template !== null ? msg.template : {}
                    let contentObj: any = typeof msg.content === 'object' && msg.content !== null ? msg.content : {}
                    if (typeof msg.content === 'string' && msg.content.trim().startsWith('{')) {
                      try {
                        contentObj = JSON.parse(msg.content.trim())
                      } catch {
                        // ignore JSON parse error
                      }
                    }

                    const text =
                      contentObj.text ||
                      contentObj.template ||
                      tmplObj.text ||
                      tmplObj.template ||
                      (typeof msg.content === 'string' && !msg.content.trim().startsWith('{') ? msg.content : '') ||
                      msg.body ||
                      ''
                    const footer =
                      contentObj.footer ||
                      contentObj.footer_text ||
                      contentObj.footerText ||
                      tmplObj.footer ||
                      tmplObj.footer_text ||
                      tmplObj.footerText ||
                      tmplObj.payload?.footer ||
                      msg.footer ||
                      msg.footer_text ||
                      ''
                    const buttons =
                      contentObj.buttons ||
                      tmplObj.buttons ||
                      tmplObj.payload?.buttons ||
                      msg.buttons ||
                      []
                    const file =
                      contentObj.file ||
                      contentObj.file_url ||
                      contentObj.media_url ||
                      contentObj.image_url ||
                      tmplObj.file ||
                      tmplObj.file_url ||
                      tmplObj.payload?.file ||
                      msg.file ||
                      msg.file_url ||
                      null
                    const button_image =
                      contentObj.button_image ||
                      contentObj.button_image_url ||
                      tmplObj.button_image ||
                      tmplObj.button_image_url ||
                      tmplObj.payload?.button_image ||
                      msg.button_image ||
                      null

                    return {
                      ...tmplObj,
                      ...contentObj,
                      text,
                      footer,
                      buttons,
                      file,
                      button_image,
                    }
                  })(),
                ]
          }
        />
      )}

      {/* Retry All Failed Confirm Modal */}
      <Dialog open={isRetryAllConfirmOpen} onOpenChange={setIsRetryAllConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Retry All Failed Messages?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            This will restart and re-queue all failed campaign and direct messages to be sent according to campaign intervals.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRetryAllConfirmOpen(false)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={retryAllFailedMutation.isPending}
              onClick={() => retryAllFailedMutation.mutate()}
            >
              {retryAllFailedMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Retry All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Clear Confirm Modal */}
      <Dialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear All Messages?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Are you sure you want to delete all message history? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClearConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={clearMessagesMutation.isPending}
              onClick={() => clearMessagesMutation.mutate()}
            >
              {clearMessagesMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Test Send Message Modal */}
      <TestSendMessageModal
        isOpen={isTestSendOpen}
        onClose={() => setIsTestSendOpen(false)}
      />
    </div>
  )
}
