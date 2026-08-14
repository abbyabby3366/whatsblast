import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, CheckCircle2, Phone, Calendar, Clock, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { WorkflowItem, WorkflowLogItem } from './types'

interface WorkflowLogsModalProps {
  workflow: WorkflowItem | null
  isOpen: boolean
  onClose: () => void
}

export function WorkflowLogsModal({ workflow, isOpen, onClose }: WorkflowLogsModalProps) {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED'>('ALL')
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false)

  const queryClient = useQueryClient()
  const workflowId = workflow?.id || workflow?._id

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['workflow-logs', workflowId, page, statusFilter],
    queryFn: async () => {
      if (!workflowId) return { logs: [], total: 0, page: 1, totalPages: 1 }
      const statusParam = statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''
      return api
        .get(`workflows/${workflowId}/logs?page=${page}&limit=20${statusParam}`)
        .json<{ logs: WorkflowLogItem[]; total: number; page: number; totalPages: number }>()
    },
    enabled: Boolean(isOpen && workflowId),
  })

  const clearLogsMutation = useMutation({
    mutationFn: async () => {
      if (!workflowId) return
      return api.delete(`workflows/${workflowId}/logs`).json<{ success: boolean; message: string }>()
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Workflow logs cleared and statistics reset.')
      queryClient.invalidateQueries({ queryKey: ['workflow-logs'] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      setIsConfirmResetOpen(false)
      refetch()
    },
    onError: () => {
      toast.error('Failed to clear logs.')
    },
  })

  const logs = data?.logs || []
  const totalPages = data?.totalPages || 1

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-5xl md:max-w-6xl w-[95vw] max-h-[88vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Execution Logs:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{workflow?.name}</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-1">
                  Trigger: <span className="font-medium text-slate-700 dark:text-slate-300">{workflow?.trigger_type}</span> • 
                  Total Runs: <span className="font-medium">{workflow?.stats?.triggered_count || 0}</span> • 
                  Sent: <span className="text-emerald-600 font-medium">{workflow?.stats?.sent_count || 0}</span> • 
                  Failed: <span className="text-rose-600 font-medium">{workflow?.stats?.failed_count || 0}</span>
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConfirmResetOpen(true)}
                  disabled={clearLogsMutation.isPending || (logs.length === 0 && !workflow?.stats?.triggered_count)}
                  className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reset All Logs</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3">
            <Button
              variant={statusFilter === 'ALL' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setStatusFilter('ALL'); setPage(1); }}
              className="text-xs h-7"
            >
              All Logs ({data?.total ?? 0})
            </Button>
            <Button
              variant={statusFilter === 'SUCCESS' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setStatusFilter('SUCCESS'); setPage(1); }}
              className="text-xs h-7"
            >
              Success
            </Button>
            <Button
              variant={statusFilter === 'FAILED' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setStatusFilter('FAILED'); setPage(1); }}
              className="text-xs h-7"
            >
              Failed
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p className="text-sm">Loading execution logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Clock className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-base font-semibold text-slate-700 dark:text-slate-300">No execution logs found</p>
              <p className="text-xs text-slate-500 mt-1">Logs will appear here once the workflow triggers.</p>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[700px]">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 min-w-[150px]">Time</th>
                    <th className="px-4 py-3 min-w-[170px]">Recipient</th>
                    <th className="px-4 py-3 min-w-[200px]">Trigger Details</th>
                    <th className="px-4 py-3 min-w-[140px]">Session</th>
                    <th className="px-4 py-3 min-w-[120px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600 dark:text-slate-400 font-mono">
                        {dayjs(log.createdAt).format('MMM D, YYYY HH:mm:ss')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono text-xs">{log.recipient_phone}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                        <div className="space-y-0.5">
                          {log.trigger_details?.matched_keyword && (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded text-[11px] font-mono mr-1.5">
                              keyword: "{log.trigger_details.matched_keyword}"
                            </span>
                          )}
                          {log.trigger_details?.incoming_text && (
                            <span className="text-slate-700 dark:text-slate-300 font-medium">
                              "{log.trigger_details.incoming_text}"
                            </span>
                          )}
                          {log.trigger_details?.sender_name ? (
                            <span className="text-[11px] text-slate-400 block">
                              from {log.trigger_details.sender_name}
                              {log.trigger_details.sender_phone &&
                              log.trigger_details.sender_phone !== log.trigger_details.sender_name &&
                              log.trigger_details.sender_phone.length <= 15
                                ? ` (${log.trigger_details.sender_phone})`
                                : ''}
                            </span>
                          ) : log.trigger_details?.sender_phone ? (
                            <span className="text-[11px] text-slate-400 block">
                              from {log.trigger_details.sender_phone}
                            </span>
                          ) : null}
                          {log.trigger_details?.schedule_expression && (
                            <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              {log.trigger_details.schedule_expression}
                            </span>
                          )}
                          {!log.trigger_details?.matched_keyword &&
                            !log.trigger_details?.incoming_text &&
                            !log.trigger_details?.schedule_expression && (
                              <span className="text-slate-500 italic">Manual run</span>
                            )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 font-medium">
                        {log.session_display || log.session_id || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.status === 'SUCCESS' ? (
                          <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 gap-1 font-medium text-xs">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Success
                          </Badge>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="destructive" className="gap-1 font-medium w-fit text-xs">
                              <AlertCircle className="w-3 h-3" />
                              Failed
                            </Badge>
                            {log.error_message && (
                              <span className="text-[11px] text-rose-500 max-w-xs" title={log.error_message}>
                                {log.error_message}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 text-xs"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Confirmation Dialog to Reset Logs */}
    <Dialog open={isConfirmResetOpen} onOpenChange={setIsConfirmResetOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                Reset All Execution Logs?
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-1 leading-relaxed">
                Are you sure you want to delete all execution logs and reset the execution count statistics for <strong className="text-slate-800 dark:text-slate-200">"{workflow?.name}"</strong>? This action cannot be undone.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsConfirmResetOpen(false)}
            disabled={clearLogsMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => clearLogsMutation.mutate()}
            disabled={clearLogsMutation.isPending}
            className="gap-1.5"
          >
            {clearLogsMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Yes, Reset All Logs
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
  )
}
