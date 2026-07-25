import { createFileRoute, useNavigate } from '@tanstack/react-router'
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

export const Route = createFileRoute('/merchant/campaigns/')({
  component: CampaignsPage,
})

function CampaignsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Campaigns</h2>
          <p className="text-slate-500">
            Create and manage your WhatsApp blasting campaigns.
          </p>
        </div>

        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
          onClick={() => navigate({ to: '/merchant/campaigns/create' })}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

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
                          ? 'bg-emerald-100 text-emerald-800'
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

                  {campaign.status === 'draft' && (
                    <div className="mt-4 flex flex-col gap-2">
                      <Button
                        className="w-full bg-emerald-600 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700"
                        disabled={runCampaignMutation.isPending}
                        onClick={() => {
                          runCampaignMutation.mutate(campaign.id)
                        }}
                      >
                        {runCampaignMutation.isPending && runCampaignMutation.variables === campaign.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Megaphone className="mr-2 h-4 w-4" />
                        )}
                        Send Blast Now
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleEdit(campaign)}
                      >
                        Edit Campaign
                      </Button>
                    </div>
                  )}
                  {campaign.status !== 'draft' && campaign.status !== 'completed' && campaign.status !== 'cancelled' && (
                    <div className="mt-4 flex flex-col gap-2">
                      {campaign.status === 'running' && (
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
                      {campaign.status === 'paused' && (
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
                        Update (Queued Msgs Only)
                      </Button>
                    </div>
                  )}
                  {campaign.status === 'scheduled' && (
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
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
