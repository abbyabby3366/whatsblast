import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  Plus,
  QrCode,
  ShieldCheck,
  Smartphone,
  Trash2,
  Copy,
  Settings,
  RefreshCw,
  LogOut,
  UserCheck,
  HelpCircle,
  Send,
  Shuffle,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'

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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const Route = createFileRoute('/admin/sessions')({ ssr: false, component: AdminSessionsPage })

type User = { id: string; phone_number?: string; role?: string }
type Session = {
  id: string
  session_id?: string
  phone_number?: string
  status?: string
  user?: string | User
  warmup_schedule?: number[]
  max_message_count_per_day?: number
  min_interval_seconds?: number
  max_interval_seconds?: number
  active_start_time?: string
  active_end_time?: string
  created_at?: string
}
type MasterPhone = {
  id: string
  session: string
  session_id?: string
  session_status?: string
  phone_number?: string
  is_active: boolean
  created_at?: string
}

function rows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && 'results' in data) return (data as { results?: T[] }).results ?? []
  return []
}

function ownerDisplay(user: Session['user']) {
  if (!user) return '-'
  if (typeof user === 'string') return user
  return user.phone_number ? `${user.phone_number} (${user.role || 'user'})` : user.id
}

function ownerId(user: Session['user']) {
  if (!user) return ''
  if (typeof user === 'string') return user
  return user.id
}

function getStatusBadge(status?: string) {
  const s = (status || 'initializing').toLowerCase()
  switch (s) {
    case 'connected':
      return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">Connected</Badge>
    case 'connecting':
    case 'starting':
      return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">Connecting</Badge>
    case 'qr_ready':
      return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30">QR Ready</Badge>
    case 'disconnected':
    case 'logout':
      return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30">Disconnected</Badge>
    default:
      return <Badge variant="secondary">{status || 'Initializing'}</Badge>
  }
}

function AdminSessionsPage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({ search: '', status: 'all', user: 'all', ordering: '-created_at' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [selectedScanId, setSelectedScanId] = useState<string | null>(null)
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [isQrOpen, setIsQrOpen] = useState(false)

  const [manageSession, setManageSession] = useState<Session | null>(null)
  const [isManageOpen, setIsManageOpen] = useState(false)

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [disconnectConfirmId, setDisconnectConfirmId] = useState<string | null>(null)
  const [selectedMasterSession, setSelectedMasterSession] = useState<string>('')

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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" /> Master OTP Phone Numbers
          </CardTitle>
          <CardDescription>
            OTPs for user registration and password resets are routed through active master numbers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Select
              value={selectedMasterSession}
              onValueChange={setSelectedMasterSession}
              disabled={createMaster.isPending || connectedSessions.length === 0}
            >
              <SelectTrigger className="md:w-96">
                <SelectValue placeholder={connectedSessions.length ? 'Select connected session' : 'No available connected sessions'} />
              </SelectTrigger>
              <SelectContent>
                {connectedSessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.phone_number ? `${s.phone_number} (${s.session_id || s.id})` : s.session_id || s.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={() => {
                if (!selectedMasterSession) {
                  toast.error('Please select a session first')
                  return
                }
                createMaster.mutate(selectedMasterSession)
              }}
              disabled={createMaster.isPending || !selectedMasterSession}
            >
              {createMaster.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add to Master OTP
            </Button>
          </div>
          {mastersLoading ? (
            <div className="flex min-h-24 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone</TableHead>
                    <TableHead>Session / Redis Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {masters.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.phone_number || '-'}</TableCell>
                      <TableCell>
                        <div className="font-medium font-mono text-xs">{m.session_id || m.session}</div>
                        <div className="text-[11px] font-mono text-emerald-600">wa_session:{m.session_id || m.session}</div>
                      </TableCell>
                      <TableCell>{getStatusBadge(m.session_status)}</TableCell>
                      <TableCell>
                        <Switch checked={m.is_active} onCheckedChange={(is_active) => toggleMaster.mutate({ id: m.id, is_active })} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => deleteMaster.mutate(m.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {masters.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No master OTP phone numbers configured.</p> : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-emerald-600" /> All Sessions
          </CardTitle>
          <CardDescription>{totalCount} session(s) found across system</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters Bar */}
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Search session/phone/merchant"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
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

          {/* Table */}
          {isLoading ? (
            <div className="flex min-h-56 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session ID / Redis Key</TableHead>
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
                        <div className="font-medium font-mono text-xs flex items-center gap-1">
                          {s.session_id || 'Unnamed session'}
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(s.session_id || s.id)
                              toast.success('Session ID copied!')
                            }}
                            title="Copy Session ID"
                          >
                            <Copy className="h-3 w-3 text-slate-400 hover:text-slate-600" />
                          </button>
                        </div>
                        <div className="text-[11px] font-mono text-emerald-600 flex items-center gap-1">
                          wa_session:{s.session_id || s.id}
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`wa_session:${s.session_id || s.id}`)
                              toast.success('Redis auth prefix copied!')
                            }}
                            title="Copy Redis Key Prefix"
                          >
                            <Copy className="h-3 w-3 text-emerald-600/70 hover:text-emerald-700" />
                          </button>
                        </div>
                        <div className="text-[10px] text-slate-400">DB ID: {s.id}</div>
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
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleScan(s.id)}
                            title="Scan QR Code"
                          >
                            <QrCode className="h-4 w-4 md:mr-1" />
                            <span className="hidden md:inline">Scan</span>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenManage(s)}
                            title="Manage Session Settings"
                          >
                            <Settings className="h-4 w-4 md:mr-1" />
                            <span className="hidden md:inline">Manage</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => reconnectSession.mutate(s.id)}
                            disabled={reconnectSession.isPending}
                            title="Reconnect Session"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>

                          {(s.status || '').toLowerCase() === 'connected' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              onClick={() => setDisconnectConfirmId(s.id)}
                              title="Disconnect Session"
                            >
                              <LogOut className="h-4 w-4" />
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteConfirmId(s.id)}
                            title="Delete Session"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
        />
      )}
    </div>
  )
}

function ManageAdminSessionDialog({
  isOpen,
  onClose,
  session,
  users,
  onUpdated,
}: {
  isOpen: boolean
  onClose: () => void
  session: Session
  users: User[]
  onUpdated: () => void
}) {
  const queryClient = useQueryClient()
  const [selectedUser, setSelectedUser] = useState(ownerId(session.user))
  const [maxMessages, setMaxMessages] = useState<number>(session.max_message_count_per_day ?? 50)
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
      setSelectedUser(ownerId(session.user))
      setMaxMessages(session.max_message_count_per_day ?? 50)
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

  const { data: agentsResponse, isLoading: isLoadingAgents } = useQuery({
    queryKey: ['agent-phone-numbers', session.id],
    queryFn: () => api.get(`agent-phone-numbers/?session=${session.id}`).json<any>(),
    enabled: isOpen,
  })

  const agents = Array.isArray(agentsResponse) ? agentsResponse : agentsResponse?.results || []

  const updateSessionMutation = useMutation({
    mutationFn: (data: any) => api.patch(`whatsapp-sessions/${session.id}/`, { json: data }).json(),
    onSuccess: () => {
      onUpdated()
      toast.success('Session updated successfully')
      onClose()
    },
    onError: () => toast.error('Failed to update session'),
  })

  const createAgentMutation = useMutation({
    mutationFn: (phone_number: string) => api.post('agent-phone-numbers/', { json: { session: session.id, phone_number } }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-phone-numbers', session.id] })
      setNewAgentPhone('')
      toast.success('Agent phone number added')
    },
    onError: () => toast.error('Failed to add agent phone number'),
  })

  const deleteAgentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`agent-phone-numbers/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-phone-numbers', session.id] })
      toast.success('Agent removed')
    },
    onError: () => toast.error('Failed to remove agent'),
  })

  const handleSave = () => {
    const patchData: any = {}
    if (selectedUser) {
      patchData.user = selectedUser
    }
    patchData.max_message_count_per_day = Number(maxMessages) || 50
    patchData.min_interval_seconds = Number(minInterval) || 10
    patchData.max_interval_seconds = Number(maxInterval) || 15
    patchData.active_start_time = activeStartTime || '00:00'
    patchData.active_end_time = activeEndTime || '23:59'

    if (warmup.trim()) {
      const parts = warmup.split(',').map((s) => parseInt(s.trim()))
      if (parts.some(isNaN)) {
        toast.error('Warmup schedule must be a comma-separated list of numbers')
        return
      }
      patchData.warmup_schedule = parts
    } else {
      patchData.warmup_schedule = []
    }

    updateSessionMutation.mutate(patchData)
  }

  const handleAddAgent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAgentPhone.trim()) return
    createAgentMutation.mutate(newAgentPhone.trim())
  }

  const handlePickRandomUser = () => {
    const usersWithPhone = users.filter((u) => u.phone_number)
    if (usersWithPhone.length === 0) {
      toast.error('No users with phone numbers available to pick')
      return
    }
    const randomUser = usersWithPhone[Math.floor(Math.random() * usersWithPhone.length)]
    if (randomUser.phone_number) {
      setTestPhone(randomUser.phone_number)
      toast.info(`Selected random contact: ${randomUser.phone_number}`)
    }
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
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-emerald-600" /> Manage Session
          </DialogTitle>
          <DialogDescription>
            Configure session settings, forwarding, and test messaging.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Key Info Banner */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Session ID:</span>
              <span className="font-mono font-semibold">{session.session_id || session.id}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Redis Auth Key:</span>
              <span className="font-mono text-emerald-600 font-semibold">wa_session:{session.session_id || session.id}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Phone Number:</span>
              <span className="font-mono">{session.phone_number || 'Not connected yet'}</span>
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
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-slate-500" /> Assign Merchant / Owner
                </Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.phone_number || u.id} ({u.role || 'user'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Messages Per Day</Label>
                  <Input
                    type="number"
                    value={maxMessages}
                    onChange={(e) => setMaxMessages(Number(e.target.value))}
                    placeholder="50"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Warmup Schedule</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          Warmup schedule is a comma-separated sequence of daily max message caps during warmup phase.
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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Active Window Start</Label>
                  <Input
                    type="time"
                    value={activeStartTime}
                    onChange={(e) => setActiveStartTime(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Active Window End</Label>
                  <Input
                    type="time"
                    value={activeEndTime}
                    onChange={(e) => setActiveEndTime(e.target.value)}
                  />
                </div>
              </div>

              <Button onClick={handleSave} disabled={updateSessionMutation.isPending} className="w-full">
                {updateSessionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </TabsContent>

            {/* TAB 2: Forwarding */}
            <TabsContent value="forwarding" className="space-y-4 pt-3">
              <p className="text-xs text-slate-500">
                Messages received on this session will be automatically forwarded to these agent phone numbers.
              </p>

              <form onSubmit={handleAddAgent} className="flex items-end gap-2">
                <div className="space-y-1 flex-1">
                  <Label>Agent Phone Number</Label>
                  <Input
                    value={newAgentPhone}
                    onChange={(e) => setNewAgentPhone(e.target.value)}
                    placeholder="e.g. 60123456789"
                  />
                </div>
                <Button type="submit" disabled={!newAgentPhone.trim() || createAgentMutation.isPending}>
                  {createAgentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </form>

              <div className="border rounded-md overflow-hidden">
                {isLoadingAgents ? (
                  <div className="p-4 flex justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                  </div>
                ) : agents.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">No forwarding agents added.</div>
                ) : (
                  <ul className="divide-y">
                    {agents.map((agent: any) => (
                      <li key={agent.id} className="p-3 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                        <span className="font-medium text-sm font-mono">{agent.phone_number}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                          onClick={() => deleteAgentMutation.mutate(agent.id)}
                          disabled={deleteAgentMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
                      onClick={handlePickRandomUser}
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
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
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
