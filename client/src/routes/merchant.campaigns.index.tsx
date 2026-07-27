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
  LayoutGrid,
  List,
  AlertCircle,
  ArrowLeft,
  User,
  MoreVertical,
  CheckCheck,
  Mic,
  RotateCcw,
  Video as VideoIcon,
  Search,
  Users,
  X,
} from 'lucide-react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { api, getErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const [selectedPreviewCampaign, setSelectedPreviewCampaign] = useState<any>(null)
  const [selectedCustomerListCampaign, setSelectedCustomerListCampaign] = useState<any>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerStatusFilter, setCustomerStatusFilter] = useState<'ALL' | 'SENT' | 'FAILED' | 'PENDING'>('ALL')

  const retryRecipientMutation = useMutation({
    mutationFn: ({ cId, phone }: { cId: string | number; phone: string }) =>
      api.post(`blast-campaigns/${cId}/retry-recipient/`, { json: { phone } }).json<any>(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['customer-list-logs', selectedCustomerListCampaign?.id] })
      toast.success(data?.message || 'Message retried successfully!')
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to retry message.'))
    },
  })

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

  const getCampaignTemplates = (campaign: any) => {
    if (Array.isArray(campaign?.templates) && campaign.templates.length > 0) {
      return campaign.templates
    }
    if (campaign?.template) {
      return [campaign.template]
    }
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
      if (mediaUrl) {
        list.push({ url: mediaUrl, type: fileType, name: fileObj.file_name })
      }
    }

    return list
  }

  // Fetch campaigns
  const { data: campaignsResponse, isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('blast-campaigns/').json<any>(),
  })

  const campaigns = Array.isArray(campaignsResponse)
    ? campaignsResponse
    : campaignsResponse?.results || []

  const pauseCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.post(`blast-campaigns/${id}/pause/`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign paused.')
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to pause campaign.'))
    },
  })

  const resumeCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.post(`blast-campaigns/${id}/resume/`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign resumed.')
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to resume campaign.'))
    },
  })

  const deleteCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.delete(`blast-campaigns/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign deleted successfully!')
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to delete campaign.'))
    },
  })

  const retryFailedMutation = useMutation({
    mutationFn: (id: string | number) => api.post(`blast-campaigns/${id}/retry-failed/`).json<any>(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign-logs'] })
      toast.success(data?.message || 'Retrying failed campaign messages...')
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to retry campaign.'))
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Campaigns</h2>
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
                        <div className="flex flex-col gap-1">
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
                          {campaign.error_message && (cStatus === 'paused' || cStatus === 'failed') && (
                            <div className="flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 max-w-[220px] leading-tight" title={campaign.error_message}>
                              <AlertCircle className="h-3 w-3 shrink-0 text-rose-500" />
                              <span className="truncate">{campaign.error_message}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <button
                          type="button"
                          onClick={() => setSelectedCustomerListCampaign(campaign)}
                          className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                          title="Click to view customer list"
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
                          {cStatus === 'paused' && (
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
                              disabled={resumeCampaignMutation.isPending}
                              onClick={() => resumeCampaignMutation.mutate(campaign.id)}
                            >
                              {resumeCampaignMutation.isPending && resumeCampaignMutation.variables === campaign.id ? (
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
                              onClick={() => pauseCampaignMutation.mutate(campaign.id)}
                            >
                              {pauseCampaignMutation.isPending && pauseCampaignMutation.variables === campaign.id ? (
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
                              onClick={() => navigate({ to: '/merchant/campaigns/progress', search: { id: campaign.id } })}
                            >
                              <Activity className="mr-1 h-3.5 w-3.5" />
                              Progress
                            </Button>
                          )}
                          {Boolean(campaign.stats?.failed) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 font-medium"
                              disabled={retryFailedMutation.isPending}
                              onClick={() => retryFailedMutation.mutate(campaign.id)}
                            >
                              {retryFailedMutation.isPending && retryFailedMutation.variables === campaign.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="mr-1 h-3.5 w-3.5 text-rose-600" />
                              )}
                              Retry ({campaign.stats.failed})
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs"
                            onClick={() => handleEdit(campaign)}
                          >
                            {cStatus === 'draft' ? 'Edit Draft' : 'Edit'}
                          </Button>
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
                  {campaign.error_message && ((campaign.status || '').toLowerCase() === 'paused' || (campaign.status || '').toLowerCase() === 'failed') && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold">Paused Reason:</span> {campaign.error_message}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Recipients
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomerListCampaign(campaign)}
                      className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                      title="Click to view customer list"
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
                        {campaign.templates.map((template: any, templateIndex: number) => {
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
                              {template.footer ? (
                                <p className="mt-1 text-xs italic text-slate-500 dark:text-slate-400">{template.footer}</p>
                              ) : null}
                              {template.buttons?.length ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {template.buttons.map((button: any, index: number) => (
                                    <span key={button.id || index} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                                      {button.displayText || button.display_text || button.text || button.title || button.value || 'Button'}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
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
                          className="w-full flex items-center justify-center gap-2"
                          onClick={() => navigate({ to: '/merchant/campaigns/progress', search: { id: campaign.id } })}
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
                            Edit
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
                  const mediaList = resolveTemplateMediaList(template)
                  const hasMedia = mediaList.length > 0

                  return (
                    <div key={idx} className="space-y-1">
                      {displayTemplates.length > 1 && (
                        <div className="text-[10px] font-semibold text-slate-500 text-right pr-1">
                          Template {idx + 1}
                        </div>
                      )}
                      <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-lg rounded-tr-none p-2 max-w-[85%] self-end relative shadow-[0_1px_0.5px_rgba(11,20,26,.13)] break-words whitespace-pre-wrap text-[14px] leading-[19px]">
                        {hasMedia && (
                          <div className="mb-1 rounded-md overflow-hidden bg-black/5 dark:bg-white/5 p-1 flex flex-wrap gap-1">
                            {mediaList.map((item, mIdx) => {
                              if (item.type === 'video') {
                                return <video key={mIdx} src={item.url} controls className="w-full h-auto max-h-48 bg-black rounded" />
                              }
                              if (item.type === 'audio') {
                                return <audio key={mIdx} src={item.url} controls className="w-full max-w-full h-10 my-1" />
                              }
                              if (item.type === 'document') {
                                return (
                                  <div key={mIdx} className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded w-full">
                                    <div className="w-8 h-8 rounded bg-red-500 text-white flex items-center justify-center shrink-0 font-bold text-[10px] shadow-sm">FILE</div>
                                    <span className="text-xs truncate font-medium flex-1">{item.name || 'Document Attachment'}</span>
                                  </div>
                                )
                              }
                              if (mediaList.length === 1) {
                                return (
                                  <img
                                    key={mIdx}
                                    src={item.url}
                                    alt="Media attachment"
                                    className="w-full h-auto max-h-48 object-cover rounded"
                                  />
                                )
                              }
                              return (
                                <img
                                  key={mIdx}
                                  src={item.url}
                                  alt={`Media ${mIdx + 1}`}
                                  className="h-16 w-16 object-cover rounded border border-black/10 dark:border-white/10"
                                />
                              )
                            })}
                          </div>
                        )}
                        
                        <div className="mb-2 font-normal">
                          {template.text || template.template || (hasMedia ? '' : `[message]`)}
                        </div>

                        {/* Footer */}
                        {template.footer ? (
                          <div className="text-[12px] text-[#667781] dark:text-[#8696a0] mt-1 italic border-t border-black/5 dark:border-white/5 pt-1">
                            {template.footer}
                          </div>
                        ) : null}

                        {/* Interactive Buttons */}
                        {template.buttons?.length ? (
                          <div className="clear-both mt-2 space-y-1 border-t border-black/10 pt-1 dark:border-white/10">
                            {template.buttons.map((button: any, bIdx: number) => {
                              const label = button.displayText || button.display_text || button.text || button.title || button.value || `Button ${bIdx + 1}`
                              const val = button.value || button.url || button.phone_number || button.copy_code || ''
                              return (
                                <div
                                  key={button.id || bIdx}
                                  className="rounded-md bg-white/70 px-3 py-2 text-center text-sm font-medium text-[#027eb5] shadow-sm dark:bg-[#111b21]/50 dark:text-[#53bdeb] flex flex-col items-center justify-center"
                                >
                                  <span>{label}</span>
                                  {val && val !== label && (
                                    <span className="text-[10px] opacity-75 truncate max-w-full font-normal">{val}</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                        
                        {/* Meta row: Time and Ticks */}
                        <div className="flex justify-end items-center gap-1 float-right mt-1 ml-2">
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

      {/* CUSTOMER LIST MODAL */}
      {(() => {
        const recipientPhones: string[] =
          selectedCustomerListCampaign?.recipient_phones ||
          selectedCustomerListCampaign?.contacts?.map((c: any) =>
            typeof c === 'string' ? c : c.phone || c.recipient_phone || c.name || c
          ) ||
          []

        const logs: any[] = customerLogsData?.results || []

        const customerRows =
          recipientPhones.length > 0
            ? recipientPhones.map((phone, idx) => {
                const cleanP = String(phone).replace(/[^0-9]/g, '')
                const matchedLog = logs.find(
                  (l) =>
                    String(l.recipient_phone || '').replace(/[^0-9]/g, '') === cleanP ||
                    String(l.to_jid || '').includes(cleanP)
                )

                if (matchedLog) {
                  return {
                    phone,
                    status: (matchedLog.status || 'sent').toLowerCase(),
                    time: matchedLog.created_at || matchedLog.wa_timestamp || matchedLog.createdAt,
                    error: matchedLog.error || null,
                    message: matchedLog.content?.text || 'Template message sent',
                  }
                }

                if (idx < (selectedCustomerListCampaign?.current_index || 0)) {
                  return {
                    phone,
                    status: 'failed',
                    time: null,
                    error: 'Send failed during execution',
                    message: 'Template message failed',
                  }
                }

                return {
                  phone,
                  status: 'pending',
                  time: null,
                  error: null,
                  message: 'Scheduled in queue',
                }
              })
            : logs.map((l) => ({
                phone: l.recipient_phone || l.to_jid || 'Recipient',
                status: (l.status || 'sent').toLowerCase(),
                time: l.created_at || l.wa_timestamp,
                error: l.error || null,
                message: l.content?.text || 'Message',
              }))

        const sentCount = customerRows.filter(
          (r) => r.status === 'sent' || r.status === 'delivered' || r.status === 'read'
        ).length
        const failedCount = customerRows.filter(
          (r) => r.status === 'failed' || r.status === 'error'
        ).length
        const pendingCount = customerRows.filter(
          (r) => r.status === 'pending' || r.status === 'queued'
        ).length

        const filteredCustomerRows = customerRows.filter((row) => {
          const matchesSearch =
            !customerSearch || row.phone.toLowerCase().includes(customerSearch.toLowerCase())
          let matchesStatus = true
          if (customerStatusFilter === 'SENT') {
            matchesStatus =
              row.status === 'sent' || row.status === 'delivered' || row.status === 'read'
          } else if (customerStatusFilter === 'FAILED') {
            matchesStatus = row.status === 'failed' || row.status === 'error'
          } else if (customerStatusFilter === 'PENDING') {
            matchesStatus = row.status === 'pending' || row.status === 'queued'
          }
          return matchesSearch && matchesStatus
        })

        return (
          <Dialog
            open={Boolean(selectedCustomerListCampaign)}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedCustomerListCampaign(null)
                setCustomerSearch('')
                setCustomerStatusFilter('ALL')
              }
            }}
          >
            <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-6">
              <DialogHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
                        Customer List
                      </DialogTitle>
                      <DialogDescription className="text-xs text-slate-500 mt-0.5">
                        {selectedCustomerListCampaign?.name} &bull; {customerRows.length} total customer(s)
                      </DialogDescription>
                    </div>
                  </div>

                  {failedCount > 0 && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-8 px-3 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium shadow-xs"
                      disabled={retryFailedMutation.isPending}
                      onClick={() => {
                        if (selectedCustomerListCampaign) {
                          retryFailedMutation.mutate(selectedCustomerListCampaign.id)
                        }
                      }}
                    >
                      {retryFailedMutation.isPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Retry All Failed ({failedCount})
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Sent: {sentCount}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                    Failed: {failedCount}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Pending: {pendingCount}
                  </span>
                </div>
              </DialogHeader>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search customer phone number..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                  {customerSearch && (
                    <button
                      type="button"
                      onClick={() => setCustomerSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900 text-xs">
                  <button
                    type="button"
                    onClick={() => setCustomerStatusFilter('ALL')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      customerStatusFilter === 'ALL'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    All ({customerRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerStatusFilter('SENT')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      customerStatusFilter === 'SENT'
                        ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    Sent ({sentCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerStatusFilter('FAILED')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      customerStatusFilter === 'FAILED'
                        ? 'bg-white text-rose-700 shadow-xs dark:bg-slate-800 dark:text-rose-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    Failed ({failedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerStatusFilter('PENDING')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      customerStatusFilter === 'PENDING'
                        ? 'bg-white text-amber-700 shadow-xs dark:bg-slate-800 dark:text-amber-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    Pending ({pendingCount})
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-[250px] border border-slate-200 rounded-lg dark:border-slate-800 my-2">
                {isLoadingCustomerLogs ? (
                  <div className="flex justify-center items-center py-16">
                    <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
                  </div>
                ) : filteredCustomerRows.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    No matching customers found.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-slate-900/60 text-xs">
                        <TableHead className="w-[50px]">#</TableHead>
                        <TableHead>Customer Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Info / Details</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomerRows.map((row, idx) => {
                        const isFailed = row.status === 'failed' || row.status === 'error'
                        const isSent =
                          row.status === 'sent' || row.status === 'delivered' || row.status === 'read'

                        return (
                          <TableRow key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50 text-xs">
                            <TableCell className="text-slate-400 font-medium">{idx + 1}</TableCell>
                            <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {row.phone}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                  isSent
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                                    : isFailed
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                                    : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                                }`}
                              >
                                {row.status.toUpperCase()}
                              </span>
                            </TableCell>
                            <TableCell className="text-slate-500 whitespace-nowrap">
                              {row.time ? dayjs(row.time).format('MMM D, YYYY h:mm:ss A') : '-'}
                            </TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title={row.error || row.message}>
                              {row.error ? (
                                <span className="text-rose-600 dark:text-rose-400 font-medium">{row.error}</span>
                              ) : (
                                <span>{row.message}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant={isFailed ? "destructive" : "outline"}
                                size="sm"
                                className={`h-7 px-2.5 text-xs font-medium ${
                                  isFailed
                                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 border-slate-200'
                                }`}
                                disabled={retryRecipientMutation.isPending}
                                onClick={() =>
                                  selectedCustomerListCampaign &&
                                  retryRecipientMutation.mutate({
                                    cId: selectedCustomerListCampaign.id,
                                    phone: row.phone,
                                  })
                                }
                                title="Retry message for this customer"
                              >
                                {retryRecipientMutation.isPending &&
                                retryRecipientMutation.variables?.phone === row.phone ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="mr-1 h-3 w-3" />
                                )}
                                Retry
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>

              <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
                  onClick={() => {
                    if (selectedCustomerListCampaign) {
                      const id = selectedCustomerListCampaign.id
                      setSelectedCustomerListCampaign(null)
                      navigate({ to: '/merchant/campaigns/progress', search: { id } })
                    }
                  }}
                >
                  <Activity className="mr-1.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  View Full Progress Page
                </Button>

                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })()}
    </div>
  )
}
