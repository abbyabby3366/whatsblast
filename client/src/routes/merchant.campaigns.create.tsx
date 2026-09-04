import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Loader2,
  Trash2,
  RotateCcw,
  Sparkles,
  AlertCircle,
} from 'lucide-react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { api, getErrorMessage } from '@/lib/api'
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

import type { TemplateDraft, AttachedFile } from '@/components/merchant-campaigns-create/types'
import {
  DRAFT_STORAGE_KEY,
  createEmptyTemplateDraft,
  isTemplateTextRequired,
  filePreviewUrl,
  normalizeButtonType,
  buildTemplatePayload,
} from '@/components/merchant-campaigns-create/types'

import { CsvImportModal } from '@/components/merchant-campaigns-create/components/CsvImportModal'
import { PhonePreviewModal } from '@/components/merchant-campaigns-create/components/PhonePreviewModal'
import { Step1CampaignDetails } from '@/components/merchant-campaigns-create/components/Step1CampaignDetails'
import { Step2MessageTemplates } from '@/components/merchant-campaigns-create/components/Step2MessageTemplates'
import { Step3SendingSessions } from '@/components/merchant-campaigns-create/components/Step3SendingSessions'
import { Step4Recipients } from '@/components/merchant-campaigns-create/components/Step4Recipients'
import { Step5Summary } from '@/components/merchant-campaigns-create/components/Step5Summary'

export const Route = createFileRoute('/merchant/campaigns/create')({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: typeof search.edit === 'string' ? search.edit : undefined,
    step: typeof search.step === 'string' ? search.step : undefined,
  }),
  component: CreateCampaignPage,
})

function CreateCampaignPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = Route.useSearch()

  const editingCampaignId = search.edit || null
  const [step, setStep] = useState<number>(() => {
    const s = parseInt(search.step || '1', 10)
    return isNaN(s) || s < 1 || s > 5 ? 1 : s
  })

  // Wizard state
  const [name, setName] = useState('')
  const [minInterval, setMinInterval] = useState(10)
  const [maxInterval, setMaxInterval] = useState(15)
  const [enableWarmup, setEnableWarmup] = useState(true)
  const [retryOnFailure, setRetryOnFailure] = useState(true)
  const [sessionMode, setSessionMode] = useState<'ALL' | 'SPECIFIC'>('ALL')
  const [selectedSessions, setSelectedSessions] = useState<string[]>([])
  const [templateDrafts, setTemplateDrafts] = useState<TemplateDraft[]>([createEmptyTemplateDraft()])
  const [activeTemplateIndex, setActiveTemplateIndex] = useState(0)
  const [recipients, setRecipients] = useState<string[]>([])
  const [existingStatus, setExistingStatus] = useState<string | null>(null)

  // Recipient search state
  const [searchTerm, setSearchTerm] = useState('')
  const [customerPage] = useState(1)
  const [isSelectingAllCustomers, setIsSelectingAllCustomers] = useState(false)
  const [allMatchingCustomersSelected, setAllMatchingCustomersSelected] = useState(false)
  const [isDraftRestored, setIsDraftRestored] = useState(false)
  const [isPhonePreviewOpen, setIsPhonePreviewOpen] = useState(false)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)

  // Fetch user files for resolving media previews
  const { data: userFiles } = useQuery({
    queryKey: ['files'],
    queryFn: async () => {
      try {
        return await api.get('files').json<any[]>()
      } catch {
        return []
      }
    },
  })

  // Fetch user WhatsApp sessions
  const { data: availableSessions = [], isLoading: isLoadingSessions } = useQuery({
    queryKey: ['whatsapp-sessions'],
    queryFn: async () => {
      try {
        return await api.get('whatsapp-sessions/').json<any[]>()
      } catch {
        return []
      }
    },
  })

  // User profile for account-scoped draft checking
  const { data: userProfile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get('users/me/').json<any>(),
  })

  const accountId = userProfile?.id || null
  const draftKey = accountId ? `${DRAFT_STORAGE_KEY}_${accountId}` : null
  const [hasAttemptedRestore, setHasAttemptedRestore] = useState(false)

  // Save Draft Mutation
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim() || `Draft (${dayjs().format('MMM D, HH:mm')})`,
        status: editingCampaignId && existingStatus ? existingStatus : 'DRAFT',
        min_interval_seconds: minInterval,
        max_interval_seconds: maxInterval,
        enable_warmup: enableWarmup,
        retry_on_failure: retryOnFailure,
        session_mode: sessionMode,
        selected_sessions: selectedSessions,
        recipient_phones: recipients,
        templates: templateDrafts.map(buildTemplatePayload),
      }

      if (editingCampaignId) {
        return api.patch(`blast-campaigns/${editingCampaignId}/`, { json: payload }).json<any>()
      } else {
        return api.post('blast-campaigns/full-create/', { json: payload }).json<any>()
      }
    },
    onSuccess: (savedCampaign: any) => {
      if (draftKey) localStorage.removeItem(draftKey)
      localStorage.removeItem(DRAFT_STORAGE_KEY)
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['draft-campaigns'] })
      toast.success('Draft saved successfully!')

      if (savedCampaign?.id && !editingCampaignId) {
        setIsDraftRestored(false)
        navigate({
          to: '/merchant/campaigns/create',
          search: { edit: savedCampaign.id, step: String(step) },
        })
      }
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to save draft.')),
  })

  const deleteCampaignMutation = useMutation({
    mutationFn: (id: string | number) => api.delete(`blast-campaigns/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign deleted successfully!')
      navigate({ to: '/merchant/campaigns' })
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to delete campaign.'))
    },
  })

  const handleSaveDraft = () => {
    saveDraftMutation.mutate()
  }

  // Restore draft on mount if not editing and account matches
  useEffect(() => {
    if (editingCampaignId) {
      setHasAttemptedRestore(true)
      setIsDraftRestored(false)
      return
    }
    if (!accountId) return

    const savedScoped = draftKey ? localStorage.getItem(draftKey) : null
    const savedLegacy = localStorage.getItem(DRAFT_STORAGE_KEY)
    const saved = savedScoped || savedLegacy

    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.accountId && parsed.accountId !== accountId) {
          setIsDraftRestored(false)
        } else {
          const hasContent = Boolean(
            parsed.name?.trim() ||
            (Array.isArray(parsed.recipients) && parsed.recipients.length > 0) ||
            (Array.isArray(parsed.templateDrafts) && parsed.templateDrafts.some((t: any) => t.template?.trim())) ||
            (Array.isArray(parsed.selectedSessions) && parsed.selectedSessions.length > 0)
          )

          if (hasContent) {
            if (typeof parsed.minInterval === 'number') setMinInterval(parsed.minInterval)
            if (typeof parsed.maxInterval === 'number') setMaxInterval(parsed.maxInterval)
            if (typeof parsed.enableWarmup === 'boolean') setEnableWarmup(parsed.enableWarmup)
            if (typeof parsed.retryOnFailure === 'boolean') setRetryOnFailure(parsed.retryOnFailure)
            if (parsed.sessionMode === 'ALL' || parsed.sessionMode === 'SPECIFIC') setSessionMode(parsed.sessionMode)
            if (Array.isArray(parsed.selectedSessions)) setSelectedSessions(parsed.selectedSessions)
            if (Array.isArray(parsed.templateDrafts) && parsed.templateDrafts.length > 0) {
              setTemplateDrafts(parsed.templateDrafts)
            }
            if (Array.isArray(parsed.recipients)) setRecipients(parsed.recipients)
            setIsDraftRestored(true)
          } else {
            setIsDraftRestored(false)
          }
        }
      } catch (err) {
        console.error('Failed to parse campaign draft', err)
        setIsDraftRestored(false)
      }
    } else {
      setIsDraftRestored(false)
    }
    setHasAttemptedRestore(true)
  }, [editingCampaignId, accountId, draftKey])

  // Auto-save changes to localStorage (scoped to account)
  useEffect(() => {
    if (editingCampaignId || !accountId || !draftKey || !hasAttemptedRestore) return
    const hasContent = Boolean(
      name.trim() ||
      recipients.length > 0 ||
      templateDrafts.some((t) => t.template.trim()) ||
      selectedSessions.length > 0
    )
    if (!hasContent) {
      if (draftKey) localStorage.removeItem(draftKey)
      localStorage.removeItem(DRAFT_STORAGE_KEY)
      setIsDraftRestored(false)
      return
    }

    const draftData = {
      accountId,
      name,
      minInterval,
      maxInterval,
      enableWarmup,
      retryOnFailure,
      sessionMode,
      selectedSessions,
      templateDrafts,
      recipients,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(draftKey, JSON.stringify(draftData))
    setIsDraftRestored(true)
  }, [name, minInterval, maxInterval, enableWarmup, sessionMode, selectedSessions, templateDrafts, recipients, editingCampaignId, accountId, draftKey, hasAttemptedRestore])

  const clearDraft = () => {
    if (draftKey) localStorage.removeItem(draftKey)
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    setName('')
    setMinInterval(10)
    setMaxInterval(15)
    setEnableWarmup(true)
    setRetryOnFailure(true)
    setSessionMode('ALL')
    setSelectedSessions([])
    setTemplateDrafts([createEmptyTemplateDraft()])
    setActiveTemplateIndex(0)
    setRecipients([])
    setIsDraftRestored(false)
    toast.success('Draft cleared!')
  }

  // Fetch campaign if editing
  useQuery({
    queryKey: ['campaign', editingCampaignId],
    queryFn: async () => {
      if (!editingCampaignId) return null
      const campaign = await api.get(`blast-campaigns/${editingCampaignId}/`).json<any>()
      if (campaign.status) {
        setExistingStatus(campaign.status)
      }
      setName(campaign.name || '')
      setMinInterval(campaign.min_interval_seconds || 10)
      setMaxInterval(campaign.max_interval_seconds || 15)
      setEnableWarmup(Boolean(campaign.enable_warmup))
      setRetryOnFailure(campaign.retry_on_failure !== undefined ? Boolean(campaign.retry_on_failure) : true)
      setSessionMode(campaign.session_mode === 'SPECIFIC' ? 'SPECIFIC' : 'ALL')
      setSelectedSessions(campaign.selected_sessions || [])
      setRecipients(campaign.recipient_phones?.length ? campaign.recipient_phones : (campaign.contacts || []))

      const rawTemplates = (Array.isArray(campaign.templates) && campaign.templates.length > 0)
        ? campaign.templates
        : (campaign.template ? [campaign.template] : [])

      if (rawTemplates.length > 0) {
        setTemplateDrafts(
          rawTemplates.map((t: any) => {
            const rawFileIds: string[] = Array.isArray(t.file_ids) && t.file_ids.length > 0
              ? t.file_ids
              : t.file_id || t.file?.id
              ? [t.file_id || t.file?.id]
              : []
            const initialAttached: AttachedFile[] = Array.isArray(t.files) && t.files.length > 0
              ? t.files.map((f: any) => ({
                  id: f.id || f._id,
                  url: f.file_url || f.file_path || f.url || null,
                  name: f.file_name || 'Attached File',
                  type: f.file_type || t.button_media_type || t.buttonMediaType || t.type || 'image',
                  size: f.file_size || f.size || undefined,
                }))
              : rawFileIds.map((id: string) => ({
                  id,
                  url: id === (t.file_id || t.file?.id) ? filePreviewUrl(t.file, t.button_image) : null,
                  type: t.button_media_type || t.buttonMediaType || t.type || 'image',
                  size: t.file?.file_size || t.file?.size || undefined,
                }))

            const hasButtons = Boolean(t.buttons && Array.isArray(t.buttons) && t.buttons.length > 0)
            const inferredType = t.message_type || t.messageType || t.type || (hasButtons ? 'buttons' : rawFileIds.length > 0 ? (initialAttached[0]?.type || 'image') : 'text')
            const detectedMediaType = t.button_media_type || t.buttonMediaType || initialAttached[0]?.type || (rawFileIds.length > 0 ? 'image' : 'none')

            const templateText = t.template !== undefined && t.template !== null && String(t.template).trim() !== ''
              ? String(t.template)
              : (t.text !== undefined && t.text !== null
                ? String(t.text)
                : (t.caption !== undefined && t.caption !== null
                  ? String(t.caption)
                  : (typeof t.content === 'object' && t.content?.text ? String(t.content.text) : '')))

            const footerText = t.footer !== undefined && t.footer !== null && String(t.footer).trim() !== ''
              ? String(t.footer)
              : (t.footer_text !== undefined && t.footer_text !== null
                ? String(t.footer_text)
                : (t.footerText !== undefined && t.footerText !== null
                  ? String(t.footerText)
                  : (typeof t.content === 'object' && t.content?.footer ? String(t.content.footer) : '')))

            const rawButtonsList = t.buttons || (typeof t.content === 'object' && Array.isArray(t.content?.buttons) ? t.content.buttons : [])

            return {
              id: t.id || t._id,
              messageType: inferredType,
              template: templateText,
              footer: footerText,
              fileId: rawFileIds[0] || '',
              attachedFiles: initialAttached,
              buttons: (Array.isArray(rawButtonsList) ? rawButtonsList : []).map((b: any) => {
                let parsedParams: any = {}
                if (typeof b === 'object' && b !== null && typeof b.buttonParamsJson === 'string') {
                  try {
                    parsedParams = JSON.parse(b.buttonParamsJson)
                  } catch (_) {}
                }
                const btnDisplayText = b.display_text ?? b.displayText ?? b.text ?? b.title ?? b.label ?? parsedParams?.display_text ?? ''
                const btnValue = b.value ?? b.url ?? b.merchant_url ?? b.phone_number ?? b.phoneNumber ?? b.phone ?? b.copy_code ?? b.copyCode ?? parsedParams?.url ?? parsedParams?.phone_number ?? parsedParams?.copy_code ?? ''
                return {
                  id: b.id || b._id || Date.now().toString() + Math.random().toString(36).substring(2, 7),
                  type: normalizeButtonType(b.type || b.name),
                  display_text: btnDisplayText,
                  value: btnValue,
                }
              }),
              buttonMediaType: inferredType === 'buttons' ? detectedMediaType : 'none',
              previewUrl: filePreviewUrl(t.file, t.button_image),
            }
          })
        )
      }
      return campaign
    },
    enabled: Boolean(editingCampaignId),
  })

  // File mutations
  const uploadFileMutation = useMutation({
    mutationFn: async (params: { file: File; type: string }) => {
      const formData = new FormData()
      formData.append('file_type', params.type)
      formData.append('file', params.file)
      return api.post('files/', { body: formData }).json<any>()
    },
    onSuccess: () => toast.success('File uploaded successfully!'),
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to upload file.')),
  })

  const deleteFileMutation = useMutation({
    mutationFn: (id: string) => api.delete(`files/${id}/`),
    onSuccess: () => toast.success('File deleted.'),
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to delete file.')),
  })

  const activeTemplate = templateDrafts[activeTemplateIndex] || templateDrafts[0]

  const handleTemplateFilesUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return
    const uploadType = activeTemplate.messageType === 'buttons' ? activeTemplate.buttonMediaType : activeTemplate.messageType
    if (uploadType === 'none' || uploadType === 'buttons') return

    const uploadedResults: AttachedFile[] = []
    for (const file of files) {
      const localPreview = uploadType === 'image' || uploadType === 'video' ? URL.createObjectURL(file) : null
      try {
        const res = await uploadFileMutation.mutateAsync({ file, type: uploadType })
        const preview = res.file_path || res.file || res.url || res.file_url || localPreview
        uploadedResults.push({
          id: res.id || res._id,
          url: preview,
          name: res.file_name || file.name,
          type: uploadType,
          size: file.size || res.file_size || res.size || undefined,
        })
      } catch (err) {
        console.error('Failed uploading media file', err)
      }
    }

    if (uploadedResults.length === 0) return

    const currentAttached = activeTemplate.attachedFiles && activeTemplate.attachedFiles.length > 0
      ? activeTemplate.attachedFiles
      : activeTemplate.fileId
      ? [{ id: activeTemplate.fileId, url: activeTemplate.previewUrl, type: uploadType }]
      : []

    const updatedAttachedFiles = [...currentAttached, ...uploadedResults]

    setTemplateDrafts((drafts) =>
      drafts.map((draft, index) =>
        index === activeTemplateIndex
          ? {
              ...draft,
              attachedFiles: updatedAttachedFiles,
              fileId: updatedAttachedFiles[0]?.id || '',
              previewUrl: updatedAttachedFiles[0]?.url || null,
            }
          : draft
      )
    )

    toast.success(`Attached ${uploadedResults.length} file(s) to Template ${activeTemplateIndex + 1}!`)
  }

  // Launch Campaign mutation
  const launchCampaignMutation = useMutation({
    mutationFn: async (payload: any) => {
      let campaignId = editingCampaignId
      if (editingCampaignId) {
        await api.patch(`blast-campaigns/${editingCampaignId}/`, { json: { ...payload, status: 'RUNNING' } }).json()
      } else {
        const created = await api.post('blast-campaigns/full-create/', { json: { ...payload, status: 'RUNNING' } }).json<any>()
        campaignId = created.id
      }
      if (campaignId) {
        await api.post(`blast-campaigns/${campaignId}/run/`).json().catch(() => null)
      }
      return campaignId
    },
    onSuccess: () => {
      if (draftKey) localStorage.removeItem(draftKey)
      localStorage.removeItem(DRAFT_STORAGE_KEY)
      setIsDraftRestored(false)
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['draft-campaigns'] })
      toast.success('Campaign launched! Blast execution started.')
      navigate({ to: '/merchant/campaigns' })
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to launch campaign.')),
  })

  // Customer fetching
  const { data: customersPageData, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['customers', searchTerm, customerPage],
    queryFn: async () => {
      const res = await api.get(`customers/?search=${encodeURIComponent(searchTerm)}&page=${customerPage}&page_size=100`).json<any>()
      return {
        count: Array.isArray(res) ? res.length : res.count || 0,
        results: Array.isArray(res) ? res : res.results || [],
      }
    },
  })

  const currentCustomers = customersPageData?.results || []

  const fetchAllCustomerPhones = async (search = searchTerm): Promise<string[]> => {
    const res = await api.get(`customers/?all=true&search=${encodeURIComponent(search)}`).json<any>()
    const results: any[] = Array.isArray(res) ? res : res?.results || []
    const phones: string[] = results.map((c: any) => String(c.phone_number || c.phone || '')).filter(Boolean)
    return Array.from(new Set(phones))
  }

  const handleSelectAllMatching = async () => {
    if (allMatchingCustomersSelected) {
      setRecipients([])
      setAllMatchingCustomersSelected(false)
      return
    }

    setIsSelectingAllCustomers(true)
    try {
      const allPhones = await fetchAllCustomerPhones(searchTerm)
      setRecipients(allPhones)
      setAllMatchingCustomersSelected(true)
      toast.success(`Selected all ${allPhones.length} recipients matching search.`)
    } catch {
      toast.error('Failed to select all customers.')
    } finally {
      setIsSelectingAllCustomers(false)
    }
  }

  const handleFinalSubmit = () => {
    if (!name.trim()) {
      setStep(1)
      toast.error('Please enter a campaign name.')
      return
    }

    if (sessionMode === 'SPECIFIC' && selectedSessions.length === 0) {
      setStep(3)
      toast.error('Please select at least one sending session.')
      return
    }

    if (recipients.length === 0) {
      setStep(4)
      toast.error('Please select at least one recipient.')
      return
    }

    const invalidIndex = templateDrafts.findIndex(
      (template) => isTemplateTextRequired(template) && !template.template.trim()
    )
    if (invalidIndex !== -1) {
      setStep(2)
      setActiveTemplateIndex(invalidIndex)
      toast.error(`Message content ${invalidIndex + 1} text is required.`)
      return
    }

    const missingMediaIndex = templateDrafts.findIndex(
      (template) =>
        ['image', 'video', 'document'].includes(template.messageType) &&
        !template.fileId &&
        (!template.attachedFiles || template.attachedFiles.length === 0)
    )
    if (missingMediaIndex !== -1) {
      setStep(2)
      setActiveTemplateIndex(missingMediaIndex)
      toast.error(`Please upload media for template ${missingMediaIndex + 1}.`)
      return
    }

    const payload = {
      name,
      min_interval_seconds: minInterval,
      max_interval_seconds: maxInterval,
      enable_warmup: enableWarmup,
      retry_on_failure: retryOnFailure,
      session_mode: sessionMode,
      selected_sessions: selectedSessions,
      recipient_phones: recipients,
      templates: templateDrafts.map(buildTemplatePayload),
    }

    launchCampaignMutation.mutate(payload)
  }

  const handleNextStep1 = () => {
    if (!name.trim()) {
      toast.error('Please enter a campaign name.')
      return
    }
    setStep(2)
  }

  const handleNextStep2 = () => {
    const invalidIndex = templateDrafts.findIndex(
      (template) => isTemplateTextRequired(template) && !template.template.trim()
    )
    if (invalidIndex !== -1) {
      setActiveTemplateIndex(invalidIndex)
      toast.error(`Message content ${invalidIndex + 1} text is required.`)
      return
    }

    const missingMediaIndex = templateDrafts.findIndex(
      (template) =>
        ['image', 'video', 'document'].includes(template.messageType) &&
        !template.fileId &&
        (!template.attachedFiles || template.attachedFiles.length === 0)
    )
    if (missingMediaIndex !== -1) {
      setActiveTemplateIndex(missingMediaIndex)
      toast.error(`Please upload media for template ${missingMediaIndex + 1}.`)
      return
    }

    setStep(3)
  }

  const handleNextStep3 = () => {
    if (sessionMode === 'SPECIFIC' && selectedSessions.length === 0) {
      toast.error('Please select at least one sending session.')
      return
    }
    setStep(4)
  }

  const handleNextStep4 = () => {
    if (recipients.length === 0) {
      toast.error('Please select at least one recipient.')
      return
    }
    setStep(5)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3.5 pb-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2.5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: '/merchant/campaigns' })}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {editingCampaignId ? 'Edit Campaign' : 'Create New Campaign'}
            </h1>
            <p className="text-xs text-slate-500">
              Set up your multi-step WhatsApp blast in 5 simple steps
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDraftRestored && !editingCampaignId && (
            <span className="hidden items-center gap-1 text-xs text-emerald-600 sm:flex dark:text-emerald-400 font-medium">
              <Sparkles className="h-3.5 w-3.5" /> Auto-Saved Draft
            </span>
          )}

          {editingCampaignId && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40 font-medium"
                  disabled={deleteCampaignMutation.isPending}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5 text-red-500" /> Delete Campaign
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
                      onClick={() => deleteCampaignMutation.mutate(editingCampaignId)}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      {deleteCampaignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Delete
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {!editingCampaignId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearDraft}
              className="h-8 text-xs text-slate-500 hover:text-slate-700"
              title="Reset current form"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset Form
            </Button>
          )}
        </div>
      </div>

      {/* 5-Step Navigation Stepper */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-900/50 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-medium transition-all sm:text-xs md:text-sm ${
            step === 1
              ? 'bg-emerald-600 text-white shadow-sm'
              : step > 1
              ? 'bg-white text-emerald-700 dark:bg-slate-800 dark:text-emerald-400'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-xs font-bold">
            1
          </span>
          <span className="truncate">Campaign Name</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!name.trim()) {
              toast.error('Please enter a campaign name first.')
              return
            }
            setStep(2)
          }}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-medium transition-all sm:text-xs md:text-sm ${
            step === 2
              ? 'bg-emerald-600 text-white shadow-sm'
              : step > 2
              ? 'bg-white text-emerald-700 dark:bg-slate-800 dark:text-emerald-400'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-xs font-bold">
            2
          </span>
          <span className="truncate">Message Content</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!name.trim()) {
              toast.error('Please enter a campaign name first.')
              return
            }
            setStep(3)
          }}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-medium transition-all sm:text-xs md:text-sm ${
            step === 3
              ? 'bg-emerald-600 text-white shadow-sm'
              : step > 3
              ? 'bg-white text-emerald-700 dark:bg-slate-800 dark:text-emerald-400'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-xs font-bold">
            3
          </span>
          <span className="truncate">Sending Sessions</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!name.trim()) {
              toast.error('Please enter a campaign name first.')
              return
            }
            if (sessionMode === 'SPECIFIC' && selectedSessions.length === 0) {
              toast.error('Please select at least one sending session first.')
              return
            }
            setStep(4)
          }}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-medium transition-all sm:text-xs md:text-sm ${
            step === 4
              ? 'bg-emerald-600 text-white shadow-sm'
              : step > 4
              ? 'bg-white text-emerald-700 dark:bg-slate-800 dark:text-emerald-400'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-xs font-bold">
            4
          </span>
          <span className="truncate">Recipients</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!name.trim()) {
              toast.error('Please enter a campaign name first.')
              return
            }
            if (sessionMode === 'SPECIFIC' && selectedSessions.length === 0) {
              toast.error('Please select at least one sending session first.')
              return
            }
            if (recipients.length === 0) {
              toast.error('Please select at least one recipient first.')
              return
            }
            setStep(5)
          }}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-medium transition-all sm:text-xs md:text-sm ${
            step === 5
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-xs font-bold">
            5
          </span>
          <span className="truncate">Campaign Summary</span>
        </button>
      </div>

      {/* EDITING NOTICE BANNER */}
      {editingCampaignId && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-0.5 text-xs sm:text-sm">
            <p className="font-semibold text-amber-950 dark:text-amber-100">
              Notice: Editing Queued Campaign
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Edits made here will <strong>only affect unsent messages remaining in the queue</strong>. Messages that have already been sent to WhatsApp recipients cannot be edited or modified.
            </p>
          </div>
        </div>
      )}

      {/* STEP 1 */}
      {step === 1 && (
        <Step1CampaignDetails
          name={name}
          setName={setName}
          onNext={handleNextStep1}
          onSaveDraft={handleSaveDraft}
          isSavingDraft={saveDraftMutation.isPending}
        />
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <Step2MessageTemplates
          templateDrafts={templateDrafts}
          setTemplateDrafts={setTemplateDrafts}
          activeTemplateIndex={activeTemplateIndex}
          setActiveTemplateIndex={setActiveTemplateIndex}
          userFiles={userFiles}
          uploadFileMutation={uploadFileMutation}
          deleteFileMutation={deleteFileMutation}
          handleTemplateFilesUpload={handleTemplateFilesUpload}
          onPreview={() => setIsPhonePreviewOpen(true)}
          onSaveDraft={handleSaveDraft}
          isSavingDraft={saveDraftMutation.isPending}
          onBack={() => setStep(1)}
          onNext={handleNextStep2}
        />
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <Step3SendingSessions
          sessionMode={sessionMode}
          setSessionMode={setSessionMode}
          selectedSessions={selectedSessions}
          setSelectedSessions={setSelectedSessions}
          availableSessions={availableSessions}
          isLoadingSessions={isLoadingSessions}
          retryOnFailure={retryOnFailure}
          setRetryOnFailure={setRetryOnFailure}
          enableWarmup={enableWarmup}
          setEnableWarmup={setEnableWarmup}
          onSaveDraft={handleSaveDraft}
          isSavingDraft={saveDraftMutation.isPending}
          onBack={() => setStep(2)}
          onNext={handleNextStep3}
        />
      )}

      {/* STEP 4 */}
      {step === 4 && (
        <Step4Recipients
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          setIsCsvModalOpen={setIsCsvModalOpen}
          isSelectingAllCustomers={isSelectingAllCustomers}
          handleSelectAllMatching={handleSelectAllMatching}
          allMatchingCustomersSelected={allMatchingCustomersSelected}
          isLoadingCustomers={isLoadingCustomers}
          currentCustomers={currentCustomers}
          recipients={recipients}
          setRecipients={setRecipients}
          onSaveDraft={handleSaveDraft}
          isSavingDraft={saveDraftMutation.isPending}
          onBack={() => setStep(3)}
          onNext={handleNextStep4}
        />
      )}

      {/* STEP 5 */}
      {step === 5 && (
        <Step5Summary
          name={name}
          retryOnFailure={retryOnFailure}
          enableWarmup={enableWarmup}
          sessionMode={sessionMode}
          selectedSessions={selectedSessions}
          recipients={recipients}
          templateDrafts={templateDrafts}
          userFiles={userFiles}
          editingCampaignId={editingCampaignId}
          setIsPhonePreviewOpen={setIsPhonePreviewOpen}
          setStep={setStep}
          deleteCampaignMutation={deleteCampaignMutation}
          onSaveDraft={handleSaveDraft}
          isSavingDraft={saveDraftMutation.isPending}
          handleFinalSubmit={handleFinalSubmit}
          onBack={() => setStep(4)}
          isLaunching={launchCampaignMutation.isPending}
        />
      )}

      {/* Modals */}
      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImport={(imported) => setRecipients((prev) => Array.from(new Set([...prev, ...imported])))}
      />

      <PhonePreviewModal
        isOpen={isPhonePreviewOpen}
        onClose={() => setIsPhonePreviewOpen(false)}
        name={name}
        templateDrafts={templateDrafts}
        userFiles={userFiles}
      />
    </div>
  )
}
