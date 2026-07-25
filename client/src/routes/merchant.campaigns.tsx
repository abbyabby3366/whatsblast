import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import {
  CheckCircle2,
  Clock,
  Loader2,
  Megaphone,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  FileText,
} from 'lucide-react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

export const Route = createFileRoute('/merchant/campaigns')({
  component: CampaignsPage,
})

type ButtonDraft = {
  id: string
  type: 'reply' | 'url' | 'call' | 'copy'
  display_text: string
  value?: string
}

type TemplateDraft = {
  id?: string
  messageType: string
  template: string
  fileId: string
  buttons: ButtonDraft[]
  buttonMediaType: string
  previewUrl: string | null
}

const createEmptyTemplateDraft = (): TemplateDraft => ({
  messageType: 'text',
  template: '',
  fileId: '',
  buttons: [],
  buttonMediaType: 'none',
  previewUrl: null,
})

const filePreviewUrl = (fileObj: any, buttonImageObj?: any) =>
  fileObj?.file ||
  fileObj?.url ||
  fileObj?.file_url ||
  fileObj?.image ||
  fileObj?.video ||
  fileObj?.document ||
  buttonImageObj?.file ||
  buttonImageObj?.url ||
  buttonImageObj?.file_url ||
  buttonImageObj?.image ||
  null

const normalizeButtonType = (type?: string): ButtonDraft['type'] => {
  if (type === 'cta_url') return 'url'
  if (type === 'cta_call') return 'call'
  if (type === 'cta_copy') return 'copy'
  if (type === 'url' || type === 'call' || type === 'copy') return type
  return 'reply'
}

const parseButtonParams = (params: any) => {
  if (!params) return {}
  if (typeof params === 'object') return params
  try {
    return JSON.parse(params)
  } catch {
    return {}
  }
}

const buildTemplatePayload = (value: TemplateDraft) => {
  const existing = value.id ? { id: value.id } : {}
  if (value.messageType === 'text') {
    return { ...existing, text: value.template }
  }
  if (['image', 'video', 'document'].includes(value.messageType)) {
    return {
      ...existing,
      file_id: value.fileId,
      text: value.template,
    }
  }
  if (value.messageType === 'buttons') {
    return {
      ...existing,
      text: value.template,
      ...(value.buttonMediaType !== 'none' && value.fileId ? { button_image_id: value.fileId } : {}),
      buttons: value.buttons.map((b) => ({
        id: b.id,
        displayText: b.display_text,
        type: b.type,
        value: b.value,
      })),
    }
  }
  return { ...existing, text: value.template }
}

const templateDraftFromCampaignTemplate = (template: any): TemplateDraft => {
  const fileObj = template?.file
  const buttonImageObj = template?.button_image
  const buttons = template?.buttons || []
  const fileId = fileObj?.id || buttonImageObj?.id || template?.file_id || template?.button_image_id || ''
  let messageType = 'text'

  if (buttons.length > 0) {
    messageType = 'buttons'
  } else if (fileId) {
    messageType = fileObj?.file_type || 'image'
  }

  return {
    id: template?.id,
    messageType,
    template: template?.text || '',
    fileId,
    buttons: buttons.map((b: any) => {
      const params = parseButtonParams(b.buttonParamsJson)
      const type = normalizeButtonType(b.type || b.name)
      return {
        id: b.id || params.id || Date.now().toString(),
        type,
        display_text: b.displayText || b.display_text || params.display_text || '',
        value: b.value || params.url || params.phone_number || params.copy_code || '',
      }
    }),
    buttonMediaType: buttons.length > 0 && fileId ? (buttonImageObj?.file_type || fileObj?.file_type || 'image') : 'none',
    previewUrl: filePreviewUrl(fileObj, buttonImageObj),
  }
}

function CampaignsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [customerPage, setCustomerPage] = useState(1)
  const [isSelectingAllCustomers, setIsSelectingAllCustomers] = useState(false)
  const [allMatchingCustomersSelected, setAllMatchingCustomersSelected] = useState(false)
  const [templateDrafts, setTemplateDrafts] = useState<TemplateDraft[]>([createEmptyTemplateDraft()])
  const [activeTemplateIndex, setActiveTemplateIndex] = useState(0)

  const activeTemplate = templateDrafts[activeTemplateIndex] || templateDrafts[0]
  const updateActiveTemplate = (patch: Partial<TemplateDraft>) => {
    setTemplateDrafts((drafts) => drafts.map((draft, index) => index === activeTemplateIndex ? { ...draft, ...patch } : draft))
  }
  const updateActiveButton = (buttonIndex: number, patch: Partial<ButtonDraft>) => {
    setTemplateDrafts((drafts) => drafts.map((draft, index) => {
      if (index !== activeTemplateIndex) return draft
      return {
        ...draft,
        buttons: draft.buttons.map((button, idx) => idx === buttonIndex ? { ...button, ...patch } : button),
      }
    }))
  }
  const resetTemplateDrafts = () => {
    setTemplateDrafts([createEmptyTemplateDraft()])
    setActiveTemplateIndex(0)
  }

  const handleTemplateFilesUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return
    const uploadType = activeTemplate.messageType === 'buttons' ? activeTemplate.buttonMediaType : activeTemplate.messageType
    if (uploadType === 'none' || uploadType === 'buttons') return

    const uploadedResults: Array<{ id: string; url: string | null }> = []
    for (const file of files) {
      const localPreview = uploadType === 'image' || uploadType === 'video' ? URL.createObjectURL(file) : null
      try {
        const res = await uploadFileMutation.mutateAsync({ file, type: uploadType })
        const preview = res.file || res.url || res.file_url || localPreview
        uploadedResults.push({ id: res.id, url: preview })
      } catch (err) {
        console.error('Failed uploading media file', err)
      }
    }

    if (uploadedResults.length === 0) return

    // Update active template with the 1st uploaded file
    updateActiveTemplate({ fileId: uploadedResults[0].id, previewUrl: uploadedResults[0].url })

    // If multiple files uploaded, add additional templates automatically
    if (uploadedResults.length > 1) {
      setTemplateDrafts((prev) => {
        const extraDrafts: TemplateDraft[] = uploadedResults.slice(1).map((item) => ({
          ...createEmptyTemplateDraft(),
          messageType: activeTemplate.messageType,
          buttonMediaType: activeTemplate.buttonMediaType,
          template: activeTemplate.template,
          buttons: [...activeTemplate.buttons],
          fileId: item.id,
          previewUrl: item.url,
        }))
        return [...prev, ...extraDrafts]
      })
      toast.success(`Uploaded ${uploadedResults.length} files and created ${uploadedResults.length} templates!`)
    }
  }

  // Fetch campaigns
  const { data: campaignsResponse, isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('blast-campaigns/').json<any>(),
  })

  const campaigns = Array.isArray(campaignsResponse)
    ? campaignsResponse 
    : campaignsResponse?.results || []

  const uploadFileMutation = useMutation({
    mutationFn: async (params: { file: File, type: string }) => {
      const formData = new FormData()
      formData.append('file_type', params.type)
      formData.append(params.type, params.file)
      
      return api.post('files/', { body: formData }).json<any>()
    },
    onSuccess: () => {
      toast.success('File uploaded successfully!')
    },
    onError: () => {
      toast.error('Failed to upload file.')
    }
  })

  const deleteFileMutation = useMutation({
    mutationFn: (id: string) => api.delete(`files/${id}/`),
    onSuccess: () => {
      toast.success('File deleted from database.')
    },
    onError: () => {
      toast.error('Failed to delete file from database.')
    }
  })

  const createCampaignMutation = useMutation({
    mutationFn: (data: any) => api.post('blast-campaigns/full-create/', { json: data }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setIsDialogOpen(false)
      setEditingCampaignId(null)
      form.reset()
      resetTemplateDrafts()
      toast.success('Campaign created successfully!')
    },
    onError: () => {
      toast.error('Failed to create campaign.')
    }
  })

  const updateCampaignMutation = useMutation({
    mutationFn: (data: any) => api.patch(`blast-campaigns/${editingCampaignId}/`, { json: data }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setIsDialogOpen(false)
      setEditingCampaignId(null)
      form.reset()
      resetTemplateDrafts()
      toast.success('Campaign updated successfully!')
    },
    onError: () => {
      toast.error('Failed to update campaign.')
    }
  })

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
    }
  })

  const pauseCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.post(`blast-campaigns/${id}/pause/`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign paused.')
    },
    onError: () => {
      toast.error('Failed to pause campaign.')
    }
  })

  const resumeCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.post(`blast-campaigns/${id}/resume/`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign resumed.')
    },
    onError: () => {
      toast.error('Failed to resume campaign.')
    }
  })

  const deleteCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.delete(`blast-campaigns/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign deleted successfully!')
    },
    onError: () => {
      toast.error('Failed to delete campaign.')
    }
  })

  const form = useForm({
    defaultValues: {
      name: '',
      messageType: 'text',
      template: '',
      fileId: '',
      buttons: [] as {
        id: string
        type: 'reply' | 'url' | 'call' | 'copy'
        display_text: string
        value?: string
      }[],
      recipients: [] as string[],
      buttonMediaType: 'none',
      buttonFileId: '',
    },
    onSubmit: async ({ value }) => {
      if (value.recipients.length === 0) {
        toast.error('Please select at least one customer.')
        return
      }

      const invalidIndex = templateDrafts.findIndex((template) => !template.template.trim())
      if (invalidIndex !== -1) {
        setActiveTemplateIndex(invalidIndex)
        toast.error(`Message template ${invalidIndex + 1} is required.`)
        return
      }

      const missingMediaIndex = templateDrafts.findIndex((template) =>
        ['image', 'video', 'document'].includes(template.messageType) && !template.fileId,
      )
      if (missingMediaIndex !== -1) {
        setActiveTemplateIndex(missingMediaIndex)
        toast.error(`Please upload media for template ${missingMediaIndex + 1}.`)
        return
      }

      const payload = {
        name: value.name,
        recipient_phones: value.recipients,
        templates: templateDrafts.map(buildTemplatePayload),
      }
      
      if (editingCampaignId) {
        updateCampaignMutation.mutate(payload)
      } else {
        createCampaignMutation.mutate(payload)
      }
    },
  })

  const handleEdit = (campaign: any) => {
    navigate({ to: '/merchant/campaigns/create', search: { edit: campaign.id } })
  }

  const fetchCustomersPage = async (page = customerPage, search = searchTerm) => {
    const res = await api.get(`customers/?search=${encodeURIComponent(search)}&page=${page}`).json<any>()
    return {
      count: Array.isArray(res) ? res.length : res.count || 0,
      results: Array.isArray(res) ? res : res.results || [],
      next: Array.isArray(res) ? null : res.next,
      previous: Array.isArray(res) ? null : res.previous,
    }
  }

  const { data: customersPageData, isLoading } = useQuery({
    queryKey: ['customers', searchTerm, customerPage],
    queryFn: () => fetchCustomersPage(customerPage),
  })

  const currentCustomers = customersPageData?.results || []
  const currentPagePhones = currentCustomers.map((c: any) => c.phone_number || c.phone).filter(Boolean)
  const currentPage = customerPage
  const pageSize = currentCustomers.length || 1
  const totalCustomerPages = customersPageData?.count ? Math.max(1, Math.ceil(customersPageData.count / pageSize)) : currentPage

  const fetchAllCustomerPhones = async (search = searchTerm) => {
    const phones: string[] = []
    let page = 1
    let hasNext = true

    while (hasNext) {
      const pageData = await fetchCustomersPage(page, search)
      phones.push(...pageData.results.map((c: any) => c.phone_number || c.phone).filter(Boolean))
      hasNext = Boolean(pageData.next)
      page += 1
    }

    return Array.from(new Set(phones))
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
          <Plus className="w-4 h-4 mr-2" />
          New Campaign
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoadingCampaigns ? (
          <div className="col-span-full py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            <Megaphone className="w-12 h-12 mx-auto text-slate-300 mb-4" />
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
              className="overflow-hidden bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800 shadow-lg shadow-slate-900/5 hover:shadow-xl transition-all duration-300 group"
            >
              <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg line-clamp-1">
                      {campaign.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {dayjs(campaign.created_at || campaign.createdAt).format('MMM D, YYYY h:mm A')}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap
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
                        <Clock className="w-3 h-3 mr-1" />
                      )}
                      {campaign.status === 'scheduled' && (
                        <Clock className="w-3 h-3 mr-1" />
                      )}
                      {campaign.status === 'running' && (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      )}
                      {campaign.status === 'completed' && (
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                      )}
                      {campaign.status === 'paused' && (
                        <Pause className="w-3 h-3 mr-1" />
                      )}
                      {(campaign.status || 'draft').charAt(0).toUpperCase() +
                        (campaign.status || 'draft').slice(1)}
                    </span>
                    
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
                          disabled={deleteCampaignMutation.isPending}
                        >
                          {deleteCampaignMutation.isPending && deleteCampaignMutation.variables === campaign.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
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
                              className="bg-red-600 hover:bg-red-700 text-white"
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
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
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
                                className="mb-2 max-h-36 w-full rounded-md object-contain bg-white dark:bg-slate-900"
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
                    <div className="flex flex-col gap-2 mt-4">
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                        disabled={runCampaignMutation.isPending}
                        onClick={() => {
                          runCampaignMutation.mutate(campaign.id)
                        }}
                      >
                        {runCampaignMutation.isPending && runCampaignMutation.variables === campaign.id ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Megaphone className="w-4 h-4 mr-2" />
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
                    <div className="flex flex-col gap-2 mt-4">
                      {campaign.status === 'running' && (
                        <Button
                          variant="outline"
                          className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                          disabled={pauseCampaignMutation.isPending}
                          onClick={() => pauseCampaignMutation.mutate(campaign.id)}
                        >
                          {pauseCampaignMutation.isPending && pauseCampaignMutation.variables === campaign.id ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Pause className="w-4 h-4 mr-2" />
                          )}
                          Pause Campaign
                        </Button>
                      )}
                      {campaign.status === 'paused' && (
                        <Button
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={resumeCampaignMutation.isPending}
                          onClick={() => resumeCampaignMutation.mutate(campaign.id)}
                        >
                          {resumeCampaignMutation.isPending && resumeCampaignMutation.variables === campaign.id ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4 mr-2" />
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
                      className="w-full mt-2"
                      variant="secondary"
                    >
                      <Clock className="w-4 h-4 mr-2" />
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
