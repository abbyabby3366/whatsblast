import dayjs from 'dayjs'
import {
  Clock,
  MessageSquareReply,
  PlayCircle,
  MoreVertical,
  Edit2,
  Trash2,
  ListOrdered,
  Play,
  CheckCircle2,
  AlertCircle,
  Layers,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { WorkflowItem } from './types'

interface WorkflowCardProps {
  workflow: WorkflowItem
  onToggleStatus: (wf: WorkflowItem) => void
  onRunNow: (wf: WorkflowItem) => void
  onViewLogs: (wf: WorkflowItem) => void
  onEdit: (wf: WorkflowItem) => void
  onDelete: (wf: WorkflowItem) => void
  isRunning?: boolean
}

export function WorkflowCard({
  workflow,
  onToggleStatus,
  onRunNow,
  onViewLogs,
  onEdit,
  onDelete,
  isRunning,
}: WorkflowCardProps) {
  const getTriggerBadge = () => {
    switch (workflow.trigger_type) {
      case 'CRON':
        return (
          <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 gap-1.5 py-1 px-2.5">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>Cron Schedule</span>
          </Badge>
        )
      case 'REPLY':
        return (
          <Badge className="bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800 gap-1.5 py-1 px-2.5">
            <MessageSquareReply className="w-3.5 h-3.5 text-sky-500" />
            <span>Auto-Reply</span>
          </Badge>
        )
      case 'MANUAL':
        return (
          <Badge className="bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800 gap-1.5 py-1 px-2.5">
            <PlayCircle className="w-3.5 h-3.5 text-purple-500" />
            <span>Manual Trigger</span>
          </Badge>
        )
      default:
        return null
    }
  }

  const renderTriggerSummary = () => {
    if (workflow.trigger_type === 'CRON') {
      return (
        <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5 mt-1 font-mono bg-slate-100 dark:bg-slate-800/80 px-2 py-1 rounded w-fit">
          <Clock className="w-3 h-3 text-slate-500" />
          <span>{workflow.trigger_config.cron_expression || 'Custom Schedule'}</span>
        </div>
      )
    }

    if (workflow.trigger_type === 'REPLY') {
      const matchType = workflow.trigger_config.match_type || 'all'
      const keywords = workflow.trigger_config.keywords || []
      return (
        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-slate-700 dark:text-slate-300 uppercase text-[10px] tracking-wider">
            {matchType}:
          </span>
          {matchType === 'all' || keywords.length === 0 ? (
            <span className="bg-sky-50 text-sky-700 dark:bg-sky-950 px-2 py-0.5 rounded text-[11px]">
              Any message
            </span>
          ) : (
            keywords.slice(0, 3).map((kw, i) => (
              <span key={i} className="bg-sky-50 text-sky-700 dark:bg-sky-950/80 border border-sky-200 dark:border-sky-800 px-1.5 py-0.5 rounded text-[11px] font-mono">
                "{kw}"
              </span>
            ))
          )}
          {keywords.length > 3 && (
            <span className="text-[11px] text-slate-400">+{keywords.length - 3} more</span>
          )}
        </div>
      )
    }

    return (
      <div className="text-xs text-slate-500 mt-1">
        Triggers on-demand via Run Now button.
      </div>
    )
  }

  return (
    <div className={`relative bg-white dark:bg-slate-900 border rounded-xl p-5 transition-all shadow-sm hover:shadow-md ${
      workflow.is_active
        ? 'border-slate-200 dark:border-slate-800'
        : 'border-slate-200/60 dark:border-slate-800/60 opacity-75'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {getTriggerBadge()}
            <span className="text-[11px] text-slate-400 font-medium">
              Updated {dayjs(workflow.updatedAt).format('MMM D, YYYY')}
            </span>
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
            {workflow.name}
          </h3>
          {workflow.description && (
            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
              {workflow.description}
            </p>
          )}
        </div>

        {/* Status Switch & Dropdown Menu */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-semibold ${workflow.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
              {workflow.is_active ? 'Active' : 'Off'}
            </span>
            <Switch
              checked={workflow.is_active}
              onCheckedChange={() => onToggleStatus(workflow)}
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onEdit(workflow)} className="gap-2 cursor-pointer">
                <Edit2 className="w-4 h-4 text-slate-500" />
                <span>Edit Workflow</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewLogs(workflow)} className="gap-2 cursor-pointer">
                <ListOrdered className="w-4 h-4 text-slate-500" />
                <span>View Logs</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(workflow)}
                className="gap-2 text-rose-600 focus:text-rose-600 focus:bg-rose-50 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Trigger & Step 2 Summary */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <div>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Step 1 Trigger:</span>
          {renderTriggerSummary()}
        </div>

        <div>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Step 2 Action:</span>
          <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
              <Layers className="w-3.5 h-3.5 text-emerald-500" />
              {workflow.templates?.length || 1} message template(s)
            </span>
            <span>•</span>
            {workflow.trigger_type === 'REPLY' ? (
              <span>Target: <strong className="text-slate-700 dark:text-slate-300">{workflow.action_config?.reply_target || 'SENDER'}</strong></span>
            ) : (
              <span>Recipients: <strong className="text-slate-700 dark:text-slate-300">{workflow.action_config?.recipient_phones?.length || 0}</strong> contacts</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats and Action Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px]">Triggered</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">{workflow.stats?.triggered_count || 0}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Sent</span>
            <span className="font-bold text-emerald-600">{workflow.stats?.sent_count || 0}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Failed</span>
            <span className="font-bold text-rose-600">{workflow.stats?.failed_count || 0}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewLogs(workflow)}
            className="text-xs h-8 gap-1.5"
          >
            <ListOrdered className="w-3.5 h-3.5 text-slate-500" />
            Logs
          </Button>

          {workflow.trigger_type !== 'REPLY' && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onRunNow(workflow)}
              disabled={isRunning || !workflow.is_active}
              className="text-xs h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {isRunning ? 'Running...' : 'Run Now'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
