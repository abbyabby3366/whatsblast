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
  Table as TableIcon,
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

  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')

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
              onClick={() => setViewMode('card')}
              className={`h-8 px-3 text-xs ${
                viewMode === 'card'
                  ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <LayoutGrid className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
              Cards
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('table')}
              className={`h-8 px-3 text-xs ${
                viewMode === 'table'
                  ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <TableIcon className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
              Table
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
                  <TableHead>Created Date</TableHead>
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
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : cStatus === 'running'
                              ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                              : cStatus === 'paused'
                              ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {cStatus.toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {total} customers
                      </TableCell>
                      <TableCell className="text-sm">
                        {campaign.templates?.length || 1} template(s)
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
                      <TableCell className="text-xs text-slate-500">
                        {dayjs(campaign.created_at || campaign.createdAt).format('MMM D, YYYY h:mm A')}
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
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold
                      ${
                        campaign.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 font-bold'
                          : campaign.status === 'scheduled'
                            ? 'bg-amber-100 text-amber-800'
                            : campaign.status === 'running'
                            ? 'bg-teal-100 text-teal-800'
                            : campaign.status === 'paused'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {campaign.status === 'draft' && (
                        <Clock className="mr-1 h-3 w-3" />
                      )}
                      {campaign.status === 'scheduled' && (
                        <Clock className="mr-1 h-3 w-3" />
                      )}
                      {campaign.status === 'running' && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      {campaign.status === 'completed' && (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      )}
                      {campaign.status === 'paused' && (
                        <Pause className="mr-1 h-3 w-3" />
                      )}
                      {(campaign.status || 'draft').charAt(0).toUpperCase() +
                        (campaign.status || 'draft').slice(1)}
                    </span>

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
                    <p className="text-sm font-semibold">
                      {campaign.recipient_phones?.length || 0} customers
                    </p>
                  </div>

                  {campaign.templates?.length ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                        Message Preview ({campaign.templates.length} template{campaign.templates.length === 1 ? '' : 's'})
                      </p>
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

      {/* CAMPAIGN PROGRESS MODAL */}
      <Dialog
        open={Boolean(selectedProgressCampaign)}
        onOpenChange={(open) => !open && setSelectedProgressCampaign(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-emerald-600" />
              Campaign Blast Progress
            </DialogTitle>
            <DialogDescription>
              Detailed real-time execution statistics for {selectedProgressCampaign?.name}
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
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      cStatus === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : cStatus === 'RUNNING'
                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 animate-pulse'
                        : cStatus === 'PAUSED'
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {cStatus}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-slate-700 dark:text-slate-300">Overall Progress</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{percent}%</span>
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
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs font-medium text-slate-500">Total Recipients</p>
                    <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{total}</p>
                  </div>

                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Sent Messages</p>
                    <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{sent}</p>
                  </div>

                  <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 text-center dark:border-red-900/40 dark:bg-red-950/20">
                    <p className="text-xs font-medium text-red-700 dark:text-red-400">Failed</p>
                    <p className="mt-1 text-xl font-bold text-red-600 dark:text-red-400">{failed}</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs font-medium text-slate-500">Pending</p>
                    <p className="mt-1 text-xl font-bold text-slate-700 dark:text-slate-300">{pending}</p>
                  </div>
                </div>

                {/* Details */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Sending Interval:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedProgressCampaign.min_interval_seconds || 10} min - {selectedProgressCampaign.max_interval_seconds || 15} min
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Account Warmup Mode:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedProgressCampaign.enable_warmup ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Templates Attached:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedProgressCampaign.templates?.length || 1} Sequence Template(s)
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['campaigns'] })}
                  >
                    Refresh Status
                  </Button>
                  <Button type="button" onClick={() => setSelectedProgressCampaign(null)}>
                    Close
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
