import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  Plus,
  QrCode,
  Smartphone,
  Copy,
  Settings,
  LayoutGrid,
  List,
  Search,
  Check,
  Tag,
  Clock,
  Calendar,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import dayjs from 'dayjs'

import { api, getErrorMessage } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import type { Session, MasterPhone, User } from '@/components/admin-sessions/types'
import { rows, ownerDisplay } from '@/components/admin-sessions/types'
import { MasterPhonesCard } from '@/components/admin-sessions/components/MasterPhonesCard'
import { ManageAdminSessionDialog } from '@/components/admin-sessions/components/ManageAdminSessionDialog'

export const Route = createFileRoute('/admin/sessions')({ ssr: false, component: AdminSessionsPage })

function getStatusBadge(status?: string) {
  const s = (status || 'initializing').toLowerCase()
  switch (s) {
    case 'connected':
    case 'authenticated':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/60">
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
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800/60">
          <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
          Connecting
        </span>
      )
    case 'qr_ready':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800/60">
          <QrCode className="w-3 h-3 text-blue-500" />
          QR Ready
        </span>
      )
    case 'disconnected':
    case 'logout':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
          Disconnected
        </span>
      )
    default:
      return <Badge variant="secondary">{status || 'Initializing'}</Badge>
  }
}

function AdminSessionsPage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({ search: '', status: 'all', user: 'all', ordering: '-created_at' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [selectedScanId, setSelectedScanId] = useState<string | null>(null)
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [isQrOpen, setIsQrOpen] = useState(false)

  const [manageSession, setManageSession] = useState<Session | null>(null)
  const [isManageOpen, setIsManageOpen] = useState(false)

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [disconnectConfirmId, setDisconnectConfirmId] = useState<string | null>(null)
  const [selectedMasterSession, setSelectedMasterSession] = useState<string>('')

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(text)
    toast.success('Session ID copied!')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const query = new URLSearchParams()
  if (filters.search) query.set('search', filters.search)
  if (filters.status !== 'all') query.set('status', filters.status)
  if (filters.user !== 'all') query.set('user', filters.user)
  if (filters.ordering) query.set('ordering', filters.ordering)
  query.set('page', String(page))
  query.set('page_size', String(pageSize))

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'sessions', filters, page, pageSize],
    queryFn: () => api.get(`whatsapp-sessions/?${query.toString()}`).json<unknown>(),
    refetchInterval: 3000,
  })
  const { data: usersData } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('users/').json<unknown>(),
  })
  const { data: mastersData, isLoading: mastersLoading } = useQuery({
    queryKey: ['admin', 'master-phone-numbers'],
    queryFn: () => api.get('master-phone-numbers/').json<unknown>(),
    refetchInterval: 3000,
  })

  const { data: qrQueryData } = useQuery({
    queryKey: ['session-qr', selectedScanId],
    queryFn: () => api.get(`whatsapp-sessions/${selectedScanId}/qr/`).json<any>(),
    enabled: isQrOpen && Boolean(selectedScanId),
    refetchInterval: isQrOpen ? 2000 : false,
  })

  useEffect(() => {
    if (isQrOpen && qrQueryData) {
      if (qrQueryData.status === 'CONNECTED') {
        setIsQrOpen(false)
        setQrBase64(null)
        toast.success('WhatsApp Connected Successfully! 🎉')
        queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] })
      } else {
        const qr = qrQueryData.qrBase64 || qrQueryData.qr_code || qrQueryData.data?.qrBase64
        if (qr) {
          setQrBase64(qr)
        }
      }
    }
  }, [isQrOpen, qrQueryData, queryClient])

  const sessions = rows<Session>(data)
  const totalCount = Array.isArray(data) ? sessions.length : (data as { count?: number } | undefined)?.count || sessions.length
  const maxPage = Math.max(1, Math.ceil(totalCount / pageSize))
  const users = rows<User>(usersData)
  const masters = rows<MasterPhone>(mastersData)
  const masterSessionIds = new Set(masters.map((m) => m.session))
  const connectedSessions = sessions.filter((s) => (s.status || '').toLowerCase() === 'connected' && !masterSessionIds.has(s.id))

  const refreshSessions = () => queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] })
  const refreshMasters = () => queryClient.invalidateQueries({ queryKey: ['admin', 'master-phone-numbers'] })

  const createSession = useMutation({
    mutationFn: () => api.post('whatsapp-sessions/').json<Session>(),
    onSuccess: (session) => {
      refreshSessions()
      toast.success('Admin WhatsApp session created')
      handleScan(session.id)
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Unable to create session. Only super admins can create admin sessions.')),
  })

  const fetchQr = useMutation({
    mutationFn: (id: string) => api.get(`whatsapp-sessions/${id}/qr/`).json<any>(),
    onSuccess: (data) => {
      const qr = data.qrBase64 || data.data?.qrBase64
      if (qr) setQrBase64(qr)
      else toast.error('No QR code returned')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to fetch QR. Try again.')),
  })

  const reconnectSession = useMutation({
    mutationFn: (id: string) => api.post(`whatsapp-sessions/${id}/reconnect/`).json(),
    onSuccess: () => {
      refreshSessions()
      toast.success('Reconnecting session...')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to reconnect session')),
  })

  const logoutSession = useMutation({
    mutationFn: (id: string) => api.post(`whatsapp-sessions/${id}/logout/`).json(),
    onSuccess: () => {
      refreshSessions()
      toast.success('Session disconnected')
      setDisconnectConfirmId(null)
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to disconnect session')),
  })

  const deleteSession = useMutation({
    mutationFn: (id: string) => api.delete(`whatsapp-sessions/${id}/`),
    onSuccess: () => {
      refreshSessions()
      toast.success('Session deleted successfully')
      setDeleteConfirmId(null)
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to delete session')),
  })

  const createMaster = useMutation({
    mutationFn: (session: string) => api.post('master-phone-numbers/', { json: { session, is_active: true } }).json<MasterPhone>(),
    onSuccess: () => {
      refreshMasters()
      setSelectedMasterSession('')
      toast.success('Master phone number added')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Unable to add master phone number')),
  })

  const toggleMaster = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`master-phone-numbers/${id}/`, { json: { is_active } }).json<MasterPhone>(),
    onSuccess: refreshMasters,
    onError: async (err) => toast.error(await getErrorMessage(err, 'Unable to update master phone number')),
  })

  const deleteMaster = useMutation({
    mutationFn: (id: string) => api.delete(`master-phone-numbers/${id}/`),
    onSuccess: () => {
      refreshMasters()
      toast.success('Master phone number removed')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Unable to remove master phone number')),
  })

  function handleScan(id: string) {
    setSelectedScanId(id)
    setQrBase64(null)
    setIsQrOpen(true)
    fetchQr.mutate(id)
  }

  function handleOpenManage(s: Session) {
    setManageSession(s)
    setIsManageOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <p className="text-slate-500 text-sm">
          Manage all merchant & admin WhatsApp sessions, scan QR codes, configure master numbers, and reassign owners.
        </p>
        <Button onClick={() => createSession.mutate()} disabled={createSession.isPending}>
          {createSession.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          New Admin Session
        </Button>
      </div>

      {/* Master OTP Phones Section */}
      <MasterPhonesCard
        masters={masters}
        mastersLoading={mastersLoading}
        connectedSessions={connectedSessions}
        selectedMasterSession={selectedMasterSession}
        setSelectedMasterSession={setSelectedMasterSession}
        createMaster={createMaster}
        toggleMaster={toggleMaster}
        deleteMaster={deleteMaster}
        getStatusBadge={getStatusBadge}
      />

      {/* Main Sessions List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-emerald-600" /> All Sessions
            </CardTitle>
            <CardDescription>{totalCount} session(s) found across system</CardDescription>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
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
        </CardHeader>
        <CardContent>
          {/* Filters Bar */}
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by phone number or ID..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-9"
              />
            </div>

            <Select value={filters.status} onValueChange={(status) => setFilters({ ...filters, status })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="initializing">Initializing / Starting</SelectItem>
                <SelectItem value="qr_ready">QR Ready</SelectItem>
                <SelectItem value="connecting">Connecting</SelectItem>
                <SelectItem value="connected">Connected</SelectItem>
                <SelectItem value="disconnected">Disconnected</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.user} onValueChange={(user) => setFilters({ ...filters, user })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All merchants & admins</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.phone_number || u.id} ({u.role || 'merchant'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.ordering} onValueChange={(ordering) => setFilters({ ...filters, ordering })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-created_at">Newest</SelectItem>
                <SelectItem value="created_at">Oldest</SelectItem>
                <SelectItem value="session_id">Session A-Z</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sessions Display (Grid / Table) */}
          {isLoading ? (
            <div className="flex min-h-56 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sessions.map((s) => {
                const sid = s.session_id || s.id
                const isConnected = (s.status || '').toLowerCase() === 'connected' || (s.status || '').toLowerCase() === 'authenticated'

                return (
                  <div
                    key={s.id}
                    className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 flex flex-col justify-between space-y-3.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                            isConnected
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          <img src="/futuristic-whatsapp-logo.png" alt="WhatsApp" className="w-6 h-6 object-contain" />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-bold text-base text-slate-900 dark:text-slate-100 font-mono truncate">
                            {s.phone_number || 'Unconnected Session'}
                          </div>
                          <div className="text-xs text-slate-400">
                            {s.created_at ? dayjs(s.created_at).format('MMM D, YYYY · h:mm A') : '-'}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {getStatusBadge(s.status)}
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      {s.alias && (
                        <div className="flex items-center justify-between bg-emerald-50/60 dark:bg-emerald-950/30 px-3 py-1.5 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium shrink-0 flex items-center gap-1">
                            <Tag className="w-3 h-3 text-emerald-600" /> Alias:
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{s.alias}</span>
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
                          {s.min_interval_seconds ?? 10}s - {s.max_interval_seconds ?? 15}s
                        </span>
                      </div>

                      <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                        <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" /> Active Window:
                        </span>
                        <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                          {s.active_start_time || '00:00'} - {s.active_end_time || '23:59'}
                        </span>
                      </div>

                      {s.labels && s.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {s.labels.map((lbl) => (
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
                        onClick={() => handleOpenManage(s)}
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
              {sessions.length === 0 && (
                <div className="col-span-full py-8 text-center text-sm text-slate-500">No sessions found.</div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session ID</TableHead>
                    <TableHead>Alias</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Merchant / Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Warmup & Limit</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium font-mono text-xs flex items-center gap-1 text-slate-600 dark:text-slate-400">
                            {s.session_id || 'Unnamed session'}
                            <button
                              type="button"
                              onClick={() => copyToClipboard(s.session_id || s.id)}
                              title="Copy Session ID"
                            >
                              <Copy className="h-3 w-3 text-slate-400 hover:text-slate-600" />
                            </button>
                          </div>
                          {s.labels && s.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {s.labels.map((lbl) => (
                                <Badge key={lbl} variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  {lbl}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {s.alias ? (
                          <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            {s.alias}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{s.phone_number || '-'}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{ownerDisplay(s.user)}</div>
                      </TableCell>
                      <TableCell>{getStatusBadge(s.status)}</TableCell>
                      <TableCell className="text-xs">
                        <div><span className="font-medium text-slate-500">Max/day:</span> {s.max_message_count_per_day ?? 50}</div>
                        <div className="truncate max-w-48 text-slate-400" title={s.warmup_schedule?.join(', ') || 'No schedule'}>
                          <span className="font-medium text-slate-500">Warmup:</span> {s.warmup_schedule?.join(', ') || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenManage(s)}
                          title="Manage Session"
                        >
                          <Settings className="h-4 w-4 md:mr-1" />
                          <span className="hidden md:inline">Manage</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {sessions.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No sessions found.</p> : null}
            </div>
          )}

          {/* Pagination */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-slate-500">
            <div>
              Page {page} / {maxPage} • {totalCount} total • Showing {sessions.length}
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v))
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="20">20 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || isLoading}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(maxPage, p + 1))} disabled={page >= maxPage || isLoading}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* QR Code Dialog */}
      <Dialog open={isQrOpen} onOpenChange={setIsQrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan WhatsApp QR Code</DialogTitle>
            <DialogDescription>Open WhatsApp on your phone, go to Linked Devices, and scan this QR code.</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg bg-slate-50 p-6 dark:bg-slate-900">
            {fetchQr.isPending ? (
              <div className="space-y-4 text-center">
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-600" />
                <p className="text-sm text-slate-500">Generating QR Code...</p>
              </div>
            ) : qrBase64 ? (
              <div className="flex flex-col items-center">
                <img
                  src={qrBase64.startsWith('data:image/png;base64,') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                  alt="WhatsApp QR Code"
                  className="h-64 w-64 rounded-lg border-4 border-white shadow-sm"
                />
                <Button variant="outline" className="mt-6" onClick={() => selectedScanId && fetchQr.mutate(selectedScanId)}>
                  Refresh QR Code
                </Button>
              </div>
            ) : (
              <div className="text-center text-red-500">
                <p>Could not generate QR Code.</p>
                <Button variant="outline" className="mt-4" onClick={() => selectedScanId && fetchQr.mutate(selectedScanId)}>
                  Retry
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={Boolean(disconnectConfirmId)} onOpenChange={(open) => !open && setDisconnectConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect WhatsApp Session?</DialogTitle>
            <DialogDescription>
              This will log out the WhatsApp Web socket connection. You will need to scan the QR code again to reconnect.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisconnectConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => disconnectConfirmId && logoutSession.mutate(disconnectConfirmId)}
              disabled={logoutSession.isPending}
            >
              {logoutSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteConfirmId)} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete WhatsApp Session?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this session? Redis credentials and session state will be removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteSession.mutate(deleteConfirmId)}
              disabled={deleteSession.isPending}
            >
              {deleteSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Session Dialog */}
      {manageSession && (
        <ManageAdminSessionDialog
          isOpen={isManageOpen}
          onClose={() => setIsManageOpen(false)}
          session={manageSession}
          users={users}
          onUpdated={refreshSessions}
          onScan={() => handleScan(manageSession.id)}
          onReconnect={() => reconnectSession.mutate(manageSession.id)}
          onDisconnect={() => setDisconnectConfirmId(manageSession.id)}
          onDelete={() => setDeleteConfirmId(manageSession.id)}
          isReconnecting={reconnectSession.isPending}
          getStatusBadge={getStatusBadge}
        />
      )}
    </div>
  )
}
