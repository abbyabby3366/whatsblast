import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CheckCheck,
  ChevronDown,
  Clock,
  Edit,
  Edit3,
  FileText,
  LayoutGrid,
  List,
  Loader2,
  Megaphone,
  Mic,
  MoreVertical,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  User as UserIcon,
  Video as VideoIcon,
  X,
  Users,
} from 'lucide-react'
import dayjs from 'dayjs'
import { useState } from 'react'
import { toast } from 'sonner'

import { api, getErrorMessage } from '@/lib/api'
import { WhatsAppPhonePreviewModal } from '@/components/campaigns/WhatsAppPhonePreviewModal'
import { CustomerListModal } from '@/components/campaigns/CustomerListModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/admin/campaigns')({ ssr: false, component: AdminCampaignsPage })

type User = { id?: string; _id?: string; phone_number?: string; role?: string }
type Campaign = {
  id: string
  name?: string
  status?: string
  user?: string | User
  created_at?: string
  createdAt?: string
  completed_at?: string
  completedAt?: string
  updatedAt?: string
  recipient_phones?: string[]
  contacts?: any[]
  templates?: Array<any>
  template?: any
  min_interval_seconds?: number
  max_interval_seconds?: number
  enable_warmup?: boolean
  error_message?: string
  current_index?: number
  stats?: { total?: number; sent?: number; failed?: number }
}

type FormState = { id?: string; name: string; user: string; recipient_phones: string; text: string; min_interval_minutes: number; max_interval_minutes: number; enable_warmup: boolean }
const emptyForm: FormState = { name: '', user: '', recipient_phones: '', text: '', min_interval_minutes: 10, max_interval_minutes: 15, enable_warmup: true }
function rows<T>(data: unknown): T[] { if (Array.isArray(data)) return data as T[]; if (data && typeof data === 'object' && 'results' in data) return (data as { results?: T[] }).results ?? []; return [] }

function owner(user: Campaign['user'], allUsers?: User[]) {
  if (!user) return '-'
  if (typeof user === 'object' && user.phone_number) return user.phone_number
  const uId = typeof user === 'string' ? user : user.id || user._id || ''
  if (uId && allUsers) {
    const found = allUsers.find((u) => u.id === uId || u._id === uId)
    if (found?.phone_number) return found.phone_number
  }
  return uId || '-'
}

function ownerId(user: Campaign['user']) {
  if (!user) return ''
  if (typeof user === 'string') return user
  return user.id || user._id || ''
}

const getCampaignTemplates = (campaign: any) => {
  if (Array.isArray(campaign?.templates) && campaign.templates.length > 0) return campaign.templates
  if (campaign?.template) return [campaign.template]
  return []
}

const resolveTemplateMediaList = (template: any) => {
  const list: Array<{ url: string; type: string; name?: string }> = []
  if (Array.isArray(template.files) && template.files.length > 0) {
    template.files.forEach((f: any) => {
      const url = typeof f === 'string' ? f : f?.file_url || f?.file_path || f?.url || f?.file || null
      const type = typeof f === 'object' ? f?.file_type || 'image' : 'image'
      const name = typeof f === 'object' ? f?.file_name : undefined
      if (url) list.push({ url, type: String(type).toLowerCase(), name })
    })
  }
  if (list.length === 0 && Array.isArray(template.attachedFiles) && template.attachedFiles.length > 0) {
    template.attachedFiles.forEach((f: any) => {
      const url = f?.url || f?.file_url || f?.file_path || null
      const type = f?.type || 'image'
      const name = f?.name
      if (url) list.push({ url, type: String(type).toLowerCase(), name })
    })
  }
  if (list.length === 0) {
    const fileObj = typeof template.file === 'object' ? template.file : {}
    const buttonImgObj = typeof template.button_image === 'object' ? template.button_image : {}
    const mediaUrl =
      fileObj.file_url ||
      fileObj.file_path ||
      fileObj.url ||
      buttonImgObj.file_url ||
      buttonImgObj.file_path ||
      buttonImgObj.url ||
      template.file_url ||
      template.button_image_url ||
      template.previewUrl ||
      (typeof template.file === 'string' && (template.file.startsWith('http') || template.file.startsWith('/'))
        ? template.file
        : '')
    const rawType = fileObj.file_type || template.type || template.messageType || (mediaUrl ? 'image' : 'text')
    const fileType = String(rawType).toLowerCase()
    if (mediaUrl) list.push({ url: mediaUrl, type: fileType, name: fileObj.file_name })
  }
  return list
}

const defaultFilters = { search: '', status: 'all', user: 'all', ordering: '-created_at' }

function AdminCampaignsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [filters, setFilters] = useState(defaultFilters)
  const [selected, setSelected] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [selectedPreviewCampaign, setSelectedPreviewCampaign] = useState<any>(null)
  const [selectedCustomerListCampaign, setSelectedCustomerListCampaign] = useState<any>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerStatusFilter, setCustomerStatusFilter] = useState<'ALL' | 'SENT' | 'FAILED' | 'PENDING'>('ALL')

  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    const saved = localStorage.getItem('admin_campaigns_view_mode')
    return saved === 'card' ? 'card' : 'table'
  })

  const handleViewModeChange = (mode: 'card' | 'table') => {
    setViewMode(mode)
    localStorage.setItem('admin_campaigns_view_mode', mode)
  }

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

  const { data: customerLogsData, isLoading: isLoadingCustomerLogs } = useQuery({
    queryKey: ['customer-list-logs', selectedCustomerListCampaign?.id],
    queryFn: () =>
      api
        .get('messages/', {
          searchParams: { campaign_id: selectedCustomerListCampaign.id, page_size: '200' },
        })
        .json<any>(),
    enabled: Boolean(selectedCustomerListCampaign?.id),
  })

  const campaigns = rows<Campaign>(data)
  const totalCount = Array.isArray(data) ? campaigns.length : (data as { count?: number } | undefined)?.count || campaigns.length
  const maxPage = Math.max(1, Math.ceil(totalCount / pageSize))
  const allUsers = rows<User>(usersData)
  const users = allUsers.filter((u) => u.role !== 'customer' && u.id !== meData?.id && u._id !== meData?.id)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'campaigns'] })

  const pauseCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.post(`blast-campaigns/${id}/pause/`).json(),
    onSuccess: () => { refresh(); toast.success('Campaign paused.') },
    onError: async (err: any) => { toast.error(await getErrorMessage(err, 'Failed to pause campaign.')) },
  })

  const resumeCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.post(`blast-campaigns/${id}/resume/`).json(),
    onSuccess: () => { refresh(); toast.success('Campaign resumed.') },
    onError: async (err: any) => { toast.error(await getErrorMessage(err, 'Failed to resume campaign.')) },
  })

  const retryFailedMutation = useMutation({
    mutationFn: (id: string | number) => api.post(`blast-campaigns/${id}/retry-failed/`).json<any>(),
    onSuccess: (res: any) => { refresh(); toast.success(res?.message || 'Retrying failed messages...') },
    onError: async (err: any) => { toast.error(await getErrorMessage(err, 'Failed to retry campaign.')) },
  })

  const retryRecipientMutation = useMutation({
    mutationFn: ({ cId, phone }: { cId: string | number; phone: string }) =>
      api.post(`blast-campaigns/${cId}/retry-recipient/`, { json: { phone } }).json<any>(),
    onSuccess: (res: any) => {
      refresh()
      queryClient.invalidateQueries({ queryKey: ['customer-list-logs', selectedCustomerListCampaign?.id] })
      toast.success(res?.message || 'Message retried successfully!')
    },
    onError: async (err: any) => { toast.error(await getErrorMessage(err, 'Failed to retry message.')) },
  })

  const isFiltered = filters.search !== '' || filters.status !== 'all' || filters.user !== 'all' || filters.ordering !== '-created_at'
  const clearFilters = () => { setFilters(defaultFilters); setPage(1) }

  const templateTexts = () => form.text.split(/\n---+\n/).map((text) => text.trim()).filter(Boolean)
  const payload = () => ({
    name: form.name,
    user: form.user,
    recipient_phones: form.recipient_phones.split(/[\n,]/).map((p) => p.trim()).filter(Boolean),
    templates: (templateTexts().length ? templateTexts() : ['Hello']).map((text) => ({ text })),
    min_interval_seconds: form.min_interval_minutes,
    max_interval_seconds: form.max_interval_minutes,
    enable_warmup: form.enable_warmup,
  })

  const save = useMutation({ mutationFn: () => form.id ? api.patch(`blast-campaigns/${form.id}/`, { json: payload() }).json() : api.post('blast-campaigns/', { json: payload() }).json(), onSuccess: () => { refresh(); setOpen(false); setForm(emptyForm); toast.success('Campaign saved') }, onError: () => toast.error('Unable to save campaign') })
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`blast-campaigns/${id}/`), onSuccess: () => { refresh(); toast.success('Campaign deleted') }, onError: () => toast.error('Unable to delete campaign') })
  const bulkDelete = useMutation({ mutationFn: async (ids: string[]) => { await Promise.all(ids.map((id) => api.delete(`blast-campaigns/${id}/`))) }, onSuccess: () => { setSelected([]); refresh(); toast.success('Selected campaigns deleted') }, onError: () => toast.error('Unable to bulk delete campaigns') })

  const visibleIds = campaigns.map((c) => c.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))
  const toggleSelected = (id: string, checked: boolean) => setSelected((prev) => checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id))
  const toggleAll = (checked: boolean) => setSelected((prev) => checked ? Array.from(new Set([...prev, ...visibleIds])) : prev.filter((id) => !visibleIds.includes(id)))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Campaign Monitor</h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Card / Table Toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleViewModeChange('card')}
              className={`h-8 w-8 p-0 ${
                viewMode === 'card'
                  ? 'bg-white font-semibold text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
              title="Cards view"
              aria-label="Cards view"
            >
              <LayoutGrid className="h-4 w-4 text-emerald-600" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleViewModeChange('table')}
              className={`h-8 w-8 p-0 ${
                viewMode === 'table'
                  ? 'bg-white font-semibold text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
              title="Table view"
              aria-label="Table view"
            >
              <List className="h-4 w-4 text-emerald-600" />
            </Button>
          </div>

          <Button onClick={() => { setForm(emptyForm); setOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" /> Add Campaign For Merchant
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5" /> Campaigns
              </CardTitle>
              <CardDescription>{totalCount} campaign(s) found</CardDescription>
            </div>
            {selected.length ? (
              <Button
                variant="destructive"
                onClick={() => setDeleteTarget({ ids: selected, label: `${selected.length} selected campaigns` })}
                disabled={bulkDelete.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete selected ({selected.length})
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search campaign/merchant..."
                value={filters.search}
                onChange={(e) => {
                  setFilters({ ...filters, search: e.target.value })
                  setPage(1)
                }}
              />
            </div>
            <Select
              value={filters.status}
              onValueChange={(status) => {
                setFilters({ ...filters, status })
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.user}
              onValueChange={(user) => {
                setFilters({ ...filters, user })
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="All merchants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All merchants</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id || u._id} value={(u.id || u._id)!}>
                    {u.phone_number || u.id || u._id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.ordering}
              onValueChange={(ordering) => {
                setFilters({ ...filters, ordering })
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Ordering" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-created_at">Newest</SelectItem>
                <SelectItem value="created_at">Oldest</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="-name">Name Z-A</SelectItem>
              </SelectContent>
            </Select>
            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                <X className="mr-1.5 h-4 w-4 text-rose-500" />
                Clear filters
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="flex min-h-56 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
          ) : campaigns.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No campaigns found.</p>
          ) : viewMode === 'table' ? (
            /* TABLE VIEW */
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-900/60">
                    <TableHead className="w-[40px]">
                      <input type="checkbox" checked={allVisibleSelected} onChange={(e) => toggleAll(e.target.checked)} />
                    </TableHead>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Templates</TableHead>
                    <TableHead className="w-[120px]">Progress</TableHead>
                    <TableHead>Created / Completed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const cStatus = (c.status || 'draft').toLowerCase()
                    const stats = c.stats || {}
                    const total = stats.total || c.recipient_phones?.length || c.contacts?.length || 0
                    const sent = stats.sent || c.current_index || 0
                    const failed = stats.failed || 0
                    const percent = total > 0 ? Math.min(100, Math.round(((sent + failed) / total) * 100)) : 0

                    return (
                      <TableRow key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50">
                        <TableCell>
                          <input type="checkbox" checked={selected.includes(c.id)} onChange={(e) => toggleSelected(c.id, e.target.checked)} />
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-slate-900 dark:text-slate-100">{c.name || 'Untitled campaign'}</div>
                          <div className="text-xs text-slate-500">{c.id}</div>
                        </TableCell>
                        <TableCell className="font-medium text-slate-700 dark:text-slate-300">
                          {owner(c.user, allUsers)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                cStatus === 'completed'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 font-bold'
                                  : cStatus === 'scheduled'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                                  : cStatus === 'running'
                                  ? 'bg-teal-100 text-teal-800 border border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800'
                                  : cStatus === 'paused'
                                  ? 'bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800'
                                  : cStatus === 'failed'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                                  : cStatus === 'cancelled'
                                  ? 'bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                  : 'bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800'
                              }`}
                            >
                              {cStatus.toUpperCase()}
                            </span>
                            {c.error_message && (cStatus === 'paused' || cStatus === 'failed') && (
                              <div className="flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 max-w-[180px] leading-tight" title={c.error_message}>
                                <AlertCircle className="h-3 w-3 shrink-0 text-rose-500" />
                                <span className="truncate">{c.error_message}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerListCampaign(c)}
                            className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                            title="Click to view customer list"
                          >
                            {total} customers
                          </button>
                        </TableCell>
                        <TableCell className="text-sm">
                          <button
                            type="button"
                            onClick={() => setSelectedPreviewCampaign(c)}
                            className="inline-flex items-center gap-1.5 font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                            title="Click to preview message"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            {c.templates?.length || (c.template ? 1 : 1)} template(s)
                          </button>
                        </TableCell>
                        <TableCell>
                          {cStatus === 'draft' ? (
                            <span className="text-xs text-slate-400">Not Launched</span>
                          ) : (
                            <div className="w-24 space-y-1">
                              <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                                <span>{sent}/{total}</span>
                                <span className="text-emerald-600 font-bold">{percent}%</span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                <div
                                  className="h-full bg-emerald-500 transition-all duration-300"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          <div>
                            <span className="text-slate-400">Created:</span>{' '}
                            {dayjs(c.created_at || c.createdAt).format('DD/MM/YY h:mm A')}
                          </div>
                          {(c.completed_at || c.completedAt || (cStatus === 'completed' && c.updatedAt)) && (
                            <div className="mt-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                              <span className="text-emerald-600/80 dark:text-emerald-400/80">Completed:</span>{' '}
                              {dayjs(c.completed_at || c.completedAt || c.updatedAt).format('DD/MM/YY h:mm A')}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {cStatus === 'paused' && (
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
                                disabled={resumeCampaignMutation.isPending}
                                onClick={() => resumeCampaignMutation.mutate(c.id)}
                              >
                                {resumeCampaignMutation.isPending && resumeCampaignMutation.variables === c.id ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Play className="mr-1 h-3.5 w-3.5 fill-current" />
                                )}
                                Resume
                              </Button>
                            )}
                            {cStatus === 'running' && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs border-orange-300 text-orange-700 hover:bg-orange-50 font-medium dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950/40"
                                disabled={pauseCampaignMutation.isPending}
                                onClick={() => pauseCampaignMutation.mutate(c.id)}
                              >
                                {pauseCampaignMutation.isPending && pauseCampaignMutation.variables === c.id ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Pause className="mr-1 h-3.5 w-3.5" />
                                )}
                                Pause
                              </Button>
                            )}
                            {cStatus !== 'draft' && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs"
                                onClick={() => navigate({ to: '/merchant/campaigns/progress', search: { id: c.id } })}
                              >
                                <Activity className="mr-1 h-3.5 w-3.5" />
                                Progress
                              </Button>
                            )}
                            {Boolean(c.stats?.failed) && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 font-medium"
                                disabled={retryFailedMutation.isPending}
                                onClick={() => retryFailedMutation.mutate(c.id)}
                              >
                                {retryFailedMutation.isPending && retryFailedMutation.variables === c.id ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="mr-1 h-3.5 w-3.5 text-rose-600" />
                                )}
                                Retry ({c.stats?.failed})
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setForm({
                                  id: c.id,
                                  name: c.name || '',
                                  user: ownerId(c.user),
                                  recipient_phones: (c.recipient_phones || []).join('\n'),
                                  text: (c.templates || []).map((t) => t.text || '').join('\n---\n'),
                                  min_interval_minutes: c.min_interval_seconds || 10,
                                  max_interval_minutes: c.max_interval_seconds || 15,
                                  enable_warmup: c.enable_warmup !== false,
                                })
                                setOpen(true)
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              onClick={() => setDeleteTarget({ ids: [c.id], label: c.name || 'this campaign' })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            /* CARDS VIEW */
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {campaigns.map((c) => {
                const cStatus = (c.status || 'draft').toLowerCase()
                return (
                  <Card
                    key={c.id}
                    className="group overflow-hidden border-slate-200/80 bg-white/60 shadow-lg shadow-slate-900/5 transition-all duration-300 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/60 backdrop-blur-xs"
                  >
                    <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4 dark:border-slate-800 dark:bg-slate-800/50">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="line-clamp-1 text-lg">
                            {c.name || 'Untitled campaign'}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Merchant: <span className="font-semibold text-slate-700 dark:text-slate-300">{owner(c.user, allUsers)}</span>
                            <br />
                            {dayjs(c.created_at || c.createdAt).format('DD/MM/YY h:mm A')}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                              cStatus === 'completed'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 font-bold'
                                : cStatus === 'scheduled'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                                : cStatus === 'running'
                                ? 'bg-teal-100 text-teal-800 border border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800'
                                : cStatus === 'paused'
                                ? 'bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800'
                                : cStatus === 'failed'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                                : cStatus === 'cancelled'
                                ? 'bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                : 'bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800'
                            }`}
                          >
                            {cStatus === 'draft' && <Clock className="mr-1 h-3 w-3" />}
                            {cStatus === 'scheduled' && <Clock className="mr-1 h-3 w-3" />}
                            {cStatus === 'running' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {cStatus === 'completed' && <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
                            {cStatus === 'paused' && <Pause className="mr-1 h-3 w-3" />}
                            {cStatus.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="space-y-4">
                        {c.error_message && (cStatus === 'paused' || cStatus === 'failed') && (
                          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold">Paused Reason:</span> {c.error_message}
                            </div>
                          </div>
                        )}

                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                            Recipients
                          </p>
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerListCampaign(c)}
                            className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                            title="Click to view customer list"
                          >
                            {c.recipient_phones?.length || 0} customers
                          </button>
                        </div>

                        {c.templates?.length ? (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                                Message Preview ({c.templates.length} template{c.templates.length === 1 ? '' : 's'})
                              </p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40 cursor-pointer"
                                onClick={() => setSelectedPreviewCampaign(c)}
                              >
                                Phone Preview
                              </Button>
                            </div>
                            <div className="space-y-3">
                              {c.templates.map((template: any, templateIndex: number) => {
                                const mediaList = resolveTemplateMediaList(template)

                                return (
                                  <div key={template.id || templateIndex} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                                    <p className="mb-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                      Template {templateIndex + 1}
                                    </p>

                                    {mediaList.length > 0 && (
                                      <div className="mb-2.5 flex flex-wrap items-center gap-2">
                                        {mediaList.map((item, mIdx) => {
                                          if (item.type === 'document') {
                                            return (
                                              <a
                                                key={mIdx}
                                                href={item.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
                                              >
                                                <FileText className="h-4 w-4 text-red-500 shrink-0" />
                                                <span className="truncate max-w-[150px] font-medium text-slate-700 dark:text-slate-200">
                                                  {item.name || 'Document'}
                                                </span>
                                              </a>
                                            )
                                          }

                                          return (
                                            <a
                                              key={mIdx}
                                              href={item.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950 flex items-center justify-center hover:border-emerald-500 transition-colors"
                                              title={item.name || `Media #${mIdx + 1}`}
                                            >
                                              {item.type === 'video' ? (
                                                <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
                                                  <VideoIcon className="h-4 w-4" />
                                                </div>
                                              ) : (
                                                <img
                                                  src={item.url}
                                                  alt={item.name || `Media ${mIdx + 1}`}
                                                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                                />
                                              )}
                                            </a>
                                          )
                                        })}
                                      </div>
                                    )}

                                    <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                                      {template.text || template.template || 'No text'}
                                    </p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 space-y-2">
                          {cStatus !== 'draft' && (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full flex items-center justify-center gap-2"
                              onClick={() => navigate({ to: '/merchant/campaigns/progress', search: { id: c.id } })}
                            >
                              <Activity className="h-4 w-4" />
                              View Progress
                            </Button>
                          )}
                          {cStatus !== 'draft' && cStatus !== 'completed' && cStatus !== 'cancelled' && (
                            <div className="flex flex-col gap-2">
                              {cStatus === 'running' && (
                                <Button
                                  variant="outline"
                                  className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                                  disabled={pauseCampaignMutation.isPending}
                                  onClick={() => pauseCampaignMutation.mutate(c.id)}
                                >
                                  {pauseCampaignMutation.isPending && pauseCampaignMutation.variables === c.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Pause className="mr-2 h-4 w-4" />
                                  )}
                                  Pause Campaign
                                </Button>
                              )}
                              {cStatus === 'paused' && (
                                <Button
                                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                                  disabled={resumeCampaignMutation.isPending}
                                  onClick={() => resumeCampaignMutation.mutate(c.id)}
                                >
                                  {resumeCampaignMutation.isPending && resumeCampaignMutation.variables === c.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Play className="mr-2 h-4 w-4" />
                                  )}
                                  Resume Campaign
                                </Button>
                              )}
                            </div>
                          )}
                          <div className="flex gap-2 pt-1">
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                setForm({
                                  id: c.id,
                                  name: c.name || '',
                                  user: ownerId(c.user),
                                  recipient_phones: (c.recipient_phones || []).join('\n'),
                                  text: (c.templates || []).map((t) => t.text || '').join('\n---\n'),
                                  min_interval_minutes: c.min_interval_seconds || 10,
                                  max_interval_minutes: c.max_interval_seconds || 15,
                                  enable_warmup: c.enable_warmup !== false,
                                })
                                setOpen(true)
                              }}
                            >
                              <Edit className="mr-1.5 h-4 w-4" /> Edit
                            </Button>
                            <Button
                              variant="destructive"
                              className="flex-1 bg-red-600 hover:bg-red-700"
                              onClick={() => setDeleteTarget({ ids: [c.id], label: c.name || 'this campaign' })}
                            >
                              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-slate-500">
            <div>Page {page} / {maxPage} • {totalCount} total • Showing {campaigns.length}</div>
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
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

      {/* EDIT / CREATE DIALOG */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Campaign' : 'Create Campaign'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Merchant</Label>
              <Select value={form.user} onValueChange={(user) => setForm({ ...form, user })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select merchant" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id || u._id} value={(u.id || u._id)!}>
                      {u.phone_number || u.id || u._id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Your own admin account is excluded. Admins can create campaigns only for other users.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Min Interval (minutes)</Label>
                <Input type="number" min={1} value={form.min_interval_minutes} onChange={(e) => setForm({ ...form, min_interval_minutes: parseInt(e.target.value, 10) || 1 })} />
              </div>
              <div className="space-y-2">
                <Label>Max Interval (minutes)</Label>
                <Input type="number" min={1} value={form.max_interval_minutes} onChange={(e) => setForm({ ...form, max_interval_minutes: parseInt(e.target.value, 10) || 1 })} />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" id="admin-enable-warmup" checked={form.enable_warmup} onChange={(e) => setForm({ ...form, enable_warmup: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              <Label htmlFor="admin-enable-warmup" className="cursor-pointer text-sm font-medium">Enable Account Warmup</Label>
            </div>
            <div className="space-y-2">
              <Label>Recipient phones</Label>
              <Textarea value={form.recipient_phones} onChange={(e) => setForm({ ...form, recipient_phones: e.target.value })} placeholder="One phone per line or comma separated" />
            </div>
            <div className="space-y-2">
              <Label>Message texts</Label>
              <Textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder={"Template 1 text\n---\nTemplate 2 text"} />
              <p className="text-xs text-slate-500">Separate multiple templates with a line containing ---.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.user}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={!!deleteTarget} onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.label}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={remove.isPending || bulkDelete.isPending}
              onClick={() => {
                if (!deleteTarget) return
                if (deleteTarget.ids.length === 1) remove.mutate(deleteTarget.ids[0])
                else bulkDelete.mutate(deleteTarget.ids)
                setDeleteTarget(null)
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WhatsAppPhonePreviewModal
        campaign={selectedPreviewCampaign}
        onClose={() => setSelectedPreviewCampaign(null)}
      />

      <CustomerListModal
        campaign={selectedCustomerListCampaign}
        onClose={() => setSelectedCustomerListCampaign(null)}
        invalidateQueryKey={['admin', 'campaigns']}
      />
    </div>
  )
}
