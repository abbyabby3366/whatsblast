import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { 
  Loader2, 
  Plus, 
  QrCode, 
  Smartphone, 
  Settings, 
  Copy, 
  LayoutGrid, 
  List, 
  Search,
  Check,
  Tag,
  Clock,
  Calendar,
  MessageSquare,
} from 'lucide-react'
import dayjs from 'dayjs'

import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { api, getErrorMessage } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { ManageMerchantSessionDialog } from '@/components/merchant-whatsapp-sessions/components/ManageMerchantSessionDialog'
import { PhoneActiveIndicator, PhoneActiveTooltip, LastSentMessageTooltip } from '@/components/whatsapp-sessions/PhoneActiveIndicator'

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

    const now = dayjs()
    const phoneActive = sessions.filter((s: any) => {
      if (!s.last_phone_activity_at) return false
      return now.diff(dayjs(s.last_phone_activity_at), 'day', true) <= 3
    }).length

    const lastMessageActive = sessions.filter((s: any) => {
      if (!s.last_physical_phone_sent_message_at) return false
      return now.diff(dayjs(s.last_physical_phone_sent_message_at), 'day', true) <= 14
    }).length

    return { total, connected, disconnected, phoneActive, lastMessageActive }
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
    toast.success('Session ID copied!')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const selectedSession = useMemo(() => {
    if (!selectedSessionId) return null
    return sessions.find((s: any) => s.id === selectedSessionId || s.session_id === selectedSessionId) || null
  }, [sessions, selectedSessionId])

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-10">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <p className="text-xs text-slate-500">
            Connect and manage multiple WhatsApp accounts for multi-session blast distribution.
          </p>
        </div>

        <Button 
          onClick={() => createSessionMutation.mutate()} 
          disabled={createSessionMutation.isPending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-all h-9 px-3.5 gap-1.5"
        >
          {createSessionMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add New WhatsApp Session
        </Button>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 px-3 py-1.5 flex items-center justify-between shadow-2xs">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Sessions</span>
          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">{stats.total}</span>
        </div>
        <div className="bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200/60 dark:border-emerald-900/40 px-3 py-1.5 flex items-center justify-between shadow-2xs">
          <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Active & Connected</span>
          <span className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300">{stats.connected}</span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200/80 dark:border-slate-800 px-3 py-1.5 flex items-center justify-between shadow-2xs">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Disconnected</span>
          <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-400">{stats.disconnected}</span>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 px-3 py-1.5 flex items-center justify-between shadow-2xs">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-0.5">
            Phone Active
            <PhoneActiveTooltip />
          </span>
          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">{stats.phoneActive}</span>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 px-3 py-1.5 flex items-center justify-between shadow-2xs">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-0.5">
            Last Message
            <LastSentMessageTooltip />
          </span>
          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">{stats.lastMessageActive}</span>
        </div>
      </div>

      {/* Toolbar & Search */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between bg-slate-50/80 dark:bg-slate-900/50 p-2 rounded-xl border border-slate-200/80 dark:border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <Input 
            placeholder="Search by phone, ID, alias, or label..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <div className="flex items-center gap-1 bg-white dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors ${
                viewMode === 'grid'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
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
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <List className="w-3.5 h-3.5" /> List
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid View */}
      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
          <Smartphone className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No sessions found</p>
          <p className="text-xs text-slate-400 mt-1">Try clearing your search query or add a new WhatsApp session.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSessions.map((session: any) => {
            const sid = session.session_id || session.id
            const isConnected = (session.status || '').toLowerCase() === 'connected'

            return (
              <div
                key={session.id}
                className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 flex flex-col justify-between space-y-3.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                      isConnected 
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' 
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      <WhatsAppIcon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-bold text-base text-slate-900 dark:text-slate-100 font-mono whitespace-nowrap">
                        {session.phone_number || 'Unconnected Session'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {dayjs(session.created_at).format('DD/MM/YY · h:mm A')}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isConnected ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/60">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        Connected
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleScan(session.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800/60 dark:hover:bg-amber-900/60 cursor-pointer transition-colors"
                        title="Disconnected. Click to scan QR code and connect WhatsApp"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                        Disconnected (Connect)
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  {session.alias && (
                    <div className="flex items-center justify-between bg-emerald-50/60 dark:bg-emerald-950/30 px-3 py-1 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium shrink-0 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-emerald-600" /> Alias:
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{session.alias}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 px-3 py-1 rounded-xl border border-slate-100 dark:border-slate-800/80">
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

                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 px-3 py-1 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" /> Interval:
                    </span>
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                      {session.min_interval_seconds ?? 10}m - {session.max_interval_seconds ?? 15}m
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 px-3 py-1 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" /> Active Window:
                    </span>
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                      {session.active_start_time || '00:00'} - {session.active_end_time || '23:59'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 px-3 py-1 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
                      <Smartphone className="w-3 h-3 text-slate-400" /> Phone Active:
                      <PhoneActiveTooltip />
                    </span>
                    <PhoneActiveIndicator lastPhoneActivityAt={session.last_phone_activity_at} />
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 px-3 py-1 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-slate-400" /> Last Message:
                      <LastSentMessageTooltip />
                    </span>
                    <PhoneActiveIndicator lastPhoneActivityAt={session.last_physical_phone_sent_message_at} emptyLabel="No messages sent" />
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
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-center text-xs">Status</TableHead>
                <TableHead className="text-xs">Alias</TableHead>
                <TableHead className="text-xs">Phone Number</TableHead>
                <TableHead className="text-xs">Session ID & Tags</TableHead>
                <TableHead className="text-xs">Interval</TableHead>
                <TableHead className="text-xs">Active Window</TableHead>
                <TableHead className="text-xs">
                  <span className="flex items-center gap-1">
                    Phone Active <PhoneActiveTooltip />
                  </span>
                </TableHead>
                <TableHead className="text-xs">
                  <span className="flex items-center gap-1">
                    Last Message <LastSentMessageTooltip />
                  </span>
                </TableHead>
                <TableHead className="text-xs">Created At</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSessions.map((session: any) => {
                const sid = session.session_id || session.id
                const isConnected = (session.status || '').toLowerCase() === 'connected'
                const isCopied = copiedId === sid

                return (
                  <TableRow key={session.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <TableCell className="text-center py-2.5">
                      {isConnected ? (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" title="Connected" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleScan(session.id)}
                          className="inline-block w-3 h-3 rounded-full bg-amber-500 hover:scale-125 transition-transform cursor-pointer"
                          title="Disconnected. Click to scan QR code and connect WhatsApp"
                        />
                      )}
                    </TableCell>
                    <TableCell className="py-2.5">
                      {session.alias ? (
                        <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <Tag className="w-3 h-3 text-emerald-600 shrink-0" />
                          {session.alias}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">-</span>
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
                          {isCopied ? (
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
                    <TableCell className="py-2.5 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {session.min_interval_seconds ?? 10}m - {session.max_interval_seconds ?? 15}m
                    </TableCell>
                    <TableCell className="py-2.5 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {session.active_start_time || '00:00'} - {session.active_end_time || '23:59'}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <PhoneActiveIndicator lastPhoneActivityAt={session.last_phone_activity_at} />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <PhoneActiveIndicator lastPhoneActivityAt={session.last_physical_phone_sent_message_at} emptyLabel="No messages sent" />
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {dayjs(session.created_at).format('DD/MM/YY · h:mm A')}
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
              <div 
                onClick={() => selectedSessionId && fetchQrMutation.mutate(selectedSessionId)}
                className="text-center text-red-500 space-y-3 cursor-pointer p-4 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                title="Failed to connect. Click error message to retry connecting WhatsApp"
              >
                <p className="text-xs font-semibold">Could not generate QR Code / Connection failed.</p>
                <p className="text-[11px] text-red-400">Click here or button below to retry connecting WhatsApp</p>
                <Button variant="outline" size="sm" className="text-xs h-8">
                  Retry Connect
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Session Dialog */}
      {selectedSession && (
        <ManageMerchantSessionDialog 
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
