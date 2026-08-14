import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit, HelpCircle, Loader2, Plus, Shield, Store, Trash2, UserRound, Smartphone, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { api, getErrorMessage } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export const Route = createFileRoute('/admin/users')({ ssr: false, component: AdminUsersPage })

type User = { id: string; phone_number: string; role: string; is_active: boolean; is_staff: boolean; min_interval_minutes?: string }
type Session = {
  id: string
  session_id?: string
  phone_number?: string
  status?: string
  user?: string | { id: string; phone_number?: string; role?: string }
}
type FormState = { id?: string; phone_number: string; password: string; role: string; is_active: boolean; min_interval_minutes: string }
const emptyForm: FormState = { phone_number: '', password: '', role: 'merchant', is_active: true, min_interval_minutes: '10-15' }

function getRows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && 'results' in data) return (data as { results?: T[] }).results ?? []
  return []
}
function roleIcon(role: string) { return role === 'admin' ? <Shield className="h-4 w-4" /> : role === 'merchant' ? <Store className="h-4 w-4" /> : <UserRound className="h-4 w-4" /> }

function AdminUsersPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [filters, setFilters] = useState({ search: '', role: 'all', is_active: 'all', ordering: 'phone_number' })
  const [selected, setSelected] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const query = new URLSearchParams()
  if (filters.search) query.set('search', filters.search)
  if (filters.role !== 'all') query.set('role', filters.role)
  if (filters.is_active !== 'all') query.set('is_active', filters.is_active)
  if (filters.ordering) query.set('ordering', filters.ordering)
  query.set('page', String(page))
  query.set('page_size', String(pageSize))
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'users', filters, page, pageSize], queryFn: () => api.get(`users/?${query.toString()}`).json<unknown>() })
  const { data: meData } = useQuery({ queryKey: ['admin', 'me'], queryFn: () => api.get('users/me/').json<User>() })
  const { data: sessionsData } = useQuery({ queryKey: ['admin', 'whatsapp-sessions'], queryFn: () => api.get('whatsapp-sessions/').json<unknown>() })
  const allSessions = getRows<Session>(sessionsData)

  const currentUserId = meData?.id
  const users = getRows<User>(data).filter((user) => user.id !== currentUserId)
  const totalCount = Array.isArray(data) ? users.length : (data as { count?: number } | undefined)?.count || users.length
  const maxPage = Math.max(1, Math.ceil(totalCount / pageSize))
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); queryClient.invalidateQueries({ queryKey: ['users'] }); queryClient.invalidateQueries({ queryKey: ['admin', 'whatsapp-sessions'] }) }

  const intervalParts = (form.min_interval_minutes || '10-15').split('-')
  const minIntervalVal = intervalParts[0] ?? '10'
  const maxIntervalVal = intervalParts[1] ?? '15'

  const updateMinInterval = (newMin: string) => {
    const currentMax = (form.min_interval_minutes || '10-15').split('-')[1] ?? '15'
    setForm({ ...form, min_interval_minutes: `${newMin}-${currentMax}` })
  }

  const updateMaxInterval = (newMax: string) => {
    const currentMin = (form.min_interval_minutes || '10-15').split('-')[0] ?? '10'
    setForm({ ...form, min_interval_minutes: `${currentMin}-${newMax}` })
  }

  const saveUser = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { phone_number: form.phone_number, role: form.role, is_active: form.is_active, min_interval_minutes: form.min_interval_minutes }
      if (form.password) payload.password = form.password
      return form.id ? api.patch(`users/${form.id}/`, { json: payload }).json<User>() : api.post('users/', { json: payload }).json<User>()
    },
    onSuccess: () => { refresh(); setOpen(false); setForm(emptyForm); toast.success('User saved') },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Unable to save user')),
  })
  const quickUpdate = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<User> }) => api.patch(`users/${id}/`, { json: patch }).json<User>(), onSuccess: refresh, onError: async (err) => toast.error(await getErrorMessage(err, 'Unable to update user')) })
  const deleteUser = useMutation({ mutationFn: (id: string) => api.delete(`users/${id}/`), onSuccess: () => { refresh(); toast.success('User deleted') }, onError: async (err) => toast.error(await getErrorMessage(err, 'Unable to delete user')) })
  const bulkDelete = useMutation({ mutationFn: async (ids: string[]) => { await Promise.all(ids.map((id) => api.delete(`users/${id}/`))) }, onSuccess: () => { setSelected([]); refresh(); toast.success('Selected users deleted') }, onError: async (err) => toast.error(await getErrorMessage(err, 'Unable to bulk delete users')) })
  const visibleIds = users.map((u) => u.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))
  const toggleSelected = (id: string, checked: boolean) => setSelected((prev) => checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id))
  const toggleAll = (checked: boolean) => setSelected((prev) => checked ? Array.from(new Set([...prev, ...visibleIds])) : prev.filter((id) => !visibleIds.includes(id)))

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><p className="text-xs text-slate-500">Create, edit, deactivate, and delete accounts.</p></div><Button onClick={() => { setForm(emptyForm); setOpen(true) }}><Plus className="mr-2 h-4 w-4" /> Add User</Button></div>
    <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle>All Accounts</CardTitle><CardDescription>{users.length} account(s) found, excluding your own account</CardDescription></div>{selected.length ? <Button variant="destructive" onClick={() => setDeleteTarget({ ids: selected, label: `${selected.length} selected users` })} disabled={bulkDelete.isPending}><Trash2 className="mr-2 h-4 w-4" /> Delete selected ({selected.length})</Button> : null}</div></CardHeader><CardContent><div className="mb-4 grid gap-3 md:grid-cols-4"><Input placeholder="Search phone/role" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><Select value={filters.role} onValueChange={(role) => setFilters({ ...filters, role })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem><SelectItem value="admin">Admin</SelectItem><SelectItem value="merchant">Merchant</SelectItem><SelectItem value="customer">Customer</SelectItem></SelectContent></Select><Select value={filters.is_active} onValueChange={(is_active) => setFilters({ ...filters, is_active })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="true">Active</SelectItem><SelectItem value="false">Inactive</SelectItem></SelectContent></Select><Select value={filters.ordering} onValueChange={(ordering) => setFilters({ ...filters, ordering })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="phone_number">Phone A-Z</SelectItem><SelectItem value="-phone_number">Phone Z-A</SelectItem><SelectItem value="role">Role</SelectItem></SelectContent></Select></div>{isLoading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead><input type="checkbox" checked={allVisibleSelected} onChange={(e) => toggleAll(e.target.checked)} /></TableHead><TableHead>Phone</TableHead><TableHead>Role</TableHead><TableHead>Active Sessions</TableHead><TableHead>Interval</TableHead><TableHead>Staff</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{users.map((user) => <TableRow key={user.id}><TableCell><input type="checkbox" checked={selected.includes(user.id)} onChange={(e) => toggleSelected(user.id, e.target.checked)} /></TableCell><TableCell><div className="font-medium">{user.phone_number}</div><div className="text-xs text-slate-500">{user.id}</div></TableCell><TableCell><Select value={user.role} onValueChange={(role) => quickUpdate.mutate({ id: user.id, patch: { role } })}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="merchant">Merchant</SelectItem><SelectItem value="customer">Customer</SelectItem></SelectContent></Select></TableCell><TableCell>{(() => { const userSessions = allSessions.filter((s) => { const ownerId = typeof s.user === 'object' ? s.user.id : s.user; return ownerId === user.id }); if (userSessions.length === 0) { return <span className="text-xs text-slate-400">No sessions</span> } return <div className="flex flex-wrap gap-1 max-w-xs">{userSessions.map((s) => (<Badge key={s.id} variant="outline" className="font-mono text-xs gap-1 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800" title={`Session ID: ${s.session_id || s.id} (${s.status || 'disconnected'})`}><Smartphone className="w-3 h-3 text-emerald-600 inline" />{s.phone_number || s.session_id || s.id}<span className={`w-1.5 h-1.5 rounded-full inline-block ${(s.status || '').toLowerCase() === 'connected' ? 'bg-emerald-500' : (s.status || '').toLowerCase() === 'qr_ready' ? 'bg-blue-500' : 'bg-amber-500'}`} /></Badge>))}</div> })()}</TableCell><TableCell>{user.min_interval_minutes || '-'}</TableCell><TableCell>{user.is_staff ? <Badge>Staff</Badge> : <Badge variant="secondary">No</Badge>}</TableCell><TableCell><div className="flex items-center gap-3"><Switch checked={user.is_active} onCheckedChange={(is_active) => quickUpdate.mutate({ id: user.id, patch: { is_active } })} /><Badge variant={user.is_active ? 'default' : 'secondary'} className="gap-1">{roleIcon(user.role)}{user.is_active ? 'Active' : 'Inactive'}</Badge></div></TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => { setForm({ id: user.id, phone_number: user.phone_number, password: '', role: user.role, is_active: user.is_active, min_interval_minutes: user.min_interval_minutes || '10-15' }); setOpen(true) }}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleteTarget({ ids: [user.id], label: user.phone_number })}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table>{users.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No users found.</p> : null}</div>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-slate-500"><div>Page {page} / {maxPage} • {totalCount} total • Showing {users.length}</div><div className="flex items-center gap-2"><Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">10 / page</SelectItem><SelectItem value="20">20 / page</SelectItem><SelectItem value="50">50 / page</SelectItem><SelectItem value="100">100 / page</SelectItem></SelectContent></Select><Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || isLoading}>Previous</Button><Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(maxPage, p + 1))} disabled={page >= maxPage || isLoading}>Next</Button></div></div></CardContent></Card>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{form.id ? 'Edit User' : 'Create User'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Password {form.id ? '(leave blank to keep)' : ''}</Label>
            <div className="relative">
              <Input 
                type={showPassword ? 'text' : 'password'} 
                value={form.password} 
                onChange={(e) => setForm({ ...form, password: e.target.value })} 
                className="pr-10"
              />
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 focus:outline-none select-none"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="merchant">Merchant</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm font-medium">Message Interval (Minutes)</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-xs">
                    Set the minimum and maximum delay (in minutes) between messages to reduce WhatsApp ban risk.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-normal text-slate-500">Min</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="10"
                  value={minIntervalVal}
                  onChange={(e) => updateMinInterval(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-normal text-slate-500">Max</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="15"
                  value={maxIntervalVal}
                  onChange={(e) => updateMaxInterval(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Switch checked={form.is_active} onCheckedChange={(is_active) => setForm({ ...form, is_active })} />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => saveUser.mutate()} disabled={saveUser.isPending}>
            {saveUser.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={!!deleteTarget} onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>Delete {deleteTarget?.label}?</DialogTitle></DialogHeader><p className="text-sm text-slate-500">This action cannot be undone.</p><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" disabled={deleteUser.isPending || bulkDelete.isPending} onClick={() => { if (!deleteTarget) return; if (deleteTarget.ids.length === 1) deleteUser.mutate(deleteTarget.ids[0]); else bulkDelete.mutate(deleteTarget.ids); setDeleteTarget(null) }}><Trash2 className="mr-2 h-4 w-4" />Delete</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

