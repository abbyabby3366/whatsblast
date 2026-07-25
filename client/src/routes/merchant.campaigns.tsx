import { createFileRoute } from '@tanstack/react-router'
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
    setEditingCampaignId(campaign.id)
    const drafts = campaign.templates?.length
      ? campaign.templates.map(templateDraftFromCampaignTemplate)
      : [createEmptyTemplateDraft()]

    setTemplateDrafts(drafts)
    setActiveTemplateIndex(0)
    form.setFieldValue('name', campaign.name)
    form.setFieldValue('recipients', campaign.recipient_phones || [])
    setAllMatchingCustomersSelected(false)
    setIsDialogOpen(true)
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

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) {
            setEditingCampaignId(null)
            form.reset()
            setAllMatchingCustomersSelected(false)
            resetTemplateDrafts()
          }
        }}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20" onClick={() => { setEditingCampaignId(null); form.reset(); resetTemplateDrafts(); setAllMatchingCustomersSelected(false); }}>
              <Plus className="w-4 h-4 mr-2" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCampaignId ? 'Update Campaign' : 'Create New Campaign'}</DialogTitle>
              <DialogDescription>
                {editingCampaignId ? 'Update the campaign details. This will only update messages that are still Queued.' : 'Design your message and select the customers you want to blast.'}
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                e.stopPropagation()
                form.handleSubmit()
              }}
              className="space-y-6 mt-4"
            >
              <form.Field
                name="name"
                validators={{
                  onChange: ({ value }) =>
                    !value ? 'Campaign name is required' : undefined,
                }}
              >
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Campaign Name</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="e.g. Summer Promo 2026"
                      className="bg-slate-50"
                    />
                    {field.state.meta.errors.length > 0 ? (
                      <p className="text-sm text-red-500">
                        {field.state.meta.errors}
                      </p>
                    ) : null}
                  </div>
                )}
              </form.Field>

              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Label>Message Templates</Label>
                    <p className="text-xs text-slate-500">
                      Each recipient receives template 1, then 3 seconds later template 2, and so on before the normal interval.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTemplateDrafts((drafts) => [...drafts, createEmptyTemplateDraft()])
                      setActiveTemplateIndex(templateDrafts.length)
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Template
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {templateDrafts.map((template, index) => (
                    <Button
                      key={index}
                      type="button"
                      variant={index === activeTemplateIndex ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setActiveTemplateIndex(index)}
                      className={index === activeTemplateIndex ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
                    >
                      Template {index + 1}
                      {template.template ? '' : ' *'}
                    </Button>
                  ))}
                </div>

                <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Editing Template {activeTemplateIndex + 1} of {templateDrafts.length}
                    </p>
                    {templateDrafts.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() => {
                          setTemplateDrafts((drafts) => drafts.filter((_, index) => index !== activeTemplateIndex))
                          setActiveTemplateIndex((index) => Math.max(0, index - 1))
                        }}
                      >
                        <Trash2 className="mr-1 h-4 w-4" /> Remove Template
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Message Template</Label>
                    <Textarea
                      value={activeTemplate.template}
                      onChange={(e) => updateActiveTemplate({ template: e.target.value })}
                      placeholder="Hello! We have a special offer for you..."
                      className="min-h-[100px] bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Message Type</Label>
                    <Select
                      value={activeTemplate.messageType}
                      onValueChange={(val: any) => updateActiveTemplate({ messageType: val, fileId: '', previewUrl: null, buttonMediaType: val === 'buttons' ? activeTemplate.buttonMediaType : 'none' })}
                    >
                      <SelectTrigger className="bg-white dark:bg-slate-950">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text Only</SelectItem>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="document">Document</SelectItem>
                        <SelectItem value="buttons">Interactive Buttons</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(['image', 'video', 'document'].includes(activeTemplate.messageType) || activeTemplate.messageType === 'buttons') && (
                    <div className="space-y-2">
                      {activeTemplate.messageType === 'buttons' && (
                        <div className="mb-3 space-y-2">
                          <Label>Button Media (optional)</Label>
                          <Select
                            value={activeTemplate.buttonMediaType}
                            onValueChange={(val: any) => updateActiveTemplate({ buttonMediaType: val, fileId: '', previewUrl: null })}
                          >
                            <SelectTrigger className="bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Media</SelectItem>
                              <SelectItem value="image">Image</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {(activeTemplate.messageType !== 'buttons' || activeTemplate.buttonMediaType !== 'none') && (
                        <>
                          <Label>{activeTemplate.messageType === 'buttons' ? 'Upload Button Image' : 'Upload Media'}</Label>
                          {!activeTemplate.fileId && (
                            <div
                              className="relative mt-2 cursor-pointer rounded-lg border-2 border-dashed border-slate-300 p-8 text-center transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                              onDrop={async (e) => {
                                e.preventDefault(); e.stopPropagation()
                                if (e.dataTransfer.files.length === 0) return
                                const file = e.dataTransfer.files[0]
                                const uploadType = activeTemplate.messageType === 'buttons' ? activeTemplate.buttonMediaType : activeTemplate.messageType
                                if (uploadType === 'none') return
                                const localPreview = uploadType === 'image' || uploadType === 'video' ? URL.createObjectURL(file) : null
                                if (localPreview) updateActiveTemplate({ previewUrl: localPreview })
                                try {
                                  const res = await uploadFileMutation.mutateAsync({ file, type: uploadType })
                                  updateActiveTemplate({ fileId: res.id, previewUrl: res.file || res.url || res.file_url || localPreview })
                                } catch (err) {
                                  updateActiveTemplate({ previewUrl: null })
                                }
                              }}
                              onClick={() => document.getElementById(`template-file-${activeTemplateIndex}`)?.click()}
                            >
                              <Input
                                id={`template-file-${activeTemplateIndex}`}
                                type="file"
                                accept={
                                  (activeTemplate.messageType === 'buttons' ? activeTemplate.buttonMediaType : activeTemplate.messageType) === 'image' ? 'image/*' :
                                  (activeTemplate.messageType === 'buttons' ? activeTemplate.buttonMediaType : activeTemplate.messageType) === 'video' ? 'video/*' :
                                  '.pdf,.doc,.docx,.txt'
                                }
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  const uploadType = activeTemplate.messageType === 'buttons' ? activeTemplate.buttonMediaType : activeTemplate.messageType
                                  if (uploadType === 'none' || uploadType === 'buttons') return
                                  const localPreview = uploadType === 'image' || uploadType === 'video' ? URL.createObjectURL(file) : null
                                  if (localPreview) updateActiveTemplate({ previewUrl: localPreview })
                                  try {
                                    const res = await uploadFileMutation.mutateAsync({ file, type: uploadType })
                                    updateActiveTemplate({ fileId: res.id, previewUrl: res.file || res.url || res.file_url || localPreview })
                                  } catch (err) {
                                    updateActiveTemplate({ previewUrl: null })
                                  }
                                }}
                                className="hidden"
                              />
                              <div className="flex flex-col items-center justify-center space-y-2">
                                <div className="rounded-full bg-blue-50 p-3 text-blue-600 dark:bg-blue-900/20">
                                  <Plus className="h-6 w-6" />
                                </div>
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Click or drag and drop to upload</p>
                                <p className="text-xs text-slate-500">
                                  {activeTemplate.messageType === 'buttons' ? 'PNG, JPG or GIF (backend button_image field)' : activeTemplate.messageType === 'image' ? 'SVG, PNG, JPG or GIF' : activeTemplate.messageType === 'video' ? 'MP4, WebM or OGG' : 'PDF, DOC, DOCX or TXT'}
                                </p>
                              </div>
                            </div>
                          )}

                          {uploadFileMutation.isPending && (
                            <p className="mt-2 flex items-center text-sm text-blue-500">
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Uploading file...
                            </p>
                          )}

                          {activeTemplate.fileId && !uploadFileMutation.isPending && (
                            <div className="mt-2 flex flex-col gap-2 rounded-md border border-green-200 bg-green-50 p-2 dark:border-green-900 dark:bg-green-900/20">
                              {(['image', 'video'].includes(activeTemplate.messageType === 'buttons' ? activeTemplate.buttonMediaType : activeTemplate.messageType)) && activeTemplate.previewUrl && (
                                <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-md bg-black/5">
                                  {(activeTemplate.messageType === 'buttons' ? activeTemplate.buttonMediaType : activeTemplate.messageType) === 'image' ? (
                                    <img src={activeTemplate.previewUrl} alt="Preview" className="h-full w-full object-contain" />
                                  ) : (
                                    <video src={activeTemplate.previewUrl} controls className="h-full w-full object-contain" />
                                  )}
                                </div>
                              )}
                              <div className="flex w-full items-center justify-between">
                                <p className="px-2 text-sm font-medium text-green-600">File uploaded successfully.</p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50"
                                  onClick={() => {
                                    if (activeTemplate.fileId) deleteFileMutation.mutate(activeTemplate.fileId)
                                    updateActiveTemplate({ fileId: '', previewUrl: null })
                                  }}
                                >
                                  <Trash2 className="mr-1 h-4 w-4" /> Remove
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {activeTemplate.messageType === 'buttons' && (
                    <div className="space-y-4">
                      <Label>Interactive Buttons</Label>
                      <div className="space-y-4">
                        {activeTemplate.buttons.map((btn, index) => (
                          <div key={index} className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-center gap-2">
                              <Select
                                value={btn.type}
                                onValueChange={(val: any) => updateActiveButton(index, { type: val, value: val === 'reply' ? '' : btn.value })}
                              >
                                <SelectTrigger className="w-[120px] bg-slate-50"><SelectValue placeholder="Type" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="reply">Quick Reply</SelectItem>
                                  <SelectItem value="url">URL Link</SelectItem>
                                  <SelectItem value="call">Phone Call</SelectItem>
                                  <SelectItem value="copy">Copy Code</SelectItem>
                                </SelectContent>
                              </Select>

                              <Input
                                value={btn.display_text}
                                placeholder="Button text"
                                className="flex-1"
                                onChange={(e) => updateActiveButton(index, { display_text: e.target.value })}
                              />

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="shrink-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                                onClick={() => updateActiveTemplate({ buttons: activeTemplate.buttons.filter((_, i) => i !== index) })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            {btn.type !== 'reply' && (
                              <div className="pl-[128px]">
                                <Input
                                  value={btn.value || ''}
                                  placeholder={btn.type === 'url' ? 'https://example.com' : btn.type === 'call' ? '+60123456789' : 'Code to copy'}
                                  className="w-full bg-slate-50 text-sm"
                                  onChange={(e) => updateActiveButton(index, { value: e.target.value })}
                                />
                              </div>
                            )}
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateActiveTemplate({ buttons: [...activeTemplate.buttons, { id: Date.now().toString(), type: 'reply', display_text: '' }] })}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Add Button
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <form.Field name="recipients">
                {(field) => (
                  <div className="space-y-2">
                    <Label>
                      Select Recipients ({field.state.value.length} selected)
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={isSelectingAllCustomers || isLoading || !customersPageData?.count}
                      onClick={async () => {
                        setIsSelectingAllCustomers(true)
                        try {
                          const phones = await fetchAllCustomerPhones('')
                          field.handleChange(phones)
                          form.setFieldValue('recipients', phones)
                          setAllMatchingCustomersSelected(true)
                          toast.success(`Added ${phones.length} customer${phones.length === 1 ? '' : 's'} to this campaign.`)
                        } catch (err) {
                          toast.error('Failed to add all customers.')
                        } finally {
                          setIsSelectingAllCustomers(false)
                        }
                      }}
                    >
                      {isSelectingAllCustomers ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Add all customers
                    </Button>

                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                      <Input
                        placeholder="Search customers..."
                        className="pl-9 bg-slate-50 dark:bg-slate-950"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value)
                          setCustomerPage(1)
                          setAllMatchingCustomersSelected(false)
                        }}
                      />
                    </div>

                    <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={currentPagePhones.length > 0 && currentPagePhones.every((phone: string) => field.state.value.includes(phone))}
                            disabled={currentPagePhones.length === 0 || isLoading}
                            onChange={(e) => {
                              const checked = e.currentTarget.checked
                              if (checked) {
                                const nextRecipients = Array.from(new Set([...field.state.value, ...currentPagePhones]))
                                field.handleChange(nextRecipients)
                                form.setFieldValue('recipients', nextRecipients)
                              } else {
                                const nextRecipients = field.state.value.filter((phone) => !currentPagePhones.includes(phone))
                                field.handleChange(nextRecipients)
                                form.setFieldValue('recipients', nextRecipients)
                                setAllMatchingCustomersSelected(false)
                              }
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600"
                          />
                          Select current page
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                          {isSelectingAllCustomers && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                          <input
                            type="checkbox"
                            checked={allMatchingCustomersSelected}
                            disabled={isSelectingAllCustomers || isLoading || !customersPageData?.count}
                            onChange={async (e) => {
                              const checked = e.currentTarget.checked
                              setIsSelectingAllCustomers(true)
                              try {
                                const phones = await fetchAllCustomerPhones()
                                if (checked) {
                                      const nextRecipients = Array.from(new Set(phones))
                                  field.handleChange(nextRecipients)
                                  form.setFieldValue('recipients', nextRecipients)
                                  setAllMatchingCustomersSelected(true)
                                  toast.success(`Selected ${phones.length} customer${phones.length === 1 ? '' : 's'}.`)
                                } else {
                                  field.handleChange([])
                                  form.setFieldValue('recipients', [])
                                  setAllMatchingCustomersSelected(false)
                                  toast.success('Cleared all matching customers.')
                                }
                              } catch (err) {
                                toast.error('Failed to update all customers.')
                              } finally {
                                setIsSelectingAllCustomers(false)
                              }
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600"
                          />
                          Select all customers
                        </label>
                      </div>

                      <div className="max-h-[200px] space-y-2 overflow-y-auto">
                      {isLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        </div>
                      ) : currentCustomers.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-4">
                          No customers found.
                        </p>
                      ) : (
                        currentCustomers.map((c: any) => (
                          <div
                            key={c.id}
                            className="flex items-center space-x-2"
                          >
                            <input
                              type="checkbox"
                              id={`customer-${c.id}`}
                              checked={field.state.value.includes(c.phone_number || c.phone)}
                              onChange={(e) => {
                                const phone = c.phone_number || c.phone
                                if (!phone) {
                                  toast.error('Customer has no phone number.')
                                  return
                                }
                                if (e.target.checked) {
                                  field.handleChange(Array.from(new Set([
                                    ...field.state.value,
                                    phone,
                                  ])))
                                } else {
                                  field.handleChange(
                                    field.state.value.filter(
                                      (p) => p !== phone,
                                    ),
                                  )
                                  setAllMatchingCustomersSelected(false)
                                }
                              }}
                              className="w-4 h-4 text-blue-600 rounded border-slate-300"
                            />
                            <Label
                              htmlFor={`customer-${c.id}`}
                              className="font-normal cursor-pointer"
                            >
                              {c.name} ({c.phone_number || c.phone})
                            </Label>
                          </div>
                        ))
                      )}
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-slate-800">
                        <span>
                          Page {currentPage}{customersPageData?.count ? ` of ${totalCustomerPages}` : ''}
                          {customersPageData?.count ? ` • ${customersPageData.count} total` : ''}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setCustomerPage((page) => Math.max(1, page - 1))}
                            disabled={!customersPageData?.previous || isLoading}
                          >
                            Previous
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setCustomerPage((page) => page + 1)}
                            disabled={!customersPageData?.next || isLoading}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </form.Field>

              <form.Subscribe
                selector={(state) => [state.canSubmit]}
              >
                {([canSubmit]) => (
                  <div className="flex justify-end pt-4 border-t">
                    <Button
                      type="submit"
                      disabled={!canSubmit || createCampaignMutation.isPending || updateCampaignMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                    >
                      {createCampaignMutation.isPending || updateCampaignMutation.isPending 
                        ? (editingCampaignId ? 'Updating...' : 'Creating...') 
                        : (editingCampaignId ? 'Update Campaign' : 'Create Campaign')}
                    </Button>
                  </div>
                )}
              </form.Subscribe>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoadingCampaigns ? (
          <div className="col-span-full py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
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
            <Button onClick={() => { setEditingCampaignId(null); form.reset(); resetTemplateDrafts(); setAllMatchingCustomersSelected(false); setIsDialogOpen(true); }} variant="outline">
              Create Campaign
            </Button>
          </div>
        ) : (
          campaigns.map((campaign: any) => (
            <Card
              key={campaign.id}
              className="overflow-hidden bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-white/20 shadow-xl shadow-blue-900/5 hover:shadow-2xl transition-all duration-300 group"
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
                            ? 'bg-blue-100 text-blue-800'
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
                            <p className="mb-2 text-xs font-semibold text-blue-600 dark:text-blue-300">
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
                                  <span key={button.id || index} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
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
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
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
