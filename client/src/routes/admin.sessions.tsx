import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, QrCode, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const Route = createFileRoute('/admin/sessions')({ ssr: false, component: AdminSessionsPage })

type User = { id: string; phone_number?: string; role?: string }
type Session = { id: string; session_id?: string; phone_number?: string; status?: string; user?: string | User; warmup_schedule?: number[]; created_at?: string }
type MasterPhone = { id: string; session: string; session_id?: string; session_status?: string; phone_number?: string; is_active: boolean; created_at?: string }
function rows<T>(data: unknown): T[] { if (Array.isArray(data)) return data as T[]; if (data && typeof data === 'object' && 'results' in data) return (data as { results?: T[] }).results ?? []; return [] }
function owner(user: Session['user']) { return !user ? '-' : typeof user === 'string' ? user : user.phone_number || user.id || '-' }

function AdminSessionsPage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({ search: '', status: 'all', user: 'all', ordering: '-created_at' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [isQrOpen, setIsQrOpen] = useState(false)
  const query = new URLSearchParams()
  if (filters.search) query.set('search', filters.search)
  if (filters.status !== 'all') query.set('status', filters.status)
  if (filters.user !== 'all') query.set('user', filters.user)
  if (filters.ordering) query.set('ordering', filters.ordering)
  query.set('page', String(page))
  query.set('page_size', String(pageSize))

  const { data, isLoading } = useQuery({ queryKey: ['admin', 'sessions', filters, page, pageSize], queryFn: () => api.get(`whatsapp-sessions/?${query.toString()}`).json<unknown>() })
  const { data: usersData } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.get('users/').json<unknown>() })
  const { data: mastersData, isLoading: mastersLoading } = useQuery({ queryKey: ['admin', 'master-phone-numbers'], queryFn: () => api.get('master-phone-numbers/').json<unknown>() })
  const sessions = rows<Session>(data)
  const totalCount = Array.isArray(data) ? sessions.length : (data as { count?: number } | undefined)?.count || sessions.length
  const maxPage = Math.max(1, Math.ceil(totalCount / pageSize))
  const users = rows<User>(usersData).filter((u) => u.role !== 'customer')
  const masters = rows<MasterPhone>(mastersData)
  const masterSessionIds = new Set(masters.map((m) => m.session))
  const connectedSessions = sessions.filter((s) => s.status === 'connected' && !masterSessionIds.has(s.id))
  const refreshSessions = () => queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] })
  const refreshMasters = () => queryClient.invalidateQueries({ queryKey: ['admin', 'master-phone-numbers'] })

  const createSession = useMutation({ mutationFn: () => api.post('whatsapp-sessions/').json<Session>(), onSuccess: (session) => { refreshSessions(); toast.success('Admin WhatsApp session created'); handleScan(session.id) }, onError: () => toast.error('Unable to create session. Only super admins can create admin sessions.') })
  const fetchQr = useMutation({ mutationFn: (id: string) => api.get(`whatsapp-sessions/${id}/qr/`).json<any>(), onSuccess: (data) => { const qr = data.qrBase64 || data.data?.qrBase64; if (qr) setQrBase64(qr); else toast.error('No QR code returned') }, onError: () => toast.error('Failed to fetch QR. Try again.') })
  const createMaster = useMutation({ mutationFn: (session: string) => api.post('master-phone-numbers/', { json: { session, is_active: true } }).json<MasterPhone>(), onSuccess: () => { refreshMasters(); toast.success('Master phone number added') }, onError: () => toast.error('Unable to add master phone number') })
  const toggleMaster = useMutation({ mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => api.patch(`master-phone-numbers/${id}/`, { json: { is_active } }).json<MasterPhone>(), onSuccess: refreshMasters, onError: () => toast.error('Unable to update master phone number') })
  const deleteMaster = useMutation({ mutationFn: (id: string) => api.delete(`master-phone-numbers/${id}/`), onSuccess: () => { refreshMasters(); toast.success('Master phone number removed') }, onError: () => toast.error('Unable to remove master phone number') })

  function handleScan(id: string) { setSelectedSessionId(id); setQrBase64(null); setIsQrOpen(true); fetchQr.mutate(id) }

  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h2 className="text-2xl font-bold tracking-tight">WhatsApp Sessions</h2><p className="text-slate-500">Super admins can create sessions, scan WhatsApp QR, then choose master numbers for OTP delivery.</p></div><Button onClick={() => createSession.mutate()} disabled={createSession.isPending}><Plus className="mr-2 h-4 w-4" /> New Admin Session</Button></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Master OTP Phone Numbers</CardTitle><CardDescription>OTPs for register and forgot password are sent only through active master numbers.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-col gap-2 md:flex-row"><Select onValueChange={(session) => createMaster.mutate(session)} disabled={createMaster.isPending || connectedSessions.length === 0}><SelectTrigger className="md:w-96"><SelectValue placeholder={connectedSessions.length ? 'Add connected session as master' : 'No connected sessions available'} /></SelectTrigger><SelectContent>{connectedSessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.phone_number || s.session_id || s.id}</SelectItem>)}</SelectContent></Select></div>{mastersLoading ? <div className="flex min-h-24 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Phone</TableHead><TableHead>Session</TableHead><TableHead>Status</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{masters.map((m) => <TableRow key={m.id}><TableCell>{m.phone_number || '-'}</TableCell><TableCell><div className="font-medium">{m.session_id || m.session}</div><div className="text-xs text-slate-500">{m.session}</div></TableCell><TableCell><Badge variant="secondary">{m.session_status || '-'}</Badge></TableCell><TableCell><Switch checked={m.is_active} onCheckedChange={(is_active) => toggleMaster.mutate({ id: m.id, is_active })} /></TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" className="text-red-600" onClick={() => deleteMaster.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table>{masters.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No master OTP phone numbers configured.</p> : null}</div>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> Sessions</CardTitle><CardDescription>{sessions.length} session(s) found</CardDescription></CardHeader><CardContent><div className="mb-4 grid gap-3 md:grid-cols-4"><Input placeholder="Search session/phone/merchant" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><Select value={filters.status} onValueChange={(status) => setFilters({ ...filters, status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="initializing">Initializing</SelectItem><SelectItem value="connecting">Connecting</SelectItem><SelectItem value="connected">Connected</SelectItem><SelectItem value="disconnected">Disconnected</SelectItem><SelectItem value="logout">Logout</SelectItem></SelectContent></Select><Select value={filters.user} onValueChange={(user) => setFilters({ ...filters, user })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All merchants</SelectItem>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.phone_number || u.id}</SelectItem>)}</SelectContent></Select><Select value={filters.ordering} onValueChange={(ordering) => setFilters({ ...filters, ordering })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="-created_at">Newest</SelectItem><SelectItem value="created_at">Oldest</SelectItem><SelectItem value="session_id">Session A-Z</SelectItem><SelectItem value="status">Status</SelectItem></SelectContent></Select></div>{isLoading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Session</TableHead><TableHead>Phone</TableHead><TableHead>Merchant</TableHead><TableHead>Status</TableHead><TableHead>Warmup</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{sessions.map((s) => <TableRow key={s.id}><TableCell><div className="font-medium">{s.session_id || 'Unnamed session'}</div><div className="text-xs text-slate-500">{s.id}</div></TableCell><TableCell>{s.phone_number || '-'}</TableCell><TableCell>{owner(s.user)}</TableCell><TableCell><Badge variant="secondary">{s.status || 'initializing'}</Badge></TableCell><TableCell className="max-w-72 truncate">{s.warmup_schedule?.join(', ') || '-'}</TableCell><TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => handleScan(s.id)}><QrCode className="mr-2 h-4 w-4" />Scan</Button></TableCell></TableRow>)}</TableBody></Table>{sessions.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No sessions found.</p> : null}</div>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-slate-500"><div>Page {page} / {maxPage} • {totalCount} total • Showing {sessions.length}</div><div className="flex items-center gap-2"><Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">10 / page</SelectItem><SelectItem value="20">20 / page</SelectItem><SelectItem value="50">50 / page</SelectItem><SelectItem value="100">100 / page</SelectItem></SelectContent></Select><Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || isLoading}>Previous</Button><Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(maxPage, p + 1))} disabled={page >= maxPage || isLoading}>Next</Button></div></div></CardContent></Card>
    <Dialog open={isQrOpen} onOpenChange={setIsQrOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Scan WhatsApp QR</DialogTitle><DialogDescription>Open WhatsApp on your phone, go to Linked Devices, and scan this QR code.</DialogDescription></DialogHeader><div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg bg-slate-50 p-6 dark:bg-slate-900">{fetchQr.isPending ? <div className="space-y-4 text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-600" /><p className="text-sm text-slate-500">Generating QR Code...</p></div> : qrBase64 ? <div className="flex flex-col items-center"><img src={qrBase64.startsWith('data:image/png;base64,') ? qrBase64 : `data:image/png;base64,${qrBase64}`} alt="WhatsApp QR Code" className="h-64 w-64 rounded-lg border-4 border-white shadow-sm" /><Button variant="outline" className="mt-6" onClick={() => selectedSessionId && fetchQr.mutate(selectedSessionId)}>Refresh QR Code</Button></div> : <div className="text-center text-red-500"><p>Could not generate QR Code.</p><Button variant="outline" className="mt-4" onClick={() => selectedSessionId && fetchQr.mutate(selectedSessionId)}>Retry</Button></div>}</div></DialogContent></Dialog>
  </div>
}
