import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { 
  Loader2, 
  Plus, 
  QrCode, 
  Trash2, 
  Smartphone, 
  Settings, 
  Copy, 
  HelpCircle, 
  Send, 
  Shuffle, 
  LayoutGrid, 
  List, 
  Search,
  Check,
  Tag,
  RefreshCw,
  LogOut,
  ChevronDown,
  Clock,
  Calendar,
} from 'lucide-react'
import dayjs from 'dayjs'

import { api, getErrorMessage } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const Route = createFileRoute('/merchant/whatsapp-sessions')({
  component: SessionsPage,
})

function SessionsPage() {
  const queryClient = useQueryClient()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [isQrOpen, setIsQrOpen] = useState(false)
  const [isManageOpen, setIsManageOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: sessionsResponse, isLoading } = useQuery({
    queryKey: ['whatsapp-sessions'],
    queryFn: () => api.get('whatsapp-sessions/').json<any>(),
    refetchInterval: isQrOpen ? 2500 : 5000,
  })

  const sessions = Array.isArray(sessionsResponse) ? sessionsResponse : sessionsResponse?.results || []

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions
    const query = searchQuery.toLowerCase().trim()
    return sessions.filter((s: any) => 
      (s.phone_number || '').toLowerCase().includes(query) ||
      (s.session_id || s.id || '').toLowerCase().includes(query) ||
      (s.alias || '').toLowerCase().includes(query) ||
      (s.labels || []).some((lbl: string) => lbl.toLowerCase().includes(query)) ||
      (s.status || '').toLowerCase().includes(query)
    )
  }, [sessions, searchQuery])

  const stats = useMemo(() => {
    const total = sessions.length
    const connected = sessions.filter((s: any) => (s.status || '').toLowerCase() === 'connected').length
    const disconnected = total - connected
    return { total, connected, disconnected }
  }, [sessions])

  // Periodically query QR & status while QR modal is open
  const { data: qrQueryData } = useQuery({
    queryKey: ['session-qr', selectedSessionId],
    queryFn: () => api.get(`whatsapp-sessions/${selectedSessionId}/qr/`).json<any>(),
    enabled: isQrOpen && Boolean(selectedSessionId),
    refetchInterval: isQrOpen ? 2000 : false,
  })

  useEffect(() => {
    if (!isQrOpen) return

    // Check if qrQueryData says connected
    if (qrQueryData) {
      const status = (qrQueryData.status || qrQueryData.data?.status || '').toLowerCase()
      if (status === 'connected' || status === 'authenticated') {
        setIsQrOpen(false)
        setQrBase64(null)
        toast.success('WhatsApp Session Connected Successfully! 🎉')
        queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
        return
      }
      const qr = qrQueryData.qrBase64 || qrQueryData.qr_code || qrQueryData.data?.qrBase64
      if (qr) setQrBase64(qr)
    }

    // Check if sessions list says connected
    if (selectedSessionId) {
      const current = sessions.find((s: any) => s.id === selectedSessionId || s.session_id === selectedSessionId)
      if (current && (current.status || '').toLowerCase() === 'connected') {
        setIsQrOpen(false)
        setQrBase64(null)
        toast.success('WhatsApp Session Connected Successfully! 🎉')
        queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
      }
    }
  }, [isQrOpen, qrQueryData, sessions, selectedSessionId, queryClient])

  const createSessionMutation = useMutation({
    mutationFn: () => api.post('whatsapp-sessions/').json<any>(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
      toast.success('Session created successfully!')
      if (data?.id) {
        handleScan(data.id)
      }
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to create session.'))
  })

  const fetchQrMutation = useMutation({
    mutationFn: (id: string) => api.get(`whatsapp-sessions/${id}/qr/`).json<any>(),
    onSuccess: (data) => {
      const status = (data.status || data.data?.status || '').toLowerCase()
      if (status === 'connected' || status === 'authenticated') {
        setIsQrOpen(false)
        toast.success('WhatsApp Session Connected!')
        return
      }
      if (data.qrBase64) {
        setQrBase64(data.qrBase64)
      } else if (data.data?.qrBase64) {
        setQrBase64(data.data.qrBase64)
      } else {
        toast.error('No QR code returned.')
      }
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to fetch QR. Try again.'))
  })

  const reconnectSessionMutation = useMutation({
    mutationFn: (id: string) => api.post(`whatsapp-sessions/${id}/reconnect/`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
      toast.success('Reconnecting session...')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to reconnect session.'))
  })

  const disconnectSessionMutation = useMutation({
    mutationFn: (id: string) => api.patch(`whatsapp-sessions/${id}/`, { json: { status: 'disconnecting' } }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
      toast.success('Session disconnected')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to disconnect session.'))
  })

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`whatsapp-sessions/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
      toast.success('Session deleted')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to delete session.'))
  })

  const handleScan = (id: string) => {
    setSelectedSessionId(id)
    setQrBase64(null)
    setIsQrOpen(true)
    fetchQrMutation.mutate(id)
  }

  const handleManage = (id: string) => {
    setSelectedSessionId(id)
    setIsManageOpen(true)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(text)
    toast.success('Session ID copied to clipboard')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const getStatusBadge = (status?: string) => {
    const s = (status || 'unknown').toLowerCase()
    switch (s) {
      case 'connected':
      case 'authenticated':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/60">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Connected
          </span>
        )
      case 'connecting':
      case 'starting':
      case 'initializing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800/60">
            <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
            Connecting
          </span>
        )
      case 'qr_ready':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800/60">
            <QrCode className="w-3 h-3 text-blue-500" />
            QR Ready
          </span>
        )
      case 'disconnected': 
      case 'logout': 
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
            Disconnected
          </span>
        )
      default: 
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
            {(status || 'unknown').charAt(0).toUpperCase() + (status || 'unknown').slice(1)}
          </span>
        )
    }
  }

  const selectedSession = sessions.find((s: any) => s.id === selectedSessionId)

  return (
    <div className="space-y-4">
      {/* Sleek Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">WhatsApp Sessions</h2>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{stats.connected}</span> / {stats.total} Connected
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Connect your WhatsApp numbers to dispatch bulk campaign messages.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-8 px-3 text-xs font-medium"
            onClick={() => createSessionMutation.mutate()}
            disabled={createSessionMutation.isPending}
          >
            {createSessionMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            New Session
          </Button>
        </div>
      </div>

      {/* Filter and View Mode Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input 
            placeholder="Search by phone number or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors ${
              viewMode === 'grid' 
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs' 
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors ${
              viewMode === 'table' 
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs' 
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="py-16 flex flex-col items-center justify-center space-y-2 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <span className="text-xs">Loading sessions...</span>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="py-12 px-4 text-center text-slate-500 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
          <Smartphone className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {searchQuery ? 'No matching sessions found' : 'No WhatsApp Sessions Active'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 mb-4 max-w-sm mx-auto">
            {searchQuery ? `Try clearing your search query "${searchQuery}"` : 'Create a WhatsApp session and scan the QR code to link your number.'}
          </p>
          {!searchQuery && (
            <Button onClick={() => createSessionMutation.mutate()} size="sm" variant="outline" className="h-8 text-xs">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Create First Session
            </Button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Sleek Grid View */
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredSessions.map((session: any) => {
            const sid = session.session_id || session.id
            const isConnected = (session.status || '').toLowerCase() === 'connected'

            return (
              <div 
                key={session.id} 
                className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 flex flex-col justify-between space-y-3.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all hover:shadow-md"
              >
                {/* Top Row: Logo + Phone & Date (Left) | Status Badge (Upper Right Corner) */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${isConnected ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                      <img src="/futuristic-whatsapp-logo.png" alt="WhatsApp" className="w-6 h-6 object-contain" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-bold text-base text-slate-900 dark:text-slate-100 font-mono truncate">
                        {session.phone_number || 'Unconnected Session'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {dayjs(session.created_at).format('MMM D, YYYY · h:mm A')}
                      </div>
                    </div>
                  </div>

                  {/* Upper Right Corner Status Badge */}
                  <div className="shrink-0">
                    {getStatusBadge(session.status)}
                  </div>
                </div>

                {/* Body info: Alias (once!), Session ID, Interval, Active Window & Labels */}
                <div className="space-y-1.5 text-xs">
                  {session.alias && (
                    <div className="flex items-center justify-between bg-emerald-50/60 dark:bg-emerald-950/30 px-3 py-1.5 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium shrink-0 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-emerald-600" /> Alias:
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{session.alias}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-400 font-medium shrink-0 mr-2">ID:</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(sid)}
                      className="font-mono text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium truncate flex items-center gap-1.5 transition-colors"
                      title="Click to copy Session ID"
                    >
                      <span className="truncate">{sid}</span>
                      {copiedId === sid ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-500 shrink-0" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" /> Interval:
                    </span>
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                      {session.min_interval_seconds ?? 10}s - {session.max_interval_seconds ?? 15}s
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" /> Active Window:
                    </span>
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                      {session.active_start_time || '00:00'} - {session.active_end_time || '23:59'}
                    </span>
                  </div>

                  {session.labels && session.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {session.labels.map((lbl: string) => (
                        <Badge key={lbl} variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {lbl}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer: Manage Button (Right aligned) */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleManage(session.id)}
                    className="h-8 px-3 rounded-lg text-xs font-medium gap-1.5"
                    title="Manage session settings"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Manage
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Sleek Table / List View */
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
          <Table>
            <TableHeader className="bg-slate-50/70 dark:bg-slate-800/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[140px] text-xs font-semibold text-slate-500">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Alias</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Phone Number</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Session ID</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Created</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-500">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSessions.map((session: any) => {
                const sid = session.session_id || session.id

                return (
                  <TableRow key={session.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <TableCell className="py-2.5">
                      {getStatusBadge(session.status)}
                    </TableCell>
                    <TableCell className="py-2.5 font-semibold text-xs text-slate-900 dark:text-slate-100">
                      {session.alias ? (
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          {session.alias}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic font-normal text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {session.phone_number || <span className="text-slate-400 italic font-sans font-normal">Unconnected</span>}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(sid)}
                          className="font-mono text-xs text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded transition-colors"
                          title="Click to copy Session ID"
                        >
                          <span>{sid}</span>
                          {copiedId === sid ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-400" />
                          )}
                        </button>
                        {session.labels && session.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {session.labels.map((lbl: string) => (
                              <Badge key={lbl} variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {lbl}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-slate-500">
                      {dayjs(session.created_at).format('MMM D, YYYY · h:mm A')}
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleManage(session.id)}
                        className="h-7 px-2.5 text-[11px] font-medium gap-1"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* QR Code Scan Modal */}
      <Dialog open={isQrOpen} onOpenChange={setIsQrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <QrCode className="w-4 h-4 text-emerald-600" /> Scan WhatsApp QR Code
            </DialogTitle>
            <DialogDescription className="text-xs">
              Open WhatsApp on your phone, navigate to <strong>Linked Devices</strong>, and scan this QR code.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 min-h-[280px]">
            {fetchQrMutation.isPending ? (
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
                <p className="text-xs text-slate-500">Generating QR Code...</p>
              </div>
            ) : qrBase64 ? (
              <div className="flex flex-col items-center space-y-4">
                <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-200/80">
                  <img 
                    src={qrBase64.startsWith('data:image/png;base64,') ? qrBase64 : `data:image/png;base64,${qrBase64}`} 
                    alt="WhatsApp QR Code" 
                    className="w-56 h-56 rounded-md"
                  />
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => selectedSessionId && fetchQrMutation.mutate(selectedSessionId)}
                >
                  Refresh QR Code
                </Button>
              </div>
            ) : (
              <div className="text-center text-red-500 space-y-3">
                <p className="text-xs font-medium">Could not generate QR Code.</p>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => selectedSessionId && fetchQrMutation.mutate(selectedSessionId)}>
                  Retry
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Session Dialog */}
      {selectedSession && (
        <ManageSessionDialog 
          isOpen={isManageOpen} 
          onClose={() => setIsManageOpen(false)} 
          session={selectedSession}
          onScan={() => selectedSessionId && handleScan(selectedSessionId)}
          onReconnect={() => selectedSessionId && reconnectSessionMutation.mutate(selectedSessionId)}
          onDisconnect={() => selectedSessionId && disconnectSessionMutation.mutate(selectedSessionId)}
          onDelete={() => selectedSessionId && deleteSessionMutation.mutate(selectedSessionId)}
          isReconnecting={reconnectSessionMutation.isPending}
        />
      )}
    </div>
  )
}


function ManageSessionDialog({ 
  isOpen, 
  onClose, 
  session,
  onScan,
  onReconnect,
  onDisconnect,
  onDelete,
  isReconnecting,
}: { 
  isOpen: boolean
  onClose: () => void
  session: any
  onScan: () => void
  onReconnect: () => void
  onDisconnect: () => void
  onDelete: () => void
  isReconnecting: boolean
}) {
  const queryClient = useQueryClient()
  const [alias, setAlias] = useState(session.alias || '')
  const [labelsStr, setLabelsStr] = useState(session.labels?.join(', ') || '')
  const [warmup, setWarmup] = useState(session.warmup_schedule?.join(', ') || '')
  const [minInterval, setMinInterval] = useState<number>(session.min_interval_seconds ?? 10)
  const [maxInterval, setMaxInterval] = useState<number>(session.max_interval_seconds ?? 15)
  const [activeStartTime, setActiveStartTime] = useState<string>(session.active_start_time || '00:00')
  const [activeEndTime, setActiveEndTime] = useState<string>(session.active_end_time || '23:59')
  const [newAgentPhone, setNewAgentPhone] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [testText, setTestText] = useState('Hello! This is a test message sent from WhatsBlast session.')
  const [isSendingTest, setIsSendingTest] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setAlias(session.alias || '')
      setLabelsStr(session.labels?.join(', ') || '')
      setWarmup(session.warmup_schedule?.join(', ') || '')
      setMinInterval(session.min_interval_seconds ?? 10)
      setMaxInterval(session.max_interval_seconds ?? 15)
      setActiveStartTime(session.active_start_time || '00:00')
      setActiveEndTime(session.active_end_time || '23:59')
      setNewAgentPhone('')
      setTestPhone('')
      setTestText('Hello! This is a test message sent from WhatsBlast session.')
      setIsSendingTest(false)
    }
  }, [isOpen, session])

  const { data: customersRes } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('customers/').json<any>(),
    enabled: isOpen,
  })
  const customers = Array.isArray(customersRes) ? customersRes : customersRes?.results || []

  const { data: agentsResponse, isLoading: isLoadingAgents } = useQuery({
    queryKey: ['agent-phone-numbers', session.id],
    queryFn: () => api.get(`agent-phone-numbers/?session=${session.id}`).json<any>(),
    enabled: isOpen,
  })

  const agents = Array.isArray(agentsResponse) ? agentsResponse : agentsResponse?.results || []

  const updateSessionMutation = useMutation({
    mutationFn: (data: any) => api.patch(`whatsapp-sessions/${session.id}/`, { json: data }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
      toast.success('Session updated successfully')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to update session'))
  })

  const createAgentMutation = useMutation({
    mutationFn: (phone_number: string) => api.post('agent-phone-numbers/', { json: { session: session.id, phone_number } }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-phone-numbers', session.id] })
      setNewAgentPhone('')
      toast.success('Agent phone number added')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to add agent phone number'))
  })

  const deleteAgentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`agent-phone-numbers/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-phone-numbers', session.id] })
      toast.success('Agent removed')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to remove agent'))
  })

  const handleUpdateSession = () => {
    const data: any = {}
    
    data.alias = alias.trim()
    data.labels = labelsStr.split(',').map((s: string) => s.trim()).filter(Boolean)

    // Parse warmup string to array of ints
    if (warmup.trim()) {
      const parts = warmup.split(',').map((s: string) => parseInt(s.trim()))
      if (parts.some(isNaN)) {
        toast.error('Warmup schedule must be a comma-separated list of numbers')
        return
      }
      data.warmup_schedule = parts
    } else {
      data.warmup_schedule = []
    }

    data.min_interval_seconds = Number(minInterval) || 10
    data.max_interval_seconds = Number(maxInterval) || 15
    data.active_start_time = activeStartTime || '00:00'
    data.active_end_time = activeEndTime || '23:59'

    updateSessionMutation.mutate(data)
  }

  const handleAddAgent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAgentPhone.trim()) return
    createAgentMutation.mutate(newAgentPhone.trim())
  }

  const handlePickRandomCustomer = () => {
    const validCustomers = customers.filter((c: any) => c.phone_number)
    if (validCustomers.length === 0) {
      toast.error('No customer contacts with phone numbers found')
      return
    }
    const randomContact = validCustomers[Math.floor(Math.random() * validCustomers.length)]
    setTestPhone(randomContact.phone_number)
    toast.info(`Selected random contact: ${randomContact.name ? `${randomContact.name} (${randomContact.phone_number})` : randomContact.phone_number}`)
  }

  const handleSendTestMessage = async () => {
    if (!testPhone.trim() || !testText.trim()) {
      toast.error('Please enter a recipient phone number and test message')
      return
    }
    setIsSendingTest(true)
    try {
      const sessionIdStr = session.session_id || session.id
      await api.post(`messages/${sessionIdStr}/send-text`, {
        json: { to: testPhone.trim(), text: testText.trim() },
      }).json()
      toast.success(`Test message sent to ${testPhone.trim()}!`)
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || err.message || 'Failed to send test message'
      toast.error(errorMsg)
    } finally {
      setIsSendingTest(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Session</DialogTitle>
          <DialogDescription>
            Configure session settings, forwarding, and test messaging.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Key Info & Quick Actions Banner */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Session ID:</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(session.session_id || session.id)
                    toast.success('Session ID copied!')
                  }}
                  className="font-mono text-slate-800 dark:text-slate-200 font-semibold hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1"
                >
                  {session.session_id || session.id}
                  <Copy className="w-3 h-3 text-slate-400" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Phone:</span>
                <span className="font-mono">{session.phone_number || 'Not connected yet'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {(session.status || '').toLowerCase() === 'connected' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Connected</span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Disconnected</span>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 font-medium">
                    Actions
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={() => {
                      onClose()
                      onScan()
                    }}
                    className="cursor-pointer gap-2 text-xs"
                  >
                    <QrCode className="h-3.5 w-3.5 text-slate-600" />
                    Scan QR
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onReconnect()}
                    disabled={isReconnecting}
                    className="cursor-pointer gap-2 text-xs text-blue-600 focus:text-blue-600"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
                    Reconnect
                  </DropdownMenuItem>
                  {(session.status || '').toLowerCase() === 'connected' && (
                    <DropdownMenuItem
                      onClick={() => {
                        onClose()
                        onDisconnect()
                      }}
                      className="cursor-pointer gap-2 text-xs text-amber-600 focus:text-amber-600"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Logout
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      onClose()
                      onDelete()
                    }}
                    className="cursor-pointer gap-2 text-xs text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Session
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="settings">Session settings</TabsTrigger>
              <TabsTrigger value="forwarding">Forwarding</TabsTrigger>
              <TabsTrigger value="testing">Testing</TabsTrigger>
            </TabsList>

            {/* TAB 1: Session Settings */}
            <TabsContent value="settings" className="space-y-4 pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Session Alias (Friendly Name)</Label>
                  <Input 
                    value={alias} 
                    onChange={(e) => setAlias(e.target.value)} 
                    placeholder="e.g. Main Store WhatsApp"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Labels / Tags (comma-separated)</Label>
                  <Input 
                    value={labelsStr} 
                    onChange={(e) => setLabelsStr(e.target.value)} 
                    placeholder="e.g. marketing, sales, promo"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>Warmup Schedule (Messages per day)</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        Comma-separated list of numbers. First number is day 1, second is day 2, etc. The last number applies to all following days.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input 
                  value={warmup} 
                  onChange={(e) => setWarmup(e.target.value)} 
                  placeholder="e.g. 5, 10, 15, 20, 30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Min Interval (seconds)</Label>
                  <Input 
                    type="number" 
                    min={1} 
                    value={minInterval} 
                    onChange={(e) => setMinInterval(parseInt(e.target.value, 10) || 1)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Interval (seconds)</Label>
                  <Input 
                    type="number" 
                    min={1} 
                    value={maxInterval} 
                    onChange={(e) => setMaxInterval(parseInt(e.target.value, 10) || 1)} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Active Window Start</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          Daily start time for sending messages. Messages queued before this time will wait until the window opens.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input 
                    type="time" 
                    value={activeStartTime} 
                    onChange={(e) => setActiveStartTime(e.target.value)} 
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Active Window End</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          Daily end time for sending messages. Messages queued after this time will pause until the next day.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input 
                    type="time" 
                    value={activeEndTime} 
                    onChange={(e) => setActiveEndTime(e.target.value)} 
                  />
                </div>
              </div>

              <Button 
                onClick={handleUpdateSession} 
                disabled={updateSessionMutation.isPending}
                className="w-full"
              >
                {updateSessionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Session Settings
              </Button>
            </TabsContent>

            {/* TAB 2: Forwarding */}
            <TabsContent value="forwarding" className="space-y-4 pt-3">
              <p className="text-xs text-slate-500">
                Add external agent phone numbers here. Whenever this session receives a message, it will be automatically forwarded to these agents.
              </p>
              
              <form onSubmit={handleAddAgent} className="flex items-end gap-2">
                <div className="space-y-1 flex-1">
                  <Label>Add Agent Phone Number</Label>
                  <Input 
                    value={newAgentPhone} 
                    onChange={(e) => setNewAgentPhone(e.target.value)} 
                    placeholder="e.g. 60123456789"
                  />
                </div>
                <Button type="submit" disabled={!newAgentPhone.trim() || createAgentMutation.isPending}>
                  {createAgentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </form>

              <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                {isLoadingAgents ? (
                  <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-emerald-600" /></div>
                ) : agents.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">No agents added yet.</div>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {agents.map((agent: any) => (
                      <li key={agent.id} className="p-3 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                        <span className="font-medium text-sm">{agent.phone_number}</span>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                              disabled={deleteAgentMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Delete Agent?</DialogTitle>
                              <DialogDescription>
                                Are you sure you want to remove this agent's phone number?
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <DialogClose asChild>
                                <Button type="button" variant="outline">Cancel</Button>
                              </DialogClose>
                              <DialogClose asChild>
                                <Button 
                                  type="button"
                                  variant="destructive" 
                                  onClick={() => deleteAgentMutation.mutate(agent.id)}
                                  className="bg-red-600 hover:bg-red-700 text-white"
                                >
                                  Delete
                                </Button>
                              </DialogClose>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>

            {/* TAB 3: Testing */}
            <TabsContent value="testing" className="space-y-4 pt-3">
              <p className="text-xs text-slate-500">
                Send a test message using this WhatsApp session to test connection and message delivery.
              </p>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Recipient Phone Number</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePickRandomCustomer}
                      className="h-7 text-xs gap-1 text-slate-700 dark:text-slate-300"
                    >
                      <Shuffle className="h-3.5 w-3.5" /> Pick Random Contact
                    </Button>
                  </div>
                  <Input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="e.g. 60123456789"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Test Message Text</Label>
                  <Textarea
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    rows={3}
                    placeholder="Type a message to test..."
                  />
                </div>

                <Button
                  onClick={handleSendTestMessage}
                  disabled={isSendingTest || !testPhone.trim() || !testText.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {isSendingTest ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send Test Message
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
