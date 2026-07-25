import { useState, useMemo, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Search, Loader2, User, MoreVertical, CheckCheck, Mic, ArrowLeft, Filter } from 'lucide-react'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
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
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const Route = createFileRoute('/merchant/messages')({
  component: MessagesPage,
})

type Message = {
  id: string
  direction: string
  message_type: string
  sender_phone?: string | null
  recipient_phone?: string | null
  from_jid?: string | null
  to_jid?: string | null
  template?: {
    text: string | null
    file?: { file_type?: string; file?: string; url?: string; file_url?: string; image?: string; video?: string; audio?: string; document?: string; sticker?: string } | null
    button_image?: { file_type?: string; file?: string; url?: string; file_url?: string; image?: string } | null
    buttons?: Array<{ id?: string; type?: string; displayText?: string; display_text?: string; value?: string }>
  } | null
  created_at: string
  scheduled_datetime?: string | null
  status: string
  session_phone?: string | null
  [key: string]: any
}

const columnHelper = createColumnHelper<Message>()

function MessagesPage() {
  const [globalFilter, setGlobalFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilter(globalFilter), 500)
    return () => clearTimeout(timer)
  }, [globalFilter])

  // Reset to first page on search or filter change
  useEffect(() => {
    setPageIndex(0)
  }, [debouncedFilter, statusFilter, startDate, endDate])

  const { data: response, isLoading } = useQuery({
    queryKey: ['messages', pageIndex, pageSize, debouncedFilter, statusFilter, startDate, endDate],
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

  const handleRowClick = (msg: Message) => {
    setSelectedMessage(msg)
    setIsModalOpen(true)
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor('sender_phone', {
        header: 'Sent From',
        cell: (info) => <span className="font-medium text-slate-700">{info.row.original.session_phone || info.getValue() || info.row.original.from_jid || 'Unknown'}</span>,
      }),
      columnHelper.accessor('recipient_phone', {
        header: 'Sent To',
        cell: (info) => <span className="font-medium text-emerald-600">{info.getValue() || info.row.original.to_jid || 'Unknown'}</span>,
      }),
      columnHelper.accessor('template.text', {
        header: 'Message',
        cell: (info) => {
          const text = info.getValue()
          const type = info.row.original.message_type
          if (text) {
            return <span className="line-clamp-2 text-sm text-slate-600 max-w-xs">{text}</span>
          }
          return <span className="text-slate-400 italic text-sm">[{type} message]</span>
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => {
          const status = (info.getValue() || 'UNKNOWN').toUpperCase()
          let colorClass = "bg-slate-100 text-slate-800"
          if (status === 'SENT' || status === 'DELIVERED' || status === 'READ') colorClass = "bg-green-100 text-green-800"
          else if (status === 'FAILED' || status === 'ERROR') colorClass = "bg-red-100 text-red-800"
          else if (status === 'PENDING' || status === 'QUEUED' || status === 'SENDING') colorClass = "bg-yellow-100 text-yellow-800"
          
          return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
              {status}
            </span>
          )
        },
      }),
      columnHelper.accessor('scheduled_datetime', {
        header: 'Scheduled Date Time',
        cell: (info) => {
          const val = info.getValue()
          if (!val) return <span className="text-slate-400 italic">Immediate</span>
          return dayjs(val).format('MMM D, YYYY h:mm:ss A')
        },
      }),
    ],
    []
  )

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Messages</h2>
          <p className="text-slate-500">View and track all outbound WhatsApp campaign messages.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
          <div className="flex items-center gap-4 w-full xl:w-auto">
            <div className="relative max-w-sm w-full xl:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search messages..."
                className="pl-9 bg-slate-50 dark:bg-slate-950 w-full"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </div>
            <div className="text-sm font-medium text-slate-500 shrink-0">
              {totalCount} Records
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-3 shadow-sm h-10">
              <span className="text-xs font-medium text-slate-500 mr-2">From:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-none bg-transparent shadow-none w-[125px] h-8 px-0 focus-visible:ring-0 text-sm"
              />
            </div>
            <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-3 shadow-sm h-10">
              <span className="text-xs font-medium text-slate-500 mr-2">To:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-none bg-transparent shadow-none w-[125px] h-8 px-0 focus-visible:ring-0 text-sm"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] bg-slate-50 dark:bg-slate-950 h-10 shadow-sm border-slate-200 dark:border-slate-800">
                <div className="flex items-center">
                  <Filter className="w-3.5 h-3.5 mr-2 text-slate-500" />
                  <SelectValue placeholder="Status" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="QUEUED">Queued</SelectItem>
                <SelectItem value="SENT">Sent</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="overflow-x-auto relative">
          {isLoading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
          )}
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    onClick={() => handleRowClick(row.original)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">
                    {isLoading ? 'Loading messages...' : 'No outbound messages found.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="text-sm text-slate-500">
            Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1} • {totalCount} total • {pageSize} / page
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPageIndex(0) }}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
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
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Message Info Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md bg-transparent border-none shadow-none p-0 flex justify-center">
          <DialogTitle className="sr-only">Message Preview</DialogTitle>
          <DialogDescription className="sr-only">WhatsApp UI Message Preview</DialogDescription>
          
          {/* Phone Frame */}
          <div className="w-[340px] h-[650px] border-[14px] border-slate-900 rounded-[3rem] overflow-hidden relative shadow-2xl flex flex-col bg-[#efeae2] dark:bg-[#0b141a]">
            {/* Phone Notch/Dynamic Island */}
            <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-20 pointer-events-none">
              <div className="w-32 h-6 bg-slate-900 rounded-b-2xl"></div>
            </div>
            
            {/* WhatsApp Header */}
            <div className="bg-[#008069] dark:bg-[#202c33] text-white pt-8 pb-3 px-2 flex items-center gap-2 z-10 shadow-sm shrink-0">
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="flex items-center justify-center p-1 -ml-1 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
                aria-label="Back"
              >
                <ArrowLeft className="w-[22px] h-[22px] text-white" />
              </button>
              <div className="w-10 h-10 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                <User className="w-6 h-6 text-slate-500 dark:text-slate-400" />
              </div>
              <div className="flex flex-col flex-1 min-w-0 ml-1">
                <span className="font-semibold text-[16px] truncate leading-tight">
                  {selectedMessage?.recipient_phone || selectedMessage?.to_jid?.split('@')[0] || 'Unknown Contact'}
                </span>
                <span className="text-xs text-white/80 font-medium">online</span>
              </div>
              <MoreVertical className="w-5 h-5 text-white/90 shrink-0" />
            </div>

            {/* Chat Background Pattern */}
            <div className="absolute inset-0 top-20 bottom-14 opacity-[0.06] dark:opacity-[0.03] pointer-events-none mix-blend-multiply" 
                 style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: 'cover' }}>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative z-10">
              {/* Date Badge */}
              <div className="flex justify-center my-2">
                <span className="bg-[#e1f3fb]/90 dark:bg-[#182229]/90 text-[#54656f] dark:text-[#8696a0] text-xs px-3 py-1.5 rounded-lg shadow-sm font-medium uppercase tracking-wide text-[10px]">
                  {selectedMessage?.created_at ? dayjs(selectedMessage.created_at).format('MMMM D, YYYY') : 'Today'}
                </span>
              </div>

              {/* Message Bubble (Outbound) */}
              <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-lg rounded-tr-none p-2 max-w-[85%] self-end relative shadow-[0_1px_0.5px_rgba(11,20,26,.13)] break-words whitespace-pre-wrap text-[14px] leading-[19px]">
                {(selectedMessage?.template?.file || selectedMessage?.template?.button_image) && (
                  <div className="mb-1 rounded-md overflow-hidden bg-black/5 dark:bg-white/5 flex flex-col">
                    {selectedMessage.template.button_image && (
                      <img
                        src={selectedMessage.template.button_image.file_url || selectedMessage.template.button_image.image || selectedMessage.template.button_image.file || selectedMessage.template.button_image.url}
                        alt="Button media"
                        className="w-full h-auto max-h-64 object-cover"
                      />
                    )}
                    {selectedMessage.template.file?.file_type === 'image' && (
                      <img src={selectedMessage.template.file.file_url || selectedMessage.template.file.image || selectedMessage.template.file.file || selectedMessage.template.file.url} alt="Media" className="w-full h-auto max-h-64 object-cover" />
                    )}
                    {selectedMessage.template.file?.file_type === 'video' && (
                      <video src={selectedMessage.template.file.file_url || selectedMessage.template.file.video || selectedMessage.template.file.file || selectedMessage.template.file.url} controls className="w-full h-auto max-h-64 bg-black" />
                    )}
                    {selectedMessage.template.file?.file_type === 'audio' && (
                      <audio src={selectedMessage.template.file.file_url || selectedMessage.template.file.audio || selectedMessage.template.file.file || selectedMessage.template.file.url} controls className="w-full max-w-full h-10 mt-1 mb-1" />
                    )}
                    {selectedMessage.template.file?.file_type === 'document' && (
                      <div className="flex items-center gap-2 p-3 bg-black/5 dark:bg-white/5">
                        <div className="w-10 h-10 rounded bg-red-500 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-sm">FILE</div>
                        <span className="text-sm truncate font-medium flex-1">Document Attachment</span>
                      </div>
                    )}
                    {selectedMessage.template.file?.file_type === 'sticker' && (
                      <img src={selectedMessage.template.file.file_url || selectedMessage.template.file.sticker || selectedMessage.template.file.file || selectedMessage.template.file.url} alt="Sticker" className="w-24 h-24 object-contain bg-transparent m-2" />
                    )}
                  </div>
                )}
                
                <div className="mb-3">
                  {selectedMessage?.template?.text || `[${selectedMessage?.message_type || 'Generic'} message]`}
                </div>

                {selectedMessage?.template?.buttons?.length ? (
                  <div className="clear-both mt-2 space-y-1 border-t border-black/10 pt-1 dark:border-white/10">
                    {selectedMessage.template.buttons.map((button, index) => (
                      <div
                        key={button.id || index}
                        className="rounded-md bg-white/70 px-3 py-2 text-center text-sm font-medium text-[#027eb5] shadow-sm dark:bg-[#111b21]/50 dark:text-[#53bdeb]"
                      >
                        {button.displayText || button.display_text || button.value || 'Button'}
                      </div>
                    ))}
                  </div>
                ) : null}
                
                {/* Meta row: Time and Ticks */}
                <div className="flex justify-end items-center gap-1 float-right mt-[-10px] ml-2">
                  <span className="text-[11px] text-[#667781] dark:text-[#8696a0]">
                    {selectedMessage?.created_at ? dayjs(selectedMessage.created_at).format('HH:mm') : '12:00'}
                  </span>
                  <CheckCheck className={`w-[15px] h-[15px] ${selectedMessage?.status.toLowerCase() === 'read' ? 'text-[#53bdeb]' : 'text-[#8696a0]'}`} />
                </div>
                
                {/* Bubble Tail SVG */}
                <svg viewBox="0 0 8 13" className="absolute top-0 -right-2 w-2 h-3 text-[#d9fdd3] dark:text-[#005c4b] fill-current">
                  <path d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path>
                </svg>
              </div>
            </div>

            {/* Input Footer */}
            <div className="bg-[#f0f2f5] dark:bg-[#202c33] px-2 py-2.5 flex items-center gap-2 z-10 shrink-0 pb-6 sm:pb-3 border-t border-black/5 dark:border-white/5">
              <div className="flex-1 bg-white dark:bg-[#2a3942] h-10 rounded-full flex items-center px-4 shadow-sm border border-transparent dark:border-white/5">
                <span className="text-[#8696a0] text-[15px]">Message</span>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center shrink-0 shadow-sm text-white">
                <Mic className="w-5 h-5 fill-current" />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
