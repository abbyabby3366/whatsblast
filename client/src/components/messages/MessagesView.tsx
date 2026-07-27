import React, { useState, useMemo, useEffect } from 'react'
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
  Filter,
  X,
  MessageSquare,
  Store,
} from 'lucide-react'
import dayjs from 'dayjs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { api, getErrorMessage } from '@/lib/api'
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
import { WhatsAppPhonePreviewModal } from '@/components/campaigns/WhatsAppPhonePreviewModal'

export interface MessagesViewProps {
  isAdmin?: boolean
}

type Message = {
  id: string
  direction: string
  message_type: string
  sender_phone?: string | null
  recipient_phone?: string | null
  from_jid?: string | null
  to_jid?: string | null
  user?: any
  template?: {
    text: string | null
    file?: any
    button_image?: any
    buttons?: any[]
  } | null
  created_at: string
  scheduled_at?: string | null
  scheduled_datetime?: string | null
  sent_at?: string | null
  status: string
  session_phone?: string | null
  [key: string]: any
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
    if (msgObj?.campaign?.user?.phone_number) return msgObj.campaign.user.phone_number
    if (msgObj?.session?.user?.phone_number) return msgObj.session.user.phone_number
    
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
      if (statusFilter !== 'ALL') {
        searchParams.set('status', statusFilter.toLowerCase())
      }
      if (isAdmin && selectedMerchant !== 'ALL') {
        searchParams.set('user_id', selectedMerchant)
      }
      if (startDate) {
        searchParams.set('start_date', dayjs(startDate).startOf('day').toISOString())
      }
      if (endDate) {
        searchParams.set('end_date', dayjs(endDate).endOf('day').toISOString())
      }

      return api.get('messages/', { searchParams }).json<any>()
    },
    placeholderData: (prev) => prev,
  })

  const messages: Message[] = useMemo(() => {
    return response?.results || []
  }, [response])

  const totalCount = response?.count || 0
  const pageCount = Math.ceil(totalCount / pageSize)

  const retryMessageMutation = useMutation({
    mutationFn: (msgId: string) => api.post(`messages/${msgId}/retry`).json<any>(),
    onSuccess: (data) => {
      toast.success(data?.message || 'Message retried successfully!')
      queryClient.invalidateQueries({ queryKey: ['messages'] })
    },
    onError: async (err) => {
      toast.error(await getErrorMessage(err, 'Failed to retry message.'))
    },
  })

  const columns = useMemo(() => {
    const cols: any[] = []

    if (isAdmin) {
      cols.push(
        columnHelper.accessor('user' as any, {
          id: 'merchant',
          header: 'Merchant',
          cell: (info) => (
            <span className="font-semibold text-xs text-[#008069] dark:text-[#53bdeb] bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              {ownerDisplay(info.getValue(), info.row.original)}
            </span>
          ),
        })
      )
    }

    cols.push(
      columnHelper.accessor('campaign_name' as any, {
        header: 'Campaign Name',
        cell: (info) => {
          const cName = info.getValue() || info.row.original.campaign?.name || info.row.original.campaign_name || (info.row.original.campaign ? 'Campaign Blast' : 'Testing')
          const isTesting = cName.toLowerCase().includes('testing') || cName.toLowerCase().includes('test') || (!info.row.original.campaign && !info.row.original.campaign_name)
          return (
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
              isTesting 
                ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800' 
                : 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800'
            }`}>
              {cName}
            </span>
          )
        },
      }),
      columnHelper.accessor('sender_phone', {
        header: 'Sent From',
        cell: (info) => <span className="font-medium text-slate-700 dark:text-slate-200">{info.row.original.session_phone || info.getValue() || info.row.original.from_jid || 'System'}</span>,
      }),
      columnHelper.accessor('recipient_phone', {
        header: 'Sent To',
        cell: (info) => <span className="font-medium text-emerald-600 dark:text-emerald-400">{info.getValue() || info.row.original.to_jid || 'Unknown'}</span>,
      }),
      columnHelper.accessor('template.text' as any, {
        header: 'Message',
        cell: (info) => {
          const text = info.getValue() || info.row.original.content?.text || info.row.original.text
          const type = info.row.original.message_type || info.row.original.type || 'text'
          if (text) {
            return <span className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300 max-w-xs">{text}</span>
          }
          return <span className="text-slate-400 italic text-sm">[{type} message]</span>
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => {
          const status = (info.getValue() || 'UNKNOWN').toUpperCase()
          let colorClass = "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
          if (status === 'SENT' || status === 'DELIVERED' || status === 'READ') {
            colorClass = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-semibold"
          } else if (status === 'FAILED' || status === 'ERROR') {
            colorClass = "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-semibold"
          } else if (status === 'PENDING' || status === 'QUEUED' || status === 'SENDING') {
            colorClass = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-semibold"
          }
          
          return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${colorClass}`}>
              {status}
            </span>
          )
        },
      }),
      columnHelper.accessor('scheduled_at' as any, {
        id: 'scheduled_sent_time',
        header: 'Scheduled / Sent Time',
        cell: (info) => {
          const schedVal = info.row.original.scheduled_at || info.row.original.scheduled_datetime || info.row.original.created_at || info.row.original.createdAt
          const sentVal = info.row.original.sent_at || (info.row.original.status?.toLowerCase() !== 'pending' && info.row.original.status?.toLowerCase() !== 'queued' ? info.row.original.wa_timestamp : null)

          return (
            <div className="flex flex-col text-xs space-y-0.5 py-0 min-w-[160px] leading-tight">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-[46px]">Sched:</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  {schedVal ? dayjs(schedVal).format('MMM D, YYYY h:mm:ss A') : <span className="italic text-slate-400">Immediate</span>}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-[46px]">Sent:</span>
                {sentVal ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                    {dayjs(sentVal).format('MMM D, YYYY h:mm:ss A')}
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 italic font-medium">Pending</span>
                )}
              </div>
            </div>
          )
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: () => <div className="text-center font-medium">Actions</div>,
        cell: (info) => {
          const msg = info.row.original
          const status = (msg.status || '').toLowerCase()
          const isSuccess = status === 'sent' || status === 'delivered' || status === 'read'
          const isFailed = status === 'failed' || status === 'error'

          return (
            <div className="flex flex-col items-center justify-center text-center w-full min-w-[120px] mx-auto gap-0.5">
              <div className="flex items-center justify-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] font-medium text-slate-700 hover:text-slate-900 border-slate-200 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
                  onClick={() => setSelectedMessage(msg)}
                  title="Preview message"
                >
                  <Eye className="mr-1 h-3 w-3 text-slate-500" />
                  Preview
                </Button>
                {!isSuccess && (
                  <Button
                    type="button"
                    variant={isFailed ? "destructive" : "outline"}
                    size="sm"
                    className={`h-6 px-2 text-[11px] font-medium ${
                      isFailed
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'text-slate-600 hover:text-slate-900 border-slate-200'
                    }`}
                    disabled={retryMessageMutation.isPending}
                    onClick={() => retryMessageMutation.mutate(msg.id)}
                    title="Retry sending this message"
                  >
                    {retryMessageMutation.isPending && retryMessageMutation.variables === msg.id ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1 h-3 w-3" />
                    )}
                    Retry
                  </Button>
                )}
              </div>
              {Boolean(msg.retry_count) && (
                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap text-center">
                  Retried {msg.retry_count} time{msg.retry_count > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )
        },
      })
    )

    return cols
  }, [isAdmin, allUsers, retryMessageMutation])

  const table = useReactTable({
    data: messages,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: {
      pagination: {
        pageIndex,
        pageSize,
      },
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

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    (isAdmin && selectedMerchant !== 'ALL') ||
    startDate !== '' ||
    endDate !== '' ||
    globalFilter !== ''

  const clearFilters = () => {
    setStatusFilter('ALL')
    setSelectedMerchant('ALL')
    setStartDate('')
    setEndDate('')
    setGlobalFilter('')
    setPageIndex(0)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Messages</h2>
          <p className="text-xs text-slate-500">
            {isAdmin
              ? 'View and track all outbound WhatsApp messages across all platform merchants.'
              : 'View and track all outbound WhatsApp campaign messages.'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setIsClearConfirmOpen(true)}
          disabled={totalCount === 0 || clearMessagesMutation.isPending}
          className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/50 shrink-0 font-medium self-start sm:self-auto"
        >
          {clearMessagesMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin text-rose-600" />
          ) : (
            <Trash2 className="w-4 h-4 mr-2 text-rose-500" />
          )}
          Clear All Messages
        </Button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
          <div className="relative w-full xl:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder={isAdmin ? "Search merchant, recipient, message..." : "Search recipient phone, message..."}
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
            {globalFilter && (
              <button
                type="button"
                onClick={() => setGlobalFilter('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 text-xs px-2.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 shrink-0"
              >
                Clear filters
              </Button>
            )}

            {isAdmin && (
              <div className="w-56 sm:w-60 min-w-[210px]">
                <Select value={selectedMerchant} onValueChange={setSelectedMerchant}>
                  <SelectTrigger className="h-9 text-xs flex items-center justify-between overflow-hidden">
                    <div className="flex items-center min-w-0 flex-1 mr-1">
                      <Store className="w-3.5 h-3.5 mr-1.5 text-slate-400 shrink-0" />
                      <div className="truncate">
                        <SelectValue placeholder="All Merchants" />
                      </div>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Merchants</SelectItem>
                    {allUsers.map((u) => (
                      <SelectItem key={u.id || u._id} value={u.id || u._id}>
                        {u.phone_number || u.email || 'Merchant'} ({u.role || 'user'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="w-40">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <Filter className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                  <SelectValue placeholder="Filter Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="SENT">Sent / Delivered / Read</SelectItem>
                  <SelectItem value="PENDING">Pending / Queued</SelectItem>
                  <SelectItem value="FAILED">Failed / Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 text-xs w-36"
                placeholder="Start date"
              />
              <span className="text-slate-400 text-xs">-</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 text-xs w-36"
                placeholder="End date"
              />
            </div>
          </div>
        </div>

        <div className="relative overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="text-xs font-semibold">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                      <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                      <span className="text-xs">Loading messages...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-1 px-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-48 text-center text-slate-500 text-sm">
                    No outbound messages found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            Showing <span className="font-medium text-slate-900 dark:text-slate-100">{messages.length}</span> of{' '}
            <span className="font-medium text-slate-900 dark:text-slate-100">{totalCount}</span> messages
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={pageIndex === 0 || isLoading}
              className="h-8 text-xs"
            >
              Previous
            </Button>

            <span className="text-xs text-slate-600 dark:text-slate-400 px-2 font-medium">
              Page {pageIndex + 1} of {pageCount || 1}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
              disabled={pageIndex >= pageCount - 1 || isLoading}
              className="h-8 text-xs"
            >
              Next
            </Button>

            <Select
              value={String(pageSize)}
              onValueChange={(val) => {
                setPageSize(Number(val))
                setPageIndex(0)
              }}
            >
              <SelectTrigger className="h-8 w-20 text-xs">
                <SelectValue placeholder="20" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="20">20 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
                <SelectItem value="100">100 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* WHATSAPP PHONE PREVIEW MODAL */}
      {selectedMessage && (
        <WhatsAppPhonePreviewModal
          campaign={{
            id: selectedMessage.campaign?.id || selectedMessage.id,
            name: selectedMessage.campaign?.name || selectedMessage.campaign_name || 'Message Preview',
            recipient_phones: [selectedMessage.recipient_phone || selectedMessage.to_jid || 'Recipient'],
            created_at: selectedMessage.created_at,
            templates: (() => {
              const msgContent: any = selectedMessage.content || {}
              const msgTemplate: any = typeof selectedMessage.template === 'object' && selectedMessage.template ? selectedMessage.template : {}

              const text = msgContent.text || selectedMessage.text || msgTemplate.text || msgTemplate.template || ''
              const file = msgContent.file || selectedMessage.file || msgTemplate.file || msgTemplate.file_url
              const file_url = msgContent.file_url || selectedMessage.file_url || selectedMessage.media_url || selectedMessage.image_url || selectedMessage.url || msgTemplate.file_url || msgTemplate.url
              const button_image = msgContent.button_image || selectedMessage.button_image || msgTemplate.button_image || msgTemplate.button_image_url
              const buttons = msgContent.buttons || selectedMessage.buttons || msgTemplate.buttons || []
              const footer = msgContent.footer || selectedMessage.footer || msgTemplate.footer || ''
              const files = msgContent.files || selectedMessage.files || msgTemplate.files || []
              const attachedFiles = msgContent.attachedFiles || selectedMessage.attachedFiles || msgTemplate.attachedFiles || []
              const messageType = msgContent.file_type || selectedMessage.message_type || selectedMessage.type || msgTemplate.type || msgTemplate.messageType

              return [
                {
                  ...msgTemplate,
                  ...msgContent,
                  text,
                  file: file || file_url,
                  file_url: file_url || (typeof file === 'string' ? file : undefined),
                  button_image,
                  buttons,
                  footer,
                  files,
                  attachedFiles,
                  type: messageType,
                  messageType,
                },
              ]
            })(),
          }}
          onClose={() => setSelectedMessage(null)}
        />
      )}

      {/* CLEAR ALL MESSAGES CONFIRMATION MODAL */}
      <Dialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <Trash2 className="h-5 w-5" />
              <DialogTitle className="text-lg font-bold">Clear All Messages</DialogTitle>
            </div>
          </DialogHeader>
          <div className="py-2 text-sm text-slate-600 dark:text-slate-300">
            Are you sure you want to clear all outbound campaign messages? This action cannot be undone.
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsClearConfirmOpen(false)}
              disabled={clearMessagesMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => clearMessagesMutation.mutate()}
              disabled={clearMessagesMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {clearMessagesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Clear All Messages
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
