import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit, Loader2, Megaphone, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/admin/campaigns')({ ssr: false, component: AdminCampaignsPage })

type User = { id: string; phone_number?: string; role?: string }
type Campaign = { id: string; name?: string; status?: string; user?: string | User; created_at?: string; recipient_phones?: string[]; templates?: Array<{ text?: string }> }
type FormState = { id?: string; name: string; user: string; recipient_phones: string; text: string }
const emptyForm: FormState = { name: '', user: '', recipient_phones: '', text: '' }
function rows<T>(data: unknown): T[] { if (Array.isArray(data)) return data as T[]; if (data && typeof data === 'object' && 'results' in data) return (data as { results?: T[] }).results ?? []; return [] }
function owner(user: Campaign['user']) { return !user ? '-' : typeof user === 'string' ? user : user.phone_number || user.id || '-' }
function ownerId(user: Campaign['user']) { return !user ? '' : typeof user === 'string' ? user : user.id || '' }

function AdminCampaignsPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [filters, setFilters] = useState({ search: '', status: 'all', user: 'all', ordering: '-created_at' })
  const [selected, setSelected] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const query = new URLSearchParams()
  if (filters.search) query.set('search', filters.search)
  if (filters.status !== 'all') query.set('status', filters.status)
  if (filters.user !== 'all') query.set('user', filters.user)
  if (filters.ordering) query.set('ordering', filters.ordering)
  query.set('page', String(page))
  query.set('page_size', String(pageSize))
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'campaigns', filters, page, pageSize], queryFn: () => api.get(`blast-campaigns/?${query.toString()}`).json<unknown>() })
  const { data: usersData } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.get('users/').json<unknown>() })
  const { data: meData } = useQuery({ queryKey: ['admin', 'me'], queryFn: () => api.get('users/me/').json<User>() })
  const campaigns = rows<Campaign>(data)
  const totalCount = Array.isArray(data) ? campaigns.length : (data as { count?: number } | undefined)?.count || campaigns.length
  const maxPage = Math.max(1, Math.ceil(totalCount / pageSize))
  const users = rows<User>(usersData).filter((u) => u.role !== 'customer' && u.id !== meData?.id)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'campaigns'] })
  const templateTexts = () => form.text.split(/\n---+\n/).map((text) => text.trim()).filter(Boolean)
  const payload = () => ({
    name: form.name,
    user: form.user,
    recipient_phones: form.recipient_phones.split(/[\n,]/).map((p) => p.trim()).filter(Boolean),
    templates: (templateTexts().length ? templateTexts() : ['Hello']).map((text) => ({ text })),
  })
  const save = useMutation({ mutationFn: () => form.id ? api.patch(`blast-campaigns/${form.id}/`, { json: payload() }).json() : api.post('blast-campaigns/', { json: payload() }).json(), onSuccess: () => { refresh(); setOpen(false); setForm(emptyForm); toast.success('Campaign saved') }, onError: () => toast.error('Unable to save campaign') })
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`blast-campaigns/${id}/`), onSuccess: () => { refresh(); toast.success('Campaign deleted') }, onError: () => toast.error('Unable to delete campaign') })
  const bulkDelete = useMutation({ mutationFn: async (ids: string[]) => { await Promise.all(ids.map((id) => api.delete(`blast-campaigns/${id}/`))) }, onSuccess: () => { setSelected([]); refresh(); toast.success('Selected campaigns deleted') }, onError: () => toast.error('Unable to bulk delete campaigns') })
  const visibleIds = campaigns.map((c) => c.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))
  const toggleSelected = (id: string, checked: boolean) => setSelected((prev) => checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id))
  const toggleAll = (checked: boolean) => setSelected((prev) => checked ? Array.from(new Set([...prev, ...visibleIds])) : prev.filter((id) => !visibleIds.includes(id)))

  return <div className="space-y-6"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-bold tracking-tight">Campaign Monitor</h2><p className="text-slate-500">Create, edit, and delete merchant campaigns.</p></div><Button onClick={() => { setForm(emptyForm); setOpen(true) }}><Plus className="mr-2 h-4 w-4" /> Add Campaign For Merchant</Button></div>
    <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" /> Campaigns</CardTitle><CardDescription>{campaigns.length} campaign(s) found</CardDescription></div>{selected.length ? <Button variant="destructive" onClick={() => setDeleteTarget({ ids: selected, label: `${selected.length} selected campaigns` })} disabled={bulkDelete.isPending}><Trash2 className="mr-2 h-4 w-4" /> Delete selected ({selected.length})</Button> : null}</div></CardHeader><CardContent><div className="mb-4 grid gap-3 md:grid-cols-4"><Input placeholder="Search campaign/merchant" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><Select value={filters.status} onValueChange={(status) => setFilters({ ...filters, status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="running">Running</SelectItem><SelectItem value="paused">Paused</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select><Select value={filters.user} onValueChange={(user) => setFilters({ ...filters, user })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All merchants</SelectItem>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.phone_number || u.id}</SelectItem>)}</SelectContent></Select><Select value={filters.ordering} onValueChange={(ordering) => setFilters({ ...filters, ordering })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="-created_at">Newest</SelectItem><SelectItem value="created_at">Oldest</SelectItem><SelectItem value="name">Name A-Z</SelectItem><SelectItem value="-name">Name Z-A</SelectItem></SelectContent></Select></div>{isLoading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead><input type="checkbox" checked={allVisibleSelected} onChange={(e) => toggleAll(e.target.checked)} /></TableHead><TableHead>Name</TableHead><TableHead>Merchant</TableHead><TableHead>Status</TableHead><TableHead>Recipients</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{campaigns.map((c) => <TableRow key={c.id}><TableCell><input type="checkbox" checked={selected.includes(c.id)} onChange={(e) => toggleSelected(c.id, e.target.checked)} /></TableCell><TableCell><div className="font-medium">{c.name || 'Untitled campaign'}</div><div className="text-xs text-slate-500">{c.id}</div></TableCell><TableCell>{owner(c.user)}</TableCell><TableCell><Badge variant="secondary">{c.status || 'draft'}</Badge></TableCell><TableCell>{c.recipient_phones?.length ?? 0}</TableCell><TableCell>{c.created_at ? new Date(c.created_at).toLocaleString() : '-'}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => { setForm({ id: c.id, name: c.name || '', user: ownerId(c.user), recipient_phones: (c.recipient_phones || []).join('\n'), text: (c.templates || []).map((template) => template.text || '').join('\n---\n') }); setOpen(true) }}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleteTarget({ ids: [c.id], label: c.name || 'this campaign' })}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table>{campaigns.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No campaigns found.</p> : null}</div>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-slate-500"><div>Page {page} / {maxPage} • {totalCount} total • Showing {campaigns.length}</div><div className="flex items-center gap-2"><Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">10 / page</SelectItem><SelectItem value="20">20 / page</SelectItem><SelectItem value="50">50 / page</SelectItem><SelectItem value="100">100 / page</SelectItem></SelectContent></Select><Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || isLoading}>Previous</Button><Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(maxPage, p + 1))} disabled={page >= maxPage || isLoading}>Next</Button></div></div></CardContent></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{form.id ? 'Edit Campaign' : 'Create Campaign'}</DialogTitle></DialogHeader><div className="grid gap-4 py-2"><div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div className="space-y-2"><Label>Merchant</Label><Select value={form.user} onValueChange={(user) => setForm({ ...form, user })}><SelectTrigger><SelectValue placeholder="Select merchant" /></SelectTrigger><SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.phone_number || u.id}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">Your own admin account is excluded. Admins can create campaigns only for other users.</p></div><div className="space-y-2"><Label>Recipient phones</Label><Textarea value={form.recipient_phones} onChange={(e) => setForm({ ...form, recipient_phones: e.target.value })} placeholder="One phone per line or comma separated" /></div><div className="space-y-2"><Label>Message texts</Label><Textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder={"Template 1 text\n---\nTemplate 2 text"} /><p className="text-xs text-slate-500">Separate multiple templates with a line containing ---.</p></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={save.isPending || !form.user}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!deleteTarget} onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>Delete {deleteTarget?.label}?</DialogTitle></DialogHeader><p className="text-sm text-slate-500">This action cannot be undone.</p><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" disabled={remove.isPending || bulkDelete.isPending} onClick={() => { if (!deleteTarget) return; if (deleteTarget.ids.length === 1) remove.mutate(deleteTarget.ids[0]); else bulkDelete.mutate(deleteTarget.ids); setDeleteTarget(null) }}><Trash2 className="mr-2 h-4 w-4" />Delete</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
