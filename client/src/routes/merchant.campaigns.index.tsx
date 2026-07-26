import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  CheckCircle2,
  Clock,
  Loader2,
  Megaphone,
  Pause,
  Play,
  Plus,
  Trash2,
  FileText,
  Activity,
  BarChart3,
  Sparkles,
  LayoutGrid,
  List,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  User,
  MoreVertical,
  CheckCheck,
  Mic,
} from 'lucide-react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const Route = createFileRoute('/merchant/campaigns/')({
  component: CampaignsPage,
})

function CampaignsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedProgressCampaign, setSelectedProgressCampaign] = useState<any>(null)
  const [selectedPreviewCampaign, setSelectedPreviewCampaign] = useState<any>(null)

  const getCampaignTemplates = (campaign: any) => {
    if (Array.isArray(campaign?.templates) && campaign.templates.length > 0) {
      return campaign.templates
    }
    if (campaign?.template) {
      return [campaign.template]
    }
    return []
  }

  // Fetch campaign execution logs when view progress modal is open
  const { data: campaignLogsData, isLoading: isLoadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['campaign-logs', selectedProgressCampaign?.id],
    queryFn: () =>
      selectedProgressCampaign
        ? api.get('messages/', { searchParams: { campaign_id: selectedProgressCampaign.id, page_size: '100' } }).json<any>()
        : Promise.resolve({ count: 0, results: [] }),
    enabled: Boolean(selectedProgressCampaign?.id),
    refetchInterval: (selectedProgressCampaign?.status || '').toLowerCase() === 'running' ? 3000 : false,
  })

  // Fetch campaigns
  const { data: campaignsResponse, isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('blast-campaigns/').json<any>(),
  })

  const campaigns = Array.isArray(campaignsResponse)
    ? campaignsResponse
    : campaignsResponse?.results || []

  const runCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.post(`blast-campaigns/${id}/run/`).json<any>(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      if (data?.status === 'no_session') {
        toast.error(data.message || 'No connected WhatsApp sessions. Connect a session before starting this campaign.')
        return
      }
      if (data?.status === 'skipped') {
        toast.info(data.message || 'Campaign skipped.')
        return
      }
      toast.success(data?.message || 'Campaign scheduled!')
    },
    onError: async (error: any) => {
      const response = await error?.response?.json?.().catch(() => null)
      toast.error(response?.message || response?.error || 'Failed to schedule campaign.')
    },
  })

  const pauseCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.post(`blast-campaigns/${id}/pause/`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign paused.')
    },
    onError: () => {
      toast.error('Failed to pause campaign.')
    },
  })

  const resumeCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.post(`blast-campaigns/${id}/resume/`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign resumed.')
    },
    onError: () => {
      toast.error('Failed to resume campaign.')
    },
  })

  const deleteCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.delete(`blast-campaigns/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign deleted successfully!')
    },
    onError: () => {
      toast.error('Failed to delete campaign.')
    },
  })

  const handleEdit = (campaign: any) => {
    navigate({ to: '/merchant/campaigns/create', search: { edit: campaign.id } })
  }

  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    const saved = localStorage.getItem('campaigns_view_mode')
    return saved === 'table' ? 'table' : 'card'
  })

  const handleViewModeChange = (mode: 'card' | 'table') => {
    setViewMode(mode)
    localStorage.setItem('campaigns_view_mode', mode)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Campaigns</h2>
          <p className="text-slate-500">
            Create and manage your WhatsApp blasting campaigns.
          </p>
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
                  ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
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
                  ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
              title="Table view"
              aria-label="Table view"
            >
              <List className="h-4 w-4 text-emerald-600" />
            </Button>
          </div>

          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
            onClick={() => navigate({ to: '/merchant/campaigns/create' })}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </div>
      </div>

      {isLoadingCampaigns ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          <Megaphone className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
            No Campaigns Yet
          </h3>
          <p className="mb-4">
            Create your first WhatsApp blast to reach your customers.
          </p>
          <Button onClick={() => navigate({ to: '/merchant/campaigns/create' })} variant="outline">
            Create Campaign
          </Button>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <Card className="border-slate-200 shadow-sm dark:border-slate-800">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 dark:bg-slate-900/60">
                  <TableHead className="w-[240px]">Campaign Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Templates</TableHead>
                  <TableHead className="w-[180px]">Progress</TableHead>
                  <TableHead>Created / Completed Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign: any) => {
                  const cStatus = (campaign.status || 'draft').toLowerCase()
                  const stats = campaign.stats || {}
                  const total = stats.total || campaign.recipient_phones?.length || campaign.contacts?.length || 0
                  const sent = stats.sent || campaign.current_index || 0
                  const failed = stats.failed || 0
                  const percent = total > 0 ? Math.min(100, Math.round(((sent + failed) / total) * 100)) : 0

                  return (
                    <TableRow key={campaign.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50">
                      <TableCell className="font-bold text-slate-900 dark:text-slate-100">
                        {campaign.name}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            cStatus === 'completed'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
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
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <button
                          type="button"
                          onClick={() => setSelectedProgressCampaign(campaign)}
                          className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                          title="Click to view customer list and delivery status"
                        >
                          {total} customers
                        </button>
                      </TableCell>
                      <TableCell className="text-sm">
                        <button
                          type="button"
                          onClick={() => setSelectedPreviewCampaign(campaign)}
                          className="inline-flex items-center gap-1.5 font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                          title="Click to preview message"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {campaign.templates?.length || (campaign.template ? 1 : 1)} template(s)
                        </button>
                      </TableCell>
                      <TableCell>
                        {cStatus === 'draft' ? (
                          <span className="text-xs text-slate-400">Not Launched</span>
                        ) : (
                          <div className="space-y-1">
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
                          {dayjs(campaign.created_at || campaign.createdAt).format('MMM D, YYYY h:mm A')}
                        </div>
                        {(campaign.completed_at || campaign.completedAt || (cStatus === 'completed' && campaign.updatedAt)) && (
                          <div className="mt-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="text-emerald-600/80 dark:text-emerald-400/80">Completed:</span>{' '}
                            {dayjs(campaign.completed_at || campaign.completedAt || campaign.updatedAt).format('MMM D, YYYY h:mm A')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {cStatus !== 'draft' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs border-amber-300 bg-amber-50/70 text-amber-800 hover:bg-amber-100 hover:text-amber-900 font-medium dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300"
                              onClick={() => setSelectedProgressCampaign(campaign)}
                            >
                              <Activity className="mr-1 h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                              Progress
                            </Button>
                          )}
                          {cStatus === 'draft' ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => handleEdit(campaign)}
                            >
                              Edit Draft
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => handleEdit(campaign)}
                            >
                              Edit Unsent
                            </Button>
                          )}
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                                disabled={deleteCampaignMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent onClick={(e) => e.stopPropagation()}>
                              <DialogHeader>
                                <DialogTitle>Delete Campaign?</DialogTitle>
                                <DialogDescription>
                                  Are you sure you want to delete this campaign? This action cannot be undone.
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
                                    onClick={() => deleteCampaignMutation.mutate(campaign.id)}
                                    className="bg-red-600 text-white hover:bg-red-700"
                                  >
                                    Delete
                                  </Button>
                                </DialogClose>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        /* CARD VIEW */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoadingCampaigns ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            <Megaphone className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
              No Campaigns Yet
            </h3>
            <p className="mb-4">
              Create your first WhatsApp blast to reach your customers.
            </p>
            <Button onClick={() => navigate({ to: '/merchant/campaigns/create' })} variant="outline">
              Create Campaign
            </Button>
          </div>
        ) : (
          campaigns.map((campaign: any) => (
            <Card
              key={campaign.id}
              className="group overflow-hidden border-slate-200/80 bg-white/60 shadow-lg shadow-slate-900/5 transition-all duration-300 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/60 backdrop-blur-sm"
            >
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="line-clamp-1 text-lg">
                      {campaign.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {dayjs(campaign.created_at || campaign.createdAt).format('MMM D, YYYY h:mm A')}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const cStatus = (campaign.status || 'draft').toLowerCase()
                      return (
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
                          {cStatus === 'draft' && (
                            <Clock className="mr-1 h-3 w-3" />
                          )}
                          {cStatus === 'scheduled' && (
                            <Clock className="mr-1 h-3 w-3" />
                          )}
                          {cStatus === 'running' && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          )}
                          {cStatus === 'completed' && (
                            <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          )}
                          {cStatus === 'paused' && (
                            <Pause className="mr-1 h-3 w-3" />
                          )}
                          {cStatus.toUpperCase()}
                        </span>
                      )
                    })()}

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                          disabled={deleteCampaignMutation.isPending}
                        >
                          {deleteCampaignMutation.isPending && deleteCampaignMutation.variables === campaign.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </DialogTrigger>
                      <DialogContent onClick={(e) => e.stopPropagation()}>
                        <DialogHeader>
                          <DialogTitle>Delete Campaign?</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to delete this campaign? This action cannot be undone.
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
                              onClick={() => deleteCampaignMutation.mutate(campaign.id)}
                              className="bg-red-600 text-white hover:bg-red-700"
                            >
                              Delete
                            </Button>
                          </DialogClose>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Recipients
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedProgressCampaign(campaign)}
                      className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                      title="Click to view customer list and delivery status"
                    >
                      {campaign.recipient_phones?.length || 0} customers
                    </button>
                  </div>

                  {campaign.templates?.length ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                          Message Preview ({campaign.templates.length} template{campaign.templates.length === 1 ? '' : 's'})
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40 cursor-pointer"
                          onClick={() => setSelectedPreviewCampaign(campaign)}
                        >
                          Phone Preview
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {campaign.templates.map((template: any, templateIndex: number) => (
                          <div key={template.id || templateIndex} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                            <p className="mb-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              Template {templateIndex + 1}
                            </p>
                            {template.file?.file_type === 'document' && (
                              <a
                                href={template.file.file_url || template.file.document || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="mb-2 flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                              >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-100 text-red-600 dark:bg-red-950/40">
                                  <FileText className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-800 dark:text-slate-200">Document attachment</p>
                                  <p className="truncate text-xs text-slate-500">{template.file.file_name || template.file.file_url || template.file.document}</p>
                                </div>
                              </a>
                            )}
                            {template.file?.file_type !== 'document' && (template.file?.file_url || template.button_image?.file_url) && (
                              <img
                                src={template.file?.file_url || template.button_image?.file_url}
                                alt={`Campaign media template ${templateIndex + 1}`}
                                className="mb-2 max-h-36 w-full rounded-md bg-white object-contain dark:bg-slate-900"
                              />
                            )}
                            <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                              {template.text || 'No text'}
                            </p>
                            {template.buttons?.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {template.buttons.map((button: any, index: number) => (
                                  <span key={button.id || index} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                                    {button.displayText || button.display_text || button.value || 'Button'}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                {(() => {
                  const cStatus = (campaign.status || 'draft').toLowerCase()
                  return (
                    <div className="mt-4 space-y-2">
                      {cStatus === 'draft' ? (
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            className="w-full bg-emerald-50/50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                            onClick={() => handleEdit(campaign)}
                          >
                            Edit Draft
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full flex items-center justify-center gap-2 border-amber-300 bg-amber-50/70 text-amber-800 hover:bg-amber-100 hover:text-amber-900 font-medium dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300"
                          onClick={() => setSelectedProgressCampaign(campaign)}
                        >
                          <Activity className="h-4 w-4 text-amber-600 dark:text-amber-400" />
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
                              onClick={() => pauseCampaignMutation.mutate(campaign.id)}
                            >
                              {pauseCampaignMutation.isPending && pauseCampaignMutation.variables === campaign.id ? (
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
                              onClick={() => resumeCampaignMutation.mutate(campaign.id)}
                            >
                              {resumeCampaignMutation.isPending && resumeCampaignMutation.variables === campaign.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="mr-2 h-4 w-4" />
                              )}
                              Resume Campaign
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleEdit(campaign)}
                          >
                            Edit unsent queued messages
                          </Button>
                        </div>
                      )}
                      {cStatus === 'scheduled' && (
                        <Button
                          disabled
                          className="mt-2 w-full"
                          variant="secondary"
                        >
                          <Clock className="mr-2 h-4 w-4" />
                          Scheduled...
                        </Button>
                      )}
                    </div>
                  )
                })()}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      )}

      {/* CAMPAIGN PROGRESS & DETAILED BLAST REPORT MODAL */}
      <Dialog
        open={Boolean(selectedProgressCampaign)}
        onOpenChange={(open) => !open && setSelectedProgressCampaign(null)}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-emerald-600" />
              Campaign Blast Execution Report
            </DialogTitle>
            <DialogDescription>
              Detailed real-time delivery report for {selectedProgressCampaign?.name}
            </DialogDescription>
          </DialogHeader>

          {selectedProgressCampaign && (() => {
            const stats = selectedProgressCampaign.stats || {}
            const total = stats.total || selectedProgressCampaign.recipient_phones?.length || selectedProgressCampaign.contacts?.length || 0
            const sent = stats.sent || selectedProgressCampaign.current_index || 0
            const failed = stats.failed || 0
            const pending = Math.max(0, total - sent - failed)
            const percent = total > 0 ? Math.min(100, Math.round(((sent + failed) / total) * 100)) : 0
            const cStatus = (selectedProgressCampaign.status || 'draft').toUpperCase()

            const logs: any[] = campaignLogsData?.results || []
            const recipientPhones: string[] = selectedProgressCampaign.recipient_phones || selectedProgressCampaign.contacts?.map((c: any) => typeof c === 'string' ? c : c.phone || c.recipient_phone) || []

            // Generate detailed report rows
            const reportRows = recipientPhones.length > 0
              ? recipientPhones.map((phone, idx) => {
                  const cleanP = phone.replace(/[^0-9]/g, '')
                  const matchedLog = logs.find((l) => l.recipient_phone?.replace(/[^0-9]/g, '') === cleanP || l.to_jid?.includes(cleanP))
                  
                  if (matchedLog) {
                    return {
                      phone: phone,
                      status: matchedLog.status || 'sent',
                      time: matchedLog.created_at || matchedLog.wa_timestamp || matchedLog.createdAt,
                      error: matchedLog.error || null,
                      message: matchedLog.content?.text || 'Template message sent',
                    }
                  }

                  if (idx < (selectedProgressCampaign.current_index || 0)) {
                    return {
                      phone: phone,
                      status: 'failed',
                      time: null,
                      error: 'Send failed during execution',
                      message: 'Template message failed',
                    }
                  }

                  return {
                    phone: phone,
                    status: 'pending',
                    time: null,
                    error: null,
                    message: 'Scheduled in queue',
                  }
                })
              : logs.map((l) => ({
                  phone: l.recipient_phone || l.to_jid || 'Recipient',
                  status: l.status || 'sent',
                  time: l.created_at || l.wa_timestamp,
                  error: l.error || null,
                  message: l.content?.text || 'Message',
                }))

            return (
              <div className="space-y-6 py-2">
                {/* Header overview badge */}
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100">{selectedProgressCampaign.name}</h3>
                    <p className="text-xs text-slate-500">
                      Created: {dayjs(selectedProgressCampaign.created_at || selectedProgressCampaign.createdAt).format('MMM D, YYYY h:mm A')}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                      cStatus === 'COMPLETED' || cStatus === 'completed'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 font-bold'
                        : cStatus === 'RUNNING' || cStatus === 'running'
                        ? 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800 animate-pulse'
                        : cStatus === 'PAUSED' || cStatus === 'paused'
                        ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800'
                        : cStatus === 'SCHEDULED' || cStatus === 'scheduled'
                        ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                        : cStatus === 'FAILED' || cStatus === 'failed'
                        ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                        : 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800'
                    }`}
                  >
                    {cStatus.toUpperCase()}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-slate-700 dark:text-slate-300">Blast Progress</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{percent}% ({sent + failed}/{total})</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-900">
                    <p className="min-h-[2.25rem] text-xs font-medium text-slate-500 flex items-center justify-center text-center leading-tight">Total Recipients</p>
                    <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{total}</p>
                  </div>

                  <div className="flex flex-col justify-between rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
                    <p className="min-h-[2.25rem] text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-center leading-tight">Success / Sent</p>
                    <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{sent}</p>
                  </div>

                  <div className="flex flex-col justify-between rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
                    <p className="min-h-[2.25rem] text-xs font-medium text-rose-700 dark:text-rose-400 flex items-center justify-center text-center leading-tight">Failed</p>
                    <p className="mt-1 text-xl font-bold text-rose-600 dark:text-rose-400">{failed}</p>
                  </div>

                  <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-800 dark:bg-slate-900">
                    <p className="min-h-[2.25rem] text-xs font-medium text-slate-500 flex items-center justify-center text-center leading-tight">Pending</p>
                    <p className="mt-1 text-xl font-bold text-slate-700 dark:text-slate-300">{pending}</p>
                  </div>
                </div>

                {/* Detailed WhatsApp Blast Report Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Recipient Delivery Log ({reportRows.length})
                    </h4>
                    {isLoadingLogs && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}
                  </div>

                  <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <Table>
                      <TableHeader className="bg-slate-50 dark:bg-slate-800/60 sticky top-0">
                        <TableRow>
                          <TableHead className="text-xs">Recipient Phone</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Time</TableHead>
                          <TableHead className="text-xs">Message Preview</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportRows.map((row, idx) => {
                          const st = (row.status || 'pending').toLowerCase()
                          const isSuccess = st === 'sent' || st === 'delivered' || st === 'read'
                          const isFailed = st === 'failed' || st === 'error'

                          return (
                            <TableRow key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-xs">
                              <TableCell className="font-mono font-medium text-slate-800 dark:text-slate-200">
                                {row.phone}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    isSuccess
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                                      : isFailed
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                                      : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                                  }`}
                                >
                                  {isSuccess && <CheckCircle2 className="h-3 w-3" />}
                                  {isFailed && <AlertCircle className="h-3 w-3" />}
                                  {row.status ? row.status.toUpperCase() : 'PENDING'}
                                </span>
                                {row.error && (
                                  <p className="mt-0.5 text-[10px] text-rose-600 dark:text-rose-400 font-normal">
                                    {row.error}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="text-slate-500 whitespace-nowrap">
                                {row.time ? dayjs(row.time).format('MMM D, YYYY h:mm:ss A') : '-'}
                              </TableCell>
                              <TableCell className="text-slate-600 dark:text-slate-400 max-w-xs truncate">
                                {row.message}
                              </TableCell>
                            </TableRow>
                          )
                        })}

                        {reportRows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="py-6 text-center text-slate-500">
                              No log records found for this campaign.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
                      refetchLogs()
                    }}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Refresh Report
                  </Button>
                  <Button type="button" onClick={() => setSelectedProgressCampaign(null)}>
                    Close Report
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* WHATSAPP MESSAGE PREVIEW MODAL */}
      <Dialog
        open={Boolean(selectedPreviewCampaign)}
        onOpenChange={(open) => !open && setSelectedPreviewCampaign(null)}
      >
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
                onClick={() => setSelectedPreviewCampaign(null)} 
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
                  {selectedPreviewCampaign?.recipient_phones?.[0] || selectedPreviewCampaign?.contacts?.[0] || selectedPreviewCampaign?.name || 'Sample Contact'}
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
                  {selectedPreviewCampaign?.created_at || selectedPreviewCampaign?.createdAt 
                    ? dayjs(selectedPreviewCampaign.created_at || selectedPreviewCampaign.createdAt).format('MMMM D, YYYY') 
                    : 'Today'}
                </span>
              </div>

              {/* Message Bubbles for each template */}
              {selectedPreviewCampaign && (() => {
                const templates = getCampaignTemplates(selectedPreviewCampaign)
                const displayTemplates = templates.length > 0 ? templates : [{ text: 'No template content' }]

                return displayTemplates.map((template: any, idx: number) => {
                  const fileObj = template.file || {}
                  const buttonImgObj = template.button_image || {}
                  const mediaUrl = fileObj.file_url || fileObj.url || fileObj.image || fileObj.file || buttonImgObj.file_url || buttonImgObj.url || buttonImgObj.image || buttonImgObj.file || template.file_url || template.button_image_url
                  const fileType = fileObj.file_type || template.type || 'text'
                  const hasMedia = Boolean(mediaUrl || fileObj.file_type || buttonImgObj.file_url)

                  return (
                    <div key={idx} className="space-y-1">
                      {displayTemplates.length > 1 && (
                        <div className="text-[10px] font-semibold text-slate-500 text-right pr-1">
                          Template {idx + 1}
                        </div>
                      )}
                      <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-lg rounded-tr-none p-2 max-w-[85%] self-end relative shadow-[0_1px_0.5px_rgba(11,20,26,.13)] break-words whitespace-pre-wrap text-[14px] leading-[19px]">
                        {hasMedia && (
                          <div className="mb-1 rounded-md overflow-hidden bg-black/5 dark:bg-white/5 flex flex-col">
                            {buttonImgObj && (buttonImgObj.file_url || buttonImgObj.image || buttonImgObj.file || buttonImgObj.url) && (
                              <img
                                src={buttonImgObj.file_url || buttonImgObj.image || buttonImgObj.file || buttonImgObj.url}
                                alt="Button media"
                                className="w-full h-auto max-h-64 object-cover"
                              />
                            )}
                            {fileType === 'image' && mediaUrl && (
                              <img src={mediaUrl} alt="Media" className="w-full h-auto max-h-64 object-cover" />
                            )}
                            {fileType === 'video' && mediaUrl && (
                              <video src={mediaUrl} controls className="w-full h-auto max-h-64 bg-black" />
                            )}
                            {fileType === 'audio' && mediaUrl && (
                              <audio src={mediaUrl} controls className="w-full max-w-full h-10 mt-1 mb-1" />
                            )}
                            {fileType === 'document' && (
                              <div className="flex items-center gap-2 p-3 bg-black/5 dark:bg-white/5">
                                <div className="w-10 h-10 rounded bg-red-500 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-sm">FILE</div>
                                <span className="text-sm truncate font-medium flex-1">{fileObj.file_name || 'Document Attachment'}</span>
                              </div>
                            )}
                            {fileType === 'sticker' && mediaUrl && (
                              <img src={mediaUrl} alt="Sticker" className="w-24 h-24 object-contain bg-transparent m-2" />
                            )}
                          </div>
                        )}
                        
                        <div className="mb-3">
                          {template.text || template.template || `[${fileType} message]`}
                        </div>

                        {template.buttons?.length ? (
                          <div className="clear-both mt-2 space-y-1 border-t border-black/10 pt-1 dark:border-white/10">
                            {template.buttons.map((button: any, bIdx: number) => (
                              <div
                                key={button.id || bIdx}
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
                            12:00
                          </span>
                          <CheckCheck className="w-[15px] h-[15px] text-[#53bdeb]" />
                        </div>
                        
                        {/* Bubble Tail SVG */}
                        <svg viewBox="0 0 8 13" className="absolute top-0 -right-2 w-2 h-3 text-[#d9fdd3] dark:text-[#005c4b] fill-current">
                          <path d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path>
                        </svg>
                      </div>
                    </div>
                  )
                })
              })()}
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
