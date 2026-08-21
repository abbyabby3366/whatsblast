import { Link } from '@tanstack/react-router'
import {
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Play,
  FileText,
  Activity,
  AlertCircle,
  RotateCcw,
  Edit3,
} from 'lucide-react'
import dayjs from 'dayjs'
import { safeText } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface CampaignViewsProps {
  viewMode: 'card' | 'table'
  campaigns: any[]
  isLoading: boolean
  onEdit: (campaign: any) => void
  onPause: (id: string | number) => void
  onResume: (id: string | number) => void
  onRetryFailed: (id: string | number) => void
  onProgress: (id: string | number) => void
  onPreview: (campaign: any) => void
  onCustomerList: (campaign: any) => void
  isPausing: boolean
  isResuming: boolean
  isRetrying: boolean
  actionId?: string | number
}

export function MerchantCampaignViews({
  viewMode,
  campaigns,
  isLoading,
  onEdit,
  onPause,
  onResume,
  onRetryFailed,
  onProgress,
  onPreview,
  onCustomerList,
  isPausing,
  isResuming,
  isRetrying,
  actionId,
}: CampaignViewsProps) {
  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="py-12 text-center text-sm text-slate-500">
          No campaigns found. Click "Create New Campaign" to start blasting!
        </CardContent>
      </Card>
    )
  }

  if (viewMode === 'table') {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 dark:bg-slate-900/60">
                  <TableHead className="w-[200px]">Campaign Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Contents</TableHead>
                  <TableHead>Delivery Stats</TableHead>
                  <TableHead className="w-[130px]">Progress</TableHead>
                  <TableHead>Created / Completed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const cStatus = (c.status || 'draft').toLowerCase()
                  const stats = c.stats || {}
                  const total = stats.total || c.recipient_phones?.length || c.contacts?.length || 0
                  const sent = stats.sent || 0
                  const failed = stats.failed || 0
                  const processed = sent + failed
                  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0

                  return (
                    <TableRow key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50">
                      <TableCell>
                        <div className="font-bold text-slate-900 dark:text-slate-100">{c.name || 'Untitled campaign'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              cStatus === 'completed'
                                ? failed > 0
                                  ? 'bg-rose-50 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                                : cStatus === 'scheduled'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                                : cStatus === 'running'
                                ? 'bg-teal-100 text-teal-800 border border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800'
                                : cStatus === 'paused'
                                ? 'bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800'
                                : cStatus === 'failed'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                                : cStatus === 'cancelled'
                                ? 'bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                : 'bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800'
                            }`}
                          >
                            {cStatus === 'completed' && failed > 0 ? `COMPLETED (${failed} FAILED)` : cStatus.toUpperCase()}
                          </span>
                          {c.error_message && (cStatus === 'paused' || cStatus === 'failed') && (
                            <Link
                              to="/merchant/whatsapp-sessions"
                              className="flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 max-w-[180px] leading-tight hover:underline cursor-pointer text-left transition-colors"
                              title="Click to redirect to WhatsApp Sessions page"
                            >
                              <AlertCircle className="h-3 w-3 shrink-0 text-rose-500" />
                              <span className="truncate">{safeText(c.error_message)}</span>
                            </Link>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <button
                          type="button"
                          onClick={() => onCustomerList(c)}
                          className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                        >
                          {total} customers
                        </button>
                      </TableCell>
                      <TableCell className="text-sm">
                        <button
                          type="button"
                          onClick={() => onPreview(c)}
                          className="inline-flex items-center gap-1.5 font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {c.templates?.length || 1} content(s)
                        </button>
                      </TableCell>
                      <TableCell>
                        {cStatus === 'draft' ? (
                          <span className="text-xs text-slate-400">-</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle2 className="h-3 w-3 shrink-0" /> {sent} Sent
                            </span>
                            {failed > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                <AlertCircle className="h-3 w-3 shrink-0" /> {failed} Failed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800/60 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                0 Failed
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {cStatus === 'draft' ? (
                          <span className="text-xs text-slate-400">Not Launched</span>
                        ) : (
                          <div className="w-28 space-y-1">
                            <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                              <span>{processed}/{total}</span>
                              <span className={failed > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-bold'}>
                                {percent}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 flex">
                              <div
                                className="h-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${total > 0 ? (sent / total) * 100 : 0}%` }}
                                title={`Sent: ${sent}`}
                              />
                              {failed > 0 && (
                                <div
                                  className="h-full bg-rose-500 transition-all duration-300"
                                  style={{ width: `${total > 0 ? (failed / total) * 100 : 0}%` }}
                                  title={`Failed: ${failed}`}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        <div>
                          <span className="text-slate-400">Created:</span>{' '}
                          {dayjs(c.created_at || c.createdAt).format('DD/MM/YY h:mm A')}
                        </div>
                        {(c.completed_at || c.completedAt || (cStatus === 'completed' && c.updatedAt)) && (
                          <div className="mt-0.5 font-medium text-slate-600 dark:text-slate-400">
                            <span className="text-slate-500 dark:text-slate-400">Completed:</span>{' '}
                            {dayjs(c.completed_at || c.completedAt || c.updatedAt).format('DD/MM/YY h:mm A')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {cStatus === 'paused' && (
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                              disabled={isResuming}
                              onClick={() => onResume(c.id)}
                            >
                              {isResuming && actionId === c.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Play className="mr-1 h-3.5 w-3.5 fill-current" />
                              )}
                              Resume
                            </Button>
                          )}
                          {cStatus === 'running' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs border-orange-300 text-orange-700 hover:bg-orange-50 font-medium"
                              disabled={isPausing}
                              onClick={() => onPause(c.id)}
                            >
                              {isPausing && actionId === c.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Pause className="mr-1 h-3.5 w-3.5" />
                              )}
                              Pause
                            </Button>
                          )}
                          {cStatus !== 'draft' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => onProgress(c.id)}
                            >
                              <Activity className="mr-1 h-3.5 w-3.5" />
                              Progress
                            </Button>
                          )}
                          {Boolean(c.stats?.failed) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium"
                              disabled={isRetrying}
                              onClick={() => onRetryFailed(c.id)}
                            >
                              {isRetrying && actionId === c.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="mr-1 h-3.5 w-3.5 text-rose-600" />
                              )}
                              Retry ({c.stats?.failed})
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => onEdit(c)}
                          >
                            <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    )
  }

  /* CARD VIEW */
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {campaigns.map((c) => {
        const cStatus = (c.status || 'draft').toLowerCase()
        const stats = c.stats || {}
        const total = stats.total || c.recipient_phones?.length || c.contacts?.length || 0
        const sent = stats.sent || 0
        const failed = stats.failed || 0
        const processed = sent + failed
        const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0

        return (
          <Card
            key={c.id}
            className="group overflow-hidden border-slate-200/80 bg-white/60 shadow-lg shadow-slate-900/5 transition-all duration-300 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/60 backdrop-blur-xs"
          >
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="line-clamp-1 text-lg">
                    {c.name || 'Untitled campaign'}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {dayjs(c.created_at || c.createdAt).format('DD/MM/YY h:mm A')}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                      cStatus === 'completed'
                        ? failed > 0
                          ? 'bg-rose-50 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                        : cStatus === 'scheduled'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : cStatus === 'running'
                        ? 'bg-teal-100 text-teal-800 border border-teal-300'
                        : cStatus === 'paused'
                        ? 'bg-orange-100 text-orange-800 border border-orange-300'
                        : cStatus === 'failed'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : 'bg-sky-100 text-sky-800 border border-sky-300'
                    }`}
                  >
                    {cStatus === 'draft' && <Clock className="mr-1 h-3 w-3" />}
                    {cStatus === 'running' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    {cStatus === 'completed' && failed === 0 && <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
                    {cStatus === 'completed' && failed > 0 && <AlertCircle className="mr-1 h-3 w-3 text-rose-600 dark:text-rose-400" />}
                    {cStatus === 'paused' && <Pause className="mr-1 h-3 w-3" />}
                    {cStatus === 'completed' && failed > 0 ? `COMPLETED (${failed} FAILED)` : cStatus.toUpperCase()}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {c.error_message && (cStatus === 'paused' || cStatus === 'failed') && (
                <Link
                  to="/merchant/whatsapp-sessions"
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 cursor-pointer w-full text-left transition-all group"
                  title="Click to redirect to WhatsApp Sessions page"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span className="flex-1 truncate">{safeText(c.error_message)}</span>
                  <span className="text-[11px] font-semibold underline shrink-0 group-hover:text-rose-800 dark:group-hover:text-rose-200">Connect</span>
                </Link>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Recipients:</span>
                <button
                  type="button"
                  onClick={() => onCustomerList(c)}
                  className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                >
                  {total} customers
                </button>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Contents:</span>
                <button
                  type="button"
                  onClick={() => onPreview(c)}
                  className="inline-flex items-center gap-1.5 font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {c.templates?.length || 1} content(s)
                </button>
              </div>

              {cStatus !== 'draft' && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Delivery Stats:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="h-3 w-3 shrink-0" /> {sent} Sent
                    </span>
                    {failed > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        <AlertCircle className="h-3 w-3 shrink-0" /> {failed} Failed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800/60 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        0 Failed
                      </span>
                    )}
                  </div>
                </div>
              )}

              {cStatus !== 'draft' && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span>Progress ({processed}/{total})</span>
                    {failed > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">{failed} failed</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">{percent}%</span>
                    )}
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 flex">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${total > 0 ? (sent / total) * 100 : 0}%` }}
                      title={`Sent: ${sent}`}
                    />
                    {failed > 0 && (
                      <div
                        className="h-full bg-rose-500 transition-all duration-300"
                        style={{ width: `${total > 0 ? (failed / total) * 100 : 0}%` }}
                        title={`Failed: ${failed}`}
                      />
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {cStatus === 'paused' && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={isResuming}
                    onClick={() => onResume(c.id)}
                  >
                    <Play className="mr-1 h-3.5 w-3.5 fill-current" /> Resume
                  </Button>
                )}
                {cStatus === 'running' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                    disabled={isPausing}
                    onClick={() => onPause(c.id)}
                  >
                    <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                  </Button>
                )}
                {cStatus !== 'draft' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => onProgress(c.id)}
                  >
                    <Activity className="mr-1 h-3.5 w-3.5" /> Progress
                  </Button>
                )}
                {Boolean(failed) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium"
                    disabled={isRetrying}
                    onClick={() => onRetryFailed(c.id)}
                  >
                    {isRetrying && actionId === c.id ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1 h-3.5 w-3.5 text-rose-600" />
                    )}
                    Retry ({failed})
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => onEdit(c)}
                >
                  <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
