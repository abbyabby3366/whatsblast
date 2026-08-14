import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  CheckCircle2,
  Smartphone,
  Eye,
  Workflow as WorkflowIcon,
  Clock,
  MessageSquareReply,
  PlayCircle,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { api, getErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Step1WorkflowTrigger } from '@/components/merchant-workflows/Step1WorkflowTrigger'
import { Step2WorkflowAction } from '@/components/merchant-workflows/Step2WorkflowAction'
import { PhonePreviewModal } from '@/components/merchant-campaigns-create/components/PhonePreviewModal'
import {
  createEmptyTemplateDraft,
  buildTemplatePayload,
} from '@/components/merchant-campaigns-create/types'
import type { TemplateDraft } from '@/components/merchant-campaigns-create/types'
import type {
  TriggerType,
  ITriggerConfig,
  IActionConfig,
  WorkflowItem,
} from '@/components/merchant-workflows/types'

export const Route = createFileRoute('/merchant/workflows/create')({
  component: CreateWorkflowPage,
})

function CreateWorkflowPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = useSearch({ strict: false })

  const editingWorkflowId = search.edit || null

  // Wizard step (1 = Trigger, 2 = Action)
  const [step, setStep] = useState<number>(1)

  // Step 1: Workflow info & Trigger
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [triggerType, setTriggerType] = useState<TriggerType>('REPLY')
  const [triggerConfig, setTriggerConfig] = useState<ITriggerConfig>({
    match_type: 'contains',
    keywords: [],
    reply_session_mode: 'SAME_SESSION',
    schedule_type: 'daily',
    cron_expression: '0 9 * * *',
    schedule_params: { hour: 9, minute: 0, day_of_week: 1, day_of_month: 1 },
  })

  // Step 2: Action & Templates & Recipients
  const [templates, setTemplates] = useState<TemplateDraft[]>([createEmptyTemplateDraft()])
  const [activeTemplateIndex, setActiveTemplateIndex] = useState(0)
  const [actionConfig, setActionConfig] = useState<IActionConfig>({
    reply_target: 'SENDER',
    master_phones: [],
    session_mode: 'ALL',
    min_interval_seconds: 10,
    max_interval_seconds: 15,
  })
  const [recipients, setRecipients] = useState<string[]>([])

  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  // Queries for sessions, files, and customers
  const { data: availableSessions = [] } = useQuery<any[]>({
    queryKey: ['whatsapp-sessions'],
    queryFn: async () => {
      try {
        return await api.get('whatsapp-sessions/').json<any[]>()
      } catch {
        return []
      }
    },
  })

  const { data: userFiles = [] } = useQuery<any[]>({
    queryKey: ['files'],
    queryFn: async () => {
      try {
        return await api.get('files').json<any[]>()
      } catch {
        return []
      }
    },
  })

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      try {
        const res = await api.get('customers/').json<any>()
        return Array.isArray(res) ? res : res?.results || []
      } catch {
        return []
      }
    },
  })

  // Query editing workflow if edit ID is provided
  const { data: editingWorkflow, isLoading: isLoadingEditing } = useQuery<WorkflowItem>({
    queryKey: ['workflow', editingWorkflowId],
    queryFn: async () => {
      return api.get(`workflows/${editingWorkflowId}`).json<WorkflowItem>()
    },
    enabled: Boolean(editingWorkflowId),
  })

  // Populate form if editing
  useEffect(() => {
    if (editingWorkflow) {
      setName(editingWorkflow.name || '')
      setDescription(editingWorkflow.description || '')
      setIsActive(editingWorkflow.is_active !== undefined ? editingWorkflow.is_active : true)
      setTriggerType(editingWorkflow.trigger_type || 'CRON')
      setTriggerConfig(editingWorkflow.trigger_config || {})
      setActionConfig(editingWorkflow.action_config || {})
      setRecipients(editingWorkflow.action_config?.recipient_phones || [])

      if (editingWorkflow.templates && editingWorkflow.templates.length > 0) {
        const parsedTemplates = editingWorkflow.templates.map((tpl: any) => ({
          messageType: tpl.messageType || tpl.type || 'text',
          template: tpl.template || tpl.text || '',
          footer: tpl.footer || tpl.footer_text || '',
          fileId: tpl.fileId || tpl.file_id || '',
          attachedFiles: tpl.attachedFiles || [],
          buttons: tpl.buttons || [],
          buttonMediaType: tpl.buttonMediaType || 'none',
          previewUrl: tpl.previewUrl || null,
        }))
        setTemplates(parsedTemplates)
      }
    }
  }, [editingWorkflow])

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error('Please provide a name for this workflow.')
      }

      if (triggerType === 'CRON' && !triggerConfig.cron_expression?.trim()) {
        throw new Error('Please configure a valid cron schedule expression.')
      }

      if (triggerType === 'REPLY') {
        const target = actionConfig.reply_target || 'SENDER'
        if ((target === 'MASTER_PHONE' || target === 'BOTH') && (!actionConfig.master_phones || actionConfig.master_phones.length === 0)) {
          throw new Error('Please add at least one Master phone number.')
        }
      }

      const payload = {
        name: name.trim(),
        description: description.trim(),
        is_active: isActive,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        action_config: {
          ...actionConfig,
          recipient_phones: triggerType === 'REPLY' ? [] : recipients,
        },
        templates: templates.map(buildTemplatePayload),
      }

      if (editingWorkflowId) {
        return api.patch(`workflows/${editingWorkflowId}`, { json: payload }).json<WorkflowItem>()
      } else {
        return api.post('workflows', { json: payload }).json<WorkflowItem>()
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      toast.success(
        editingWorkflowId
          ? `Workflow "${saved.name}" updated successfully!`
          : `Workflow "${saved.name}" created successfully!`
      )
      navigate({ to: '/merchant/workflows' })
    },
    onError: async (err) => {
      toast.error(await getErrorMessage(err, 'Failed to save workflow.'))
    },
  })

  if (isLoadingEditing) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-2 text-emerald-600" />
        <p className="text-sm">Loading workflow details...</p>
      </div>
    )
  }

  const currentActiveTemplate = templates[activeTemplateIndex] || templates[0]

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-6">
      {/* Top Bar Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: '/merchant/workflows' })}
            className="gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Workflows</span>
          </Button>
          <span className="text-slate-300 dark:text-slate-700">/</span>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {editingWorkflowId ? 'Edit Workflow' : 'Create Automated Workflow'}
          </h1>
        </div>

        {/* Step Indicator Tabs */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              step === 1
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
              1
            </span>
            <span>Trigger Setup</span>
          </button>

          <button
            type="button"
            onClick={() => setStep(2)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              step === 2
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
              2
            </span>
            <span>Message & Delivery</span>
          </button>
        </div>
      </div>

      {/* Step Content */}
      {step === 1 && (
        <Step1WorkflowTrigger
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          isActive={isActive}
          setIsActive={setIsActive}
          triggerType={triggerType}
          setTriggerType={setTriggerType}
          triggerConfig={triggerConfig}
          setTriggerConfig={setTriggerConfig}
          availableSessions={availableSessions}
        />
      )}

      {step === 2 && (
        <Step2WorkflowAction
          triggerType={triggerType}
          templates={templates}
          setTemplates={setTemplates}
          activeTemplateIndex={activeTemplateIndex}
          setActiveTemplateIndex={setActiveTemplateIndex}
          actionConfig={actionConfig}
          setActionConfig={setActionConfig}
          recipients={recipients}
          setRecipients={setRecipients}
          customers={customers}
          availableSessions={availableSessions}
          userFiles={userFiles}
        />
      )}

      {/* Sticky Bottom Controls */}
      <div className="sticky bottom-4 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 py-3.5 px-6 rounded-xl shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsPreviewOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <span>Preview Message</span>
          </Button>
        </div>

        <div className="flex items-center gap-3">
          {step === 2 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep(1)}
              className="text-xs"
            >
              Back to Step 1
            </Button>
          )}

          {step === 1 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!name.trim()) {
                  toast.error('Please enter a workflow name.')
                  return
                }
                setStep(2)
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-5 shadow-xs"
            >
              Continue to Step 2: Action →
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-6 gap-2 shadow-sm"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{editingWorkflowId ? 'Update Workflow' : 'Save & Activate Workflow'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* WhatsApp Live Phone Preview Modal */}
      {isPreviewOpen && (
        <PhonePreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          templates={templates}
          templateDrafts={templates}
          name={name ? `${name}` : 'Workflow Preview'}
          campaignName={name ? `${name}` : 'Workflow Preview'}
          userFiles={userFiles}
        />
      )}
    </div>
  )
}
