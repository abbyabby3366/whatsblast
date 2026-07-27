import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Megaphone,
  Plus,
  Search,
  Trash2,
  RotateCcw,
  Sparkles,
  Users,
  Save,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Info,
  Upload,
  CheckCircle2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
} from 'lucide-react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { api, getErrorMessage } from '@/lib/api'
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/merchant/campaigns/create')({
  component: CreateCampaignPage,
})

const DRAFT_STORAGE_KEY = 'whatsblast_campaign_draft'

type ButtonDraft = {
  id: string
  type: 'reply' | 'url' | 'call' | 'copy'
  display_text: string
  value?: string
}

export type AttachedFile = {
  id: string
  url: string | null
  name?: string
  type?: string
}

type TemplateDraft = {
  id?: string
  messageType: string
  template: string
  footer?: string
  fileId: string
  attachedFiles?: AttachedFile[]
  buttons: ButtonDraft[]
  buttonMediaType: string
  previewUrl: string | null
}

const createEmptyTemplateDraft = (): TemplateDraft => ({
  messageType: 'text',
  template: '',
  footer: '',
  fileId: '',
  attachedFiles: [],
  buttons: [],
  buttonMediaType: 'none',
  previewUrl: null,
})

const filePreviewUrl = (fileObj: any, buttonImageObj?: any) =>
  fileObj?.file_path ||
  fileObj?.file ||
  fileObj?.url ||
  fileObj?.file_url ||
  fileObj?.image ||
  fileObj?.video ||
  fileObj?.document ||
  buttonImageObj?.file_path ||
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

const buildTemplatePayload = (value: TemplateDraft) => {
  const existing = value.id ? { id: value.id } : {}
  const fileIds = value.attachedFiles && value.attachedFiles.length > 0
    ? value.attachedFiles.map((f) => f.id).filter(Boolean)
    : value.fileId
    ? [value.fileId]
    : []
  const primaryFileId = fileIds[0] || ''

  return {
    ...existing,
    text: value.template,
    footer: value.footer || '',
    type: value.messageType,
    ...(primaryFileId ? { file_id: primaryFileId } : {}),
    ...(fileIds.length > 0 ? { file_ids: fileIds } : {}),
    ...(value.previewUrl && !value.previewUrl.startsWith('blob:') ? { file_url: value.previewUrl } : {}),
    ...(value.buttonMediaType !== 'none' && primaryFileId ? { button_image_id: primaryFileId } : {}),
    ...(value.buttons?.length
      ? {
          buttons: value.buttons.map((b) => ({
            id: b.id,
            displayText: b.display_text,
            type: b.type,
            value: b.value,
          })),
        }
      : {}),
  }
}

function CreateCampaignPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = useSearch({ strict: false }) as { edit?: string; step?: string }

  const editingCampaignId = search.edit || null
  const [step, setStep] = useState<number>(() => {
    const s = parseInt(search.step || '1', 10)
    return isNaN(s) || s < 1 || s > 4 ? 1 : s
  })

  // Wizard state
  const [name, setName] = useState('')
  const [minInterval, setMinInterval] = useState(10)
  const [maxInterval, setMaxInterval] = useState(15)
  const [enableWarmup, setEnableWarmup] = useState(true)
  const [templateDrafts, setTemplateDrafts] = useState<TemplateDraft[]>([createEmptyTemplateDraft()])
  const [activeTemplateIndex, setActiveTemplateIndex] = useState(0)
  const [recipients, setRecipients] = useState<string[]>([])

  // Recipient search state
  const [searchTerm, setSearchTerm] = useState('')
  const [customerPage, setCustomerPage] = useState(1)
  const [isSelectingAllCustomers, setIsSelectingAllCustomers] = useState(false)
  const [allMatchingCustomersSelected, setAllMatchingCustomersSelected] = useState(false)
  const [isDraftRestored, setIsDraftRestored] = useState(false)

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

  // CSV Import State
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [saveToContacts, setSaveToContacts] = useState(true)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isImportingCsv, setIsImportingCsv] = useState(false)
  const csvFileInputRef = useRef<HTMLInputElement>(null)

  const handleDownloadCsvTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ name: 'John Doe', phone_number: '60123456789', label: 'VIP' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, 'campaign_recipients_template.csv', { bookType: 'csv' })
  }

  const handleProcessCsvImport = async () => {
    if (!csvFile) {
      toast.error('Please select a CSV file first.')
      return
    }

    setIsImportingCsv(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json<any>(ws)

        const importedContacts: { name: string; phone_number: string; label?: string }[] = []
        const newPhones: string[] = []

        for (const row of data) {
          const phoneVal = row.phone_number || row.phone || row['Phone Number'] || row['Phone'] || row['phone number']
          const nameVal = row.name || row.Name || row['Full Name'] || ''
          const labelVal = row.label || row.Label || row['TAG'] || row['tag'] || ''

          if (phoneVal) {
            const cleanPhone = String(phoneVal).replace(/[^0-9]/g, '')
            if (cleanPhone) {
              newPhones.push(cleanPhone)
              importedContacts.push({
                name: String(nameVal),
                phone_number: cleanPhone,
                label: labelVal ? String(labelVal) : '',
              })
            }
          }
        }

        if (newPhones.length === 0) {
          toast.error('No valid phone numbers found in the CSV file.')
          setIsImportingCsv(false)
          return
        }

        // Add phone numbers to campaign recipients
        setRecipients((prev) => Array.from(new Set([...prev, ...newPhones])))

        // If "Add these customers to contacts" option is selected
        if (saveToContacts && importedContacts.length > 0) {
          await api.post('customers/import/', { json: { customers: importedContacts } }).json()
          queryClient.invalidateQueries({ queryKey: ['customers'] })
          queryClient.invalidateQueries({ queryKey: ['customer-labels'] })
          toast.success(`Imported ${newPhones.length} recipient(s) & saved to contacts!`)
        } else {
          toast.success(`Imported ${newPhones.length} recipient(s) for this campaign.`)
        }

        setIsCsvModalOpen(false)
        setCsvFile(null)
      } catch (err) {
        console.error(err)
        toast.error('Failed to parse or import CSV file.')
      } finally {
        setIsImportingCsv(false)
      }
    }
    reader.readAsBinaryString(csvFile)
  }

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
        status: 'DRAFT',
        min_interval_seconds: minInterval,
        max_interval_seconds: maxInterval,
        enable_warmup: enableWarmup,
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
        navigate({
          to: '/merchant/campaigns/create',
          search: { edit: savedCampaign.id, step: String(step) },
        })
      }
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to save draft.')),
  })

  const handleSaveDraft = () => {
    saveDraftMutation.mutate()
  }

  // Restore draft on mount if not editing and account matches
  useEffect(() => {
    if (editingCampaignId) {
      setHasAttemptedRestore(true)
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
          if (parsed.name) setName(parsed.name)
          if (typeof parsed.minInterval === 'number') setMinInterval(parsed.minInterval)
          if (typeof parsed.maxInterval === 'number') setMaxInterval(parsed.maxInterval)
          if (typeof parsed.enableWarmup === 'boolean') setEnableWarmup(parsed.enableWarmup)
          if (Array.isArray(parsed.templateDrafts) && parsed.templateDrafts.length > 0) {
            setTemplateDrafts(parsed.templateDrafts)
          }
          if (Array.isArray(parsed.recipients)) setRecipients(parsed.recipients)
          setIsDraftRestored(true)
        }
      } catch (err) {
        console.error('Failed to parse campaign draft', err)
      }
    }
    setHasAttemptedRestore(true)
  }, [editingCampaignId, accountId, draftKey])

  // Auto-save changes to localStorage (scoped to account)
  useEffect(() => {
    if (editingCampaignId || !accountId || !draftKey || !hasAttemptedRestore) return
    const draftData = {
      accountId,
      name,
      minInterval,
      maxInterval,
      enableWarmup,
      templateDrafts,
      recipients,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(draftKey, JSON.stringify(draftData))
  }, [name, minInterval, maxInterval, enableWarmup, templateDrafts, recipients, editingCampaignId, accountId, draftKey, hasAttemptedRestore])

  const clearDraft = () => {
    if (draftKey) localStorage.removeItem(draftKey)
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    setName('')
    setMinInterval(10)
    setMaxInterval(15)
    setEnableWarmup(true)
    setTemplateDrafts([createEmptyTemplateDraft()])
    setActiveTemplateIndex(0)
    setRecipients([])
    setIsDraftRestored(false)
    toast.success('Draft cleared!')
  }

  // Active template helpers
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

  // Fetch campaign if editing
  useQuery({
    queryKey: ['campaign', editingCampaignId],
    queryFn: async () => {
      if (!editingCampaignId) return null
      const campaign = await api.get(`blast-campaigns/${editingCampaignId}/`).json<any>()
      setName(campaign.name || '')
      setMinInterval(campaign.min_interval_seconds || 10)
      setMaxInterval(campaign.max_interval_seconds || 15)
      setEnableWarmup(Boolean(campaign.enable_warmup))
      setRecipients(campaign.recipient_phones || [])
      if (campaign.templates?.length) {
        setTemplateDrafts(
          campaign.templates.map((t: any) => {
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
                  type: f.file_type || t.type || 'image',
                }))
              : rawFileIds.map((id: string) => ({
                  id,
                  url: id === (t.file_id || t.file?.id) ? filePreviewUrl(t.file, t.button_image) : null,
                  type: t.type || 'image',
                }))

            return {
              id: t.id,
              messageType: t.type || (t.buttons?.length ? 'buttons' : rawFileIds.length > 0 ? 'image' : 'text'),
              template: t.text || '',
              footer: t.footer || '',
              fileId: rawFileIds[0] || '',
              attachedFiles: initialAttached,
              buttons: (t.buttons || []).map((b: any) => ({
                id: b.id || Date.now().toString(),
                type: normalizeButtonType(b.type),
                display_text: b.displayText || b.display_text || '',
                value: b.value || '',
              })),
              buttonMediaType: t.buttons?.length && rawFileIds.length > 0 ? 'image' : 'none',
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

    updateActiveTemplate({
      attachedFiles: updatedAttachedFiles,
      fileId: updatedAttachedFiles[0]?.id || '',
      previewUrl: updatedAttachedFiles[0]?.url || null,
    })

    toast.success(`Attached ${uploadedResults.length} file(s) to Template ${activeTemplateIndex + 1}!`)
  }

  // Launch Campaign mutation (runs blast directly)
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
      const res = await api.get(`customers/?search=${encodeURIComponent(searchTerm)}&page=${customerPage}`).json<any>()
      return {
        count: Array.isArray(res) ? res.length : res.count || 0,
        results: Array.isArray(res) ? res : res.results || [],
      }
    },
  })

  const currentCustomers = customersPageData?.results || []

  const fetchAllCustomerPhones = async (search = searchTerm) => {
    const phones: string[] = []
    let page = 1
    while (true) {
      const res = await api.get(`customers/?search=${encodeURIComponent(search)}&page=${page}`).json<any>()
      const results = Array.isArray(res) ? res : res.results || []
      const pagePhones = results.map((c: any) => c.phone_number || c.phone).filter(Boolean)
      phones.push(...pagePhones)
      if (Array.isArray(res) || !res.next || results.length === 0) break
      page++
    }
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

    if (recipients.length === 0) {
      setStep(3)
      toast.error('Please select at least one recipient.')
      return
    }

    const invalidIndex = templateDrafts.findIndex((template) => !template.template.trim())
    if (invalidIndex !== -1) {
      setStep(2)
      setActiveTemplateIndex(invalidIndex)
      toast.error(`Message template ${invalidIndex + 1} text is required.`)
      return
    }

    const missingMediaIndex = templateDrafts.findIndex(
      (template) => ['image', 'video', 'document'].includes(template.messageType) && !template.fileId
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
    const invalidIndex = templateDrafts.findIndex((template) => !template.template.trim())
    if (invalidIndex !== -1) {
      setActiveTemplateIndex(invalidIndex)
      toast.error(`Message template ${invalidIndex + 1} text is required.`)
      return
    }

    const missingMediaIndex = templateDrafts.findIndex(
      (template) => ['image', 'video', 'document'].includes(template.messageType) && !template.fileId
    )
    if (missingMediaIndex !== -1) {
      setActiveTemplateIndex(missingMediaIndex)
      toast.error(`Please upload media for template ${missingMediaIndex + 1}.`)
      return
    }

    setStep(3)
  }

  const handleNextStep3 = () => {
    if (recipients.length === 0) {
      toast.error('Please select at least one recipient.')
      return
    }
    setStep(4)
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
              Set up your multi-step WhatsApp blast in 4 simple steps
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDraftRestored && !editingCampaignId && (
            <span className="hidden items-center gap-1 text-xs text-emerald-600 sm:flex dark:text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" /> Auto-Saved Draft
            </span>
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

      {/* 4-Step Navigation Stepper */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-900/50 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-medium transition-all sm:text-sm ${
            step === 1
              ? 'bg-emerald-600 text-white shadow-sm'
              : step > 1
              ? 'bg-white text-emerald-700 dark:bg-slate-800 dark:text-emerald-400'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-xs font-bold">
            1
          </span>
          <span>Campaign Name</span>
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
          className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-medium transition-all sm:text-sm ${
            step === 2
              ? 'bg-emerald-600 text-white shadow-sm'
              : step > 2
              ? 'bg-white text-emerald-700 dark:bg-slate-800 dark:text-emerald-400'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-xs font-bold">
            2
          </span>
          <span>Message Template</span>
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
          className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-medium transition-all sm:text-sm ${
            step === 3
              ? 'bg-emerald-600 text-white shadow-sm'
              : step > 3
              ? 'bg-white text-emerald-700 dark:bg-slate-800 dark:text-emerald-400'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-xs font-bold">
            3
          </span>
          <span>Recipients</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!name.trim()) {
              toast.error('Please enter a campaign name first.')
              return
            }
            if (recipients.length === 0) {
              toast.error('Please select at least one recipient first.')
              return
            }
            setStep(4)
          }}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-medium transition-all sm:text-sm ${
            step === 4
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-xs font-bold">
            4
          </span>
          <span>Campaign Summary</span>
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

      {/* STEP 1: CAMPAIGN NAME & SETTINGS */}
      {step === 1 && (
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Step 1: Campaign Details</CardTitle>
            <CardDescription className="text-xs">
              Give your campaign a title and set the sending interval and warmup settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-name" className="text-xs font-semibold">
                Campaign Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="campaign-name"
                placeholder="e.g. Raya Special Promotion 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white dark:bg-slate-950"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="min-interval" className="text-xs font-medium">Min Interval (minutes)</Label>
                <Input
                  id="min-interval"
                  type="number"
                  min={1}
                  value={minInterval}
                  onChange={(e) => setMinInterval(parseInt(e.target.value, 10) || 1)}
                  className="bg-white dark:bg-slate-950"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="max-interval" className="text-xs font-medium">Max Interval (minutes)</Label>
                <Input
                  id="max-interval"
                  type="number"
                  min={1}
                  value={maxInterval}
                  onChange={(e) => setMaxInterval(parseInt(e.target.value, 10) || 1)}
                  className="bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
              <input
                id="enable-warmup"
                type="checkbox"
                checked={enableWarmup}
                onChange={(e) => setEnableWarmup(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="space-y-0.5">
                <Label htmlFor="enable-warmup" className="cursor-pointer text-xs font-medium">
                  Enable Account Warmup
                </Label>
                <p className="text-xs text-slate-500">
                  Gradually increases sending speed to reduce risk of WhatsApp session ban.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleNextStep1} className="bg-emerald-600 text-white hover:bg-emerald-700">
                Next: Message Template <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: MESSAGE TEMPLATE & MEDIA */}
      {step === 2 && (
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg">Step 2: Message Template</CardTitle>
            <CardDescription>
              Create text, media, or button templates for your blast sequence. Media upload is placed above text.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {templateDrafts.map((template, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant={index === activeTemplateIndex ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTemplateIndex(index)}
                    className={index === activeTemplateIndex ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}
                  >
                    Template {index + 1}
                    {template.template ? '' : ' *'}
                  </Button>
                ))}
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

            {/* Editing Active Template Box */}
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
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

              {/* Message Type */}
              <div className="space-y-2">
                <Label>Message Type</Label>
                <Select
                  value={activeTemplate.messageType}
                  onValueChange={(val: any) =>
                    updateActiveTemplate({
                      messageType: val,
                      fileId: '',
                      previewUrl: null,
                      buttonMediaType: val === 'buttons' ? activeTemplate.buttonMediaType : 'none',
                    })
                  }
                >
                  <SelectTrigger className="bg-white dark:bg-slate-950">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text Only</SelectItem>
                    <SelectItem value="buttons">Interactive Buttons</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* MEDIA UPLOAD AREA (PLACED ABOVE MESSAGE TEMPLATE TEXT) */}
              {(['image', 'video', 'document'].includes(activeTemplate.messageType) ||
                activeTemplate.messageType === 'buttons') && (
                <div className="space-y-2">
                  {activeTemplate.messageType === 'buttons' && (
                    <div className="mb-3 flex items-center gap-2 pt-1">
                      <input
                        id={`add-image-checkbox-${activeTemplateIndex}`}
                        type="checkbox"
                        checked={activeTemplate.buttonMediaType === 'image'}
                        onChange={(e) =>
                          updateActiveTemplate({
                            buttonMediaType: e.target.checked ? 'image' : 'none',
                            fileId: '',
                            previewUrl: null,
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <Label
                        htmlFor={`add-image-checkbox-${activeTemplateIndex}`}
                        className="cursor-pointer font-medium text-slate-700 dark:text-slate-300"
                      >
                        Add Image
                      </Label>
                    </div>
                  )}

                  {(activeTemplate.messageType !== 'buttons' || activeTemplate.buttonMediaType !== 'none') && (
                    <>
                      <div className="flex items-center justify-between">
                        <Label>
                          {activeTemplate.messageType === 'buttons' ? 'Upload Button Image' : 'Upload Media'}
                        </Label>
                        {activeTemplate.attachedFiles && activeTemplate.attachedFiles.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50"
                            onClick={() => {
                              activeTemplate.attachedFiles?.forEach((f) => {
                                if (f.id) deleteFileMutation.mutate(f.id)
                              })
                              updateActiveTemplate({ attachedFiles: [], fileId: '', previewUrl: null })
                            }}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear All Media
                          </Button>
                        )}
                      </div>

                      {/* Hidden file input supporting multiple files */}
                      <Input
                        id={`template-file-${activeTemplateIndex}`}
                        type="file"
                        multiple
                        accept={
                          (activeTemplate.messageType === 'buttons'
                            ? activeTemplate.buttonMediaType
                            : activeTemplate.messageType) === 'image'
                            ? 'image/*'
                            : (activeTemplate.messageType === 'buttons'
                                ? activeTemplate.buttonMediaType
                                : activeTemplate.messageType) === 'video'
                            ? 'video/*'
                            : '.pdf,.doc,.docx,.txt'
                        }
                        onChange={async (e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            await handleTemplateFilesUpload(e.target.files)
                          }
                        }}
                        className="hidden"
                      />

                      {/* Small Icon Previews List if files attached */}
                      {(() => {
                        const currentMediaType =
                          activeTemplate.messageType === 'buttons'
                            ? activeTemplate.buttonMediaType
                            : activeTemplate.messageType

                        const attachedList: AttachedFile[] =
                          activeTemplate.attachedFiles && activeTemplate.attachedFiles.length > 0
                            ? activeTemplate.attachedFiles
                            : activeTemplate.fileId
                            ? [
                                {
                                  id: activeTemplate.fileId,
                                  url: activeTemplate.previewUrl,
                                  type: currentMediaType,
                                },
                              ]
                            : []

                        const hasFiles = attachedList.length > 0

                        return (
                          <div className="space-y-3 mt-2">
                            {hasFiles && (
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                                <div className="mb-2 flex items-center justify-between">
                                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                    <span>
                                      {attachedList.length} media file{attachedList.length > 1 ? 's' : ''} attached
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
                                    Icon Preview
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  {attachedList.map((fileItem, idx) => {
                                    const matchedFile = userFiles?.find(
                                      (f: any) => f.id === fileItem.id || f._id === fileItem.id
                                    )
                                    const resolvedUrl =
                                      fileItem.url ||
                                      matchedFile?.file_path ||
                                      matchedFile?.url ||
                                      matchedFile?.file_url ||
                                      matchedFile?.file ||
                                      null
                                    const resolvedName =
                                      fileItem.name || matchedFile?.file_name || `Media #${idx + 1}`

                                    return (
                                      <div
                                        key={fileItem.id || idx}
                                        className="flex items-center justify-between gap-2.5 rounded-md border border-slate-200 bg-white p-2 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                                      >
                                        {/* Small Icon Preview Thumbnail (40px x 40px) */}
                                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950 flex items-center justify-center">
                                          {currentMediaType === 'image' && resolvedUrl ? (
                                            <img
                                              src={resolvedUrl}
                                              alt={resolvedName}
                                              className="h-full w-full object-cover"
                                              onError={(e) => {
                                                e.currentTarget.style.display = 'none'
                                              }}
                                            />
                                          ) : currentMediaType === 'video' ? (
                                            <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
                                              <VideoIcon className="h-4 w-4" />
                                            </div>
                                          ) : (
                                            <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                          )}
                                        </div>

                                        {/* File Info */}
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200" title={resolvedName}>
                                            {resolvedName}
                                          </p>
                                          <p className="text-[10px] text-slate-500 capitalize">
                                            {currentMediaType} attachment
                                          </p>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex items-center space-x-0.5 shrink-0">
                                          {resolvedUrl && (
                                            <a
                                              href={resolvedUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                              title="Open file in new tab"
                                            >
                                              <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                          )}
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50"
                                            title="Remove attachment"
                                            onClick={() => {
                                              const updated = attachedList.filter((_, i) => i !== idx)
                                              updateActiveTemplate({
                                                attachedFiles: updated,
                                                fileId: updated[0]?.id || '',
                                                previewUrl: updated[0]?.url || null,
                                              })
                                              if (fileItem.id) deleteFileMutation.mutate(fileItem.id)
                                            }}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Dropzone / Upload Trigger */}
                            <div
                              className={`relative cursor-pointer rounded-lg border-2 border-dashed border-slate-300 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900 ${
                                hasFiles ? 'p-3 text-center' : 'p-8 text-center'
                              }`}
                              onDragOver={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onDrop={async (e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                if (e.dataTransfer.files.length > 0) {
                                  await handleTemplateFilesUpload(e.dataTransfer.files)
                                }
                              }}
                              onClick={() =>
                                document.getElementById(`template-file-${activeTemplateIndex}`)?.click()
                              }
                            >
                              {hasFiles ? (
                                <div className="flex items-center justify-center space-x-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                                  <Plus className="h-4 w-4 text-emerald-600" />
                                  <span>Add more images / media to this template</span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center space-y-2">
                                  <div className="rounded-full bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-900/20">
                                    <Plus className="h-6 w-6" />
                                  </div>
                                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Click or drag and drop to upload (single or multiple)
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {activeTemplate.messageType === 'buttons'
                                      ? 'PNG, JPG or GIF (backend button_image field)'
                                      : activeTemplate.messageType === 'image'
                                      ? 'SVG, PNG, JPG or GIF'
                                      : activeTemplate.messageType === 'video'
                                      ? 'MP4, WebM or OGG'
                                      : 'PDF, DOC, DOCX or TXT'}
                                  </p>
                                </div>
                              )}
                            </div>

                            {uploadFileMutation.isPending && (
                              <p className="mt-2 flex items-center text-sm text-emerald-600">
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Uploading file(s)...
                              </p>
                            )}
                          </div>
                        )
                      })()}
                    </>
                  )}
                </div>
              )}

              {/* MESSAGE TEMPLATE TEXT AREA (PLACED BELOW MEDIA) */}
              <div className="space-y-2">
                <Label>Message Template</Label>
                <Textarea
                  placeholder="Type your message template text here... Use {{phone}} for customer phone number."
                  value={activeTemplate.template}
                  onChange={(e) => updateActiveTemplate({ template: e.target.value })}
                  className="min-h-[100px] bg-white dark:bg-slate-950"
                />
              </div>

              {/* MESSAGE FOOTER INPUT (OPTIONAL) */}
              <div className="space-y-2">
                <Label>Message Footer (Optional)</Label>
                <Input
                  placeholder="e.g. Reply STOP to unsubscribe or WhatsBlast"
                  value={activeTemplate.footer || ''}
                  onChange={(e) => updateActiveTemplate({ footer: e.target.value })}
                  className="bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              {/* INTERACTIVE BUTTONS BUILDER */}
              {activeTemplate.messageType === 'buttons' && (
                <div className="space-y-4 pt-2">
                  <Label>Interactive Buttons</Label>
                  <div className="space-y-3">
                    {activeTemplate.buttons.map((btn, index) => (
                      <div
                        key={index}
                        className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="flex items-center gap-2">
                          <Select
                            value={btn.type}
                            onValueChange={(val: any) =>
                              updateActiveButton(index, { type: val, value: val === 'reply' ? '' : btn.value })
                            }
                          >
                            <SelectTrigger className="w-[150px] bg-slate-50">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
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
                            onClick={() =>
                              updateActiveTemplate({
                                buttons: activeTemplate.buttons.filter((_, i) => i !== index),
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {btn.type !== 'reply' && (
                          <div className="pl-[158px]">
                            <Input
                              value={btn.value || ''}
                              placeholder={
                                btn.type === 'url'
                                  ? 'https://example.com'
                                  : btn.type === 'call'
                                  ? '+60123456789'
                                  : 'Code to copy'
                              }
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
                      onClick={() =>
                        updateActiveTemplate({
                          buttons: [
                            ...activeTemplate.buttons,
                            { id: Date.now().toString(), type: 'reply', display_text: '' },
                          ],
                        })
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add Button
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2 Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back: Campaign Name
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={saveDraftMutation.isPending}
                >
                  {saveDraftMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save as Draft
                </Button>
                <Button onClick={handleNextStep2} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  Next: Select Recipients <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: RECIPIENT SELECTION & LAUNCH */}
      {step === 3 && (
        <div className="space-y-4">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Step 3: Select Recipients</CardTitle>
              <CardDescription className="text-xs">
                Choose which contacts should receive this campaign. Search or select all matching.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search & Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search name or phone..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setCustomerPage(1)
                    }}
                    className="pl-9"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCsvModalOpen(true)}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
                    Import CSV
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSelectingAllCustomers}
                    onClick={handleSelectAllMatching}
                  >
                    {isSelectingAllCustomers ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Users className="mr-2 h-4 w-4 text-emerald-600" />
                    )}
                    {allMatchingCustomersSelected ? 'Deselect All' : 'Select All Matching'}
                  </Button>
                </div>
              </div>

              {/* Contacts List */}
              <div className="max-h-[300px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                {isLoadingCustomers ? (
                  <div className="p-8 text-center text-slate-500">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    <p className="mt-2 text-sm">Loading contacts...</p>
                  </div>
                ) : currentCustomers.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">No contacts found.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {currentCustomers.map((customer: any) => {
                      const phone = customer.phone_number || customer.phone
                      const isSelected = recipients.includes(phone)
                      return (
                        <div
                          key={customer.id || phone}
                          onClick={() => {
                            setRecipients((prev) =>
                              isSelected ? prev.filter((p) => p !== phone) : [...prev, phone]
                            )
                          }}
                          className={`flex cursor-pointer items-center justify-between p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900 ${
                            isSelected ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-900 dark:text-slate-100">
                                {customer.name || 'Unnamed Contact'}
                              </p>
                              {customer.label && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80">
                                  {customer.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">{phone}</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Step 3 Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back: Message Template
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveDraft}
                    disabled={saveDraftMutation.isPending}
                  >
                    {saveDraftMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save as Draft
                  </Button>

                  <Button
                    type="button"
                    onClick={handleNextStep3}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Next: Campaign Summary <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* STEP 4: CAMPAIGN SUMMARY & LAUNCH */}
      {step === 4 && (
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Step 4: Campaign Summary</CardTitle>
            <CardDescription className="text-xs">
              Review your campaign configuration and message sequence before launching your blast.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Overview Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Campaign Name</span>
                <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{name || 'Untitled'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Sending Interval</span>
                <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {minInterval} - {maxInterval} minutes
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Warmup mode: {enableWarmup ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Target Recipients</span>
                <p className="mt-1 text-base font-semibold text-emerald-900 dark:text-emerald-200">
                  {recipients.length} contact(s) selected
                </p>
              </div>
            </div>

            {/* Sequence Templates Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                  Message Sequence ({templateDrafts.length} template{templateDrafts.length > 1 ? 's' : ''})
                </h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(2)}
                  className="text-xs text-emerald-600 hover:text-emerald-700"
                >
                  Edit Templates
                </Button>
              </div>

              <div className="space-y-3">
                {templateDrafts.map((tmpl, idx) => {
                  const typeLabel =
                    tmpl.messageType === 'text'
                      ? 'Text Only'
                      : tmpl.messageType === 'buttons'
                      ? 'Interactive Buttons'
                      : tmpl.messageType === 'image'
                      ? 'Image'
                      : tmpl.messageType === 'video'
                      ? 'Video'
                      : 'Document'

                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-xs text-slate-500">
                          Template {idx + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          {tmpl.fileId && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              {tmpl.messageType === 'image' || tmpl.buttonMediaType === 'image' ? (
                                <ImageIcon className="h-3 w-3" />
                              ) : tmpl.messageType === 'video' ? (
                                <VideoIcon className="h-3 w-3" />
                              ) : (
                                <FileText className="h-3 w-3" />
                              )}
                              Media Attached
                            </span>
                          )}
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {typeLabel}
                          </span>
                        </div>
                      </div>

                      {tmpl.template && (
                        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap rounded-md bg-slate-50 p-2.5 dark:bg-slate-900/60 font-sans border border-slate-100 dark:border-slate-800">
                          {tmpl.template}
                        </p>
                      )}

                      {tmpl.footer && (
                        <p className="text-xs text-slate-500 italic pl-1">
                          Footer: {tmpl.footer}
                        </p>
                      )}

                      {tmpl.buttons && tmpl.buttons.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {tmpl.buttons.map((b, bIdx) => (
                            <span
                              key={bIdx}
                              className="inline-flex items-center text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded px-2 py-1 font-medium"
                            >
                              [{b.type.toUpperCase()}] {b.display_text || 'Button'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Step 4 Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button type="button" variant="outline" onClick={() => setStep(3)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back: Recipients
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={saveDraftMutation.isPending}
                >
                  {saveDraftMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save as Draft
                </Button>

                <Button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={launchCampaignMutation.isPending}
                  className="bg-emerald-600 font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700"
                >
                  {launchCampaignMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Megaphone className="mr-2 h-4 w-4" />
                  )}
                  {editingCampaignId ? 'Update Campaign' : 'Launch Campaign'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CSV Import Modal Dialog */}
      <Dialog open={isCsvModalOpen} onOpenChange={setIsCsvModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              Import Recipients via CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file to directly add recipient phone numbers to this campaign.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* File Upload Area */}
            <div
              className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-5 text-center hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
              onClick={() => csvFileInputRef.current?.click()}
            >
              <input
                type="file"
                accept=".csv, .xlsx"
                className="hidden"
                ref={csvFileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) setCsvFile(file)
                }}
              />
              <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
              {csvFile ? (
                <div>
                  <p className="font-medium text-emerald-600 dark:text-emerald-400 text-sm">{csvFile.name}</p>
                  <p className="text-xs text-slate-500 font-normal mt-0.5">
                    {(csvFile.size / 1024).toFixed(1)} KB • Click to change file
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Click to select CSV or XLSX file</p>
                  <p className="text-xs text-slate-400 mt-1">Columns: name, phone_number, label</p>
                </div>
              )}
            </div>

            {/* Save to contacts option checkbox & notice */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2 bg-slate-50/50 dark:bg-slate-900/50">
              <label className="flex items-center gap-2.5 cursor-pointer font-medium text-sm text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={saveToContacts}
                  onChange={(e) => setSaveToContacts(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Add these customers to contacts</span>
              </label>

              {saveToContacts && (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-2.5 border border-amber-200/80 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p>
                    <span className="font-semibold">Note:</span> If phone number matches an existing contact, details will be overwritten, and new labels will be added on.
                  </p>
                </div>
              )}
            </div>

            {/* Download Template */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>Need a sample template?</span>
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="text-emerald-600 hover:underline inline-flex items-center gap-1 font-medium"
              >
                <Download className="h-3.5 w-3.5" /> Download CSV Template
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCsvModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleProcessCsvImport}
              disabled={!csvFile || isImportingCsv}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isImportingCsv && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import Recipients
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
