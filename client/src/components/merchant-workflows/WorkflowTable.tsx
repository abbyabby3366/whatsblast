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

interface WorkflowTableProps {
  workflows: WorkflowItem[]
  onToggleStatus: (wf: WorkflowItem) => void
  onRunNow: (wf: WorkflowItem) => void
  onViewLogs: (wf: WorkflowItem) => void
  onEdit: (wf: WorkflowItem) => void
  onDelete: (wf: WorkflowItem) => void
  runningId?: string
}

export function WorkflowTable({
  workflows,
  onToggleStatus,
  onRunNow,
  onViewLogs,
  onEdit,
  onDelete,
  runningId,
}: WorkflowTableProps) {
  const getTriggerBadge = (type: string) => {
    switch (type) {
      case 'CRON':
        return (
          <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 gap-1 font-medium text-xs">
            <Clock className="w-3 h-3 text-amber-500" />
            Cron
          </Badge>
        )
      case 'REPLY':
        return (
          <Badge className="bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800 gap-1 font-medium text-xs">
            <MessageSquareReply className="w-3 h-3 text-sky-500" />
            Reply
          </Badge>
        )
      case 'MANUAL':
        return (
          <Badge className="bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800 gap-1 font-medium text-xs">
            <PlayCircle className="w-3 h-3 text-purple-500" />
            Manual
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <tr>
            <th className="px-5 py-3.5">Workflow</th>
            <th className="px-4 py-3.5">Trigger Type</th>
            <th className="px-4 py-3.5">Trigger Rule / Schedule</th>
            <th className="px-4 py-3.5">Status</th>
            <th className="px-4 py-3.5 text-center">Stats (Sent / Total)</th>
            <th className="px-4 py-3.5">Last Run</th>
            <th className="px-5 py-3.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {workflows.map((wf) => {
            const wfId = wf.id || wf._id
            return (
              <tr key={wfId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                <td className="px-5 py-4">
                  <div className="font-bold text-slate-900 dark:text-white">{wf.name}</div>
                  {wf.description && (
                    <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{wf.description}</div>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  {getTriggerBadge(wf.trigger_type)}
                </td>
                <td className="px-4 py-4 text-xs text-slate-600 dark:text-slate-400">
                  {wf.trigger_type === 'CRON' ? (
                    <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                      {wf.trigger_config.cron_expression || 'Scheduled'}
                    </span>
                  ) : wf.trigger_type === 'REPLY' ? (
                    <span>
                      {wf.trigger_config.match_type === 'all' || !wf.trigger_config.keywords?.length
                        ? 'All incoming messages'
                        : `${wf.trigger_config.match_type}: "${wf.trigger_config.keywords?.join(', ')}"`}
                    </span>
                  ) : (
                    <span className="text-slate-400">On-demand</span>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={wf.is_active}
                      onCheckedChange={() => onToggleStatus(wf)}
                    />
                    <span className={`text-xs font-semibold ${wf.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {wf.is_active ? 'Active' : 'Off'}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-center whitespace-nowrap">
                  <div className="text-xs font-semibold">
                    <span className="text-emerald-600">{wf.stats?.sent_count || 0}</span>
                    <span className="text-slate-400"> / </span>
                    <span className="text-slate-700 dark:text-slate-300">{wf.stats?.triggered_count || 0}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-xs text-slate-500 whitespace-nowrap">
                  {wf.stats?.last_run_at
                    ? dayjs(wf.stats.last_run_at).format('MMM D, HH:mm')
                    : 'Never'}
                </td>
                <td className="px-5 py-4 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    {wf.trigger_type !== 'REPLY' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRunNow(wf)}
                        disabled={runningId === wfId || !wf.is_active}
                        className="h-8 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                      >
                        <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                        Run
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewLogs(wf)}
                      className="h-8 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ListOrdered className="w-3.5 h-3.5 mr-1" />
                      Logs
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => onEdit(wf)} className="gap-2 cursor-pointer">
                          <Edit2 className="w-4 h-4 text-slate-500" />
                          <span>Edit</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(wf)}
                          className="gap-2 text-rose-600 focus:text-rose-600 focus:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
