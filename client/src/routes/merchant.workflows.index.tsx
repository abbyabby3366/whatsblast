import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Plus,
  LayoutGrid,
  List,
  Search,
  Workflow as WorkflowIcon,
  Clock,
  MessageSquareReply,
  PlayCircle,
  Filter,
  Loader2,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { api, getErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { WorkflowCard } from '@/components/merchant-workflows/WorkflowCard'
import { WorkflowTable } from '@/components/merchant-workflows/WorkflowTable'
import { WorkflowLogsModal } from '@/components/merchant-workflows/WorkflowLogsModal'
import type { WorkflowItem, TriggerType } from '@/components/merchant-workflows/types'

export const Route = createFileRoute('/merchant/workflows/')({
  component: WorkflowsPage,
})

function WorkflowsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTriggerFilter, setSelectedTriggerFilter] = useState<'ALL' | TriggerType>('ALL')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    return (localStorage.getItem('workflows_view_mode') as 'card' | 'table') || 'card'
  })

  const [selectedWorkflowForLogs, setSelectedWorkflowForLogs] = useState<WorkflowItem | null>(null)
  const [workflowToDelete, setWorkflowToDelete] = useState<WorkflowItem | null>(null)
  const [runningWorkflowId, setRunningWorkflowId] = useState<string | undefined>(undefined)

  const { data: workflows = [], isLoading } = useQuery<WorkflowItem[]>({
    queryKey: ['workflows'],
    queryFn: async () => {
      try {
        return await api.get('workflows').json<WorkflowItem[]>()
      } catch {
        return []
      }
    },
  })

  // Toggle Active/Inactive status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async (wf: WorkflowItem) => {
      const id = wf.id || wf._id
      return api.patch(`workflows/${id}/toggle`).json<WorkflowItem>()
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      toast.success(`Workflow "${updated.name}" is now ${updated.is_active ? 'Active' : 'Inactive'}.`)
    },
    onError: async (err) => {
      toast.error(await getErrorMessage(err, 'Failed to update workflow status.'))
    },
  })

  // Run Now mutation for manual or scheduled workflows
  const runNowMutation = useMutation({
    mutationFn: async (wf: WorkflowItem) => {
      const id = wf.id || wf._id
      setRunningWorkflowId(id)
      return api.post(`workflows/${id}/run-now`).json<{ success: boolean; message: string }>()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['workflow-logs'] })
      toast.success('Workflow execution triggered in background!')
    },
    onError: async (err) => {
      toast.error(await getErrorMessage(err, 'Failed to execute workflow.'))
    },
    onSettled: () => setRunningWorkflowId(undefined),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`workflows/${id}`).json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      toast.success('Workflow deleted successfully.')
      setWorkflowToDelete(null)
    },
    onError: async (err) => {
      toast.error(await getErrorMessage(err, 'Failed to delete workflow.'))
    },
  })

  const handleViewModeChange = (mode: 'card' | 'table') => {
    setViewMode(mode)
    localStorage.setItem('workflows_view_mode', mode)
  }

  // Filtered workflows
  const filteredWorkflows = workflows.filter((wf) => {
    const matchesSearch =
      !searchTerm ||
      wf.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wf.description?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesTrigger =
      selectedTriggerFilter === 'ALL' || wf.trigger_type === selectedTriggerFilter

    const matchesStatus =
      selectedStatusFilter === 'ALL' ||
      (selectedStatusFilter === 'ACTIVE' && wf.is_active) ||
      (selectedStatusFilter === 'INACTIVE' && !wf.is_active)

    return matchesSearch && matchesTrigger && matchesStatus
  })

  const cronCount = workflows.filter((w) => w.trigger_type === 'CRON').length
  const replyCount = workflows.filter((w) => w.trigger_type === 'REPLY').length
  const manualCount = workflows.filter((w) => w.trigger_type === 'MANUAL').length

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <WorkflowIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>Automated Workflows</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Create multi-step WhatsApp automations triggered by schedules, customer replies, or on-demand runs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5">
            <Button
              variant={viewMode === 'card' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('card')}
              className="h-8 px-2.5"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('table')}
              className="h-8 px-2.5"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>

          <Button
            onClick={() => navigate({ to: '/merchant/workflows/create' })}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Create Workflow</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Trigger type pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl w-fit">
          <button
            onClick={() => setSelectedTriggerFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedTriggerFilter === 'ALL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({workflows.length})
          </button>
          <button
            onClick={() => setSelectedTriggerFilter('REPLY')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedTriggerFilter === 'REPLY'
                ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs'
                : 'text-slate-500 hover:text-sky-600'
            }`}
          >
            <MessageSquareReply className="w-3.5 h-3.5" />
            <span>Reply ({replyCount})</span>
          </button>
          <button
            onClick={() => setSelectedTriggerFilter('CRON')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedTriggerFilter === 'CRON'
                ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 shadow-xs'
                : 'text-slate-500 hover:text-amber-600'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Cron ({cronCount})</span>
          </button>
          <button
            onClick={() => setSelectedTriggerFilter('MANUAL')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedTriggerFilter === 'MANUAL'
                ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs'
                : 'text-slate-500 hover:text-purple-600'
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Manual ({manualCount})</span>
          </button>
        </div>

        {/* Search & Status Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search workflows..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs bg-white dark:bg-slate-900"
            />
          </div>

          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
            className="h-9 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 outline-none"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-9 h-9 animate-spin mb-3 text-emerald-600" />
          <p className="text-sm font-medium">Loading workflows...</p>
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 shadow-sm">
            <WorkflowIcon className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No workflows found</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-6">
            {searchTerm || selectedTriggerFilter !== 'ALL' || selectedStatusFilter !== 'ALL'
              ? 'No workflows match your active filter criteria.'
              : 'Create your first automation workflow with Cron, Auto-Reply, or Manual trigger.'}
          </p>
          <Button
            onClick={() => navigate({ to: '/merchant/workflows/create' })}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create Workflow</span>
          </Button>
        </div>
      ) : viewMode === 'table' ? (
        <WorkflowTable
          workflows={filteredWorkflows}
          onToggleStatus={(wf) => toggleStatusMutation.mutate(wf)}
          onRunNow={(wf) => runNowMutation.mutate(wf)}
          onViewLogs={(wf) => setSelectedWorkflowForLogs(wf)}
          onEdit={(wf) => navigate({ to: '/merchant/workflows/create', search: { edit: wf.id || wf._id } })}
          onDelete={(wf) => setWorkflowToDelete(wf)}
          runningId={runningWorkflowId}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredWorkflows.map((wf) => {
            const wfId = wf.id || wf._id
            return (
              <WorkflowCard
                key={wfId}
                workflow={wf}
                onToggleStatus={(w) => toggleStatusMutation.mutate(w)}
                onRunNow={(w) => runNowMutation.mutate(w)}
                onViewLogs={(w) => setSelectedWorkflowForLogs(w)}
                onEdit={(w) => navigate({ to: '/merchant/workflows/create', search: { edit: w.id || w._id } })}
                onDelete={(w) => setWorkflowToDelete(w)}
                isRunning={runningWorkflowId === wfId}
              />
            )
          })}
        </div>
      )}

      {/* Execution Logs Modal */}
      {selectedWorkflowForLogs && (
        <WorkflowLogsModal
          workflow={selectedWorkflowForLogs}
          isOpen={Boolean(selectedWorkflowForLogs)}
          onClose={() => setSelectedWorkflowForLogs(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(workflowToDelete)} onOpenChange={(open) => !open && setWorkflowToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
                  Delete Workflow
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-1">
                  Are you sure you want to delete <strong className="text-slate-800 dark:text-slate-200">"{workflowToDelete?.name}"</strong>? This will permanently delete its schedule and execution logs.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWorkflowToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (workflowToDelete) {
                  deleteMutation.mutate(workflowToDelete.id || (workflowToDelete._id as string))
                }
              }}
              disabled={deleteMutation.isPending}
              className="gap-1.5"
            >
              {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
