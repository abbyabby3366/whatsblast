import { useState } from 'react'
import { Activity, Loader2, RotateCcw, Search, Users, X } from 'lucide-react'
import dayjs from 'dayjs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

import { api, getErrorMessage } from '@/lib/api'
import { safeText, isSamePhone } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface CustomerListModalProps {
  campaign: any | null
  onClose: () => void
  invalidateQueryKey?: string[]
}

export function CustomerListModal({ campaign, onClose, invalidateQueryKey = ['campaigns'] }: CustomerListModalProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerStatusFilter, setCustomerStatusFilter] = useState<'ALL' | 'SENT' | 'FAILED' | 'PENDING'>('ALL')

  const { data: customerLogsData, isLoading: isLoadingCustomerLogs } = useQuery({
    queryKey: ['customer-list-logs', campaign?.id],
    queryFn: () =>
      api
        .get('messages/', {
          searchParams: { campaign_id: campaign.id, page_size: '1000' },
        })
        .json<any>(),
    enabled: Boolean(campaign?.id),
  })

  const retryFailedMutation = useMutation({
    mutationFn: (id: string | number) => api.post(`blast-campaigns/${id}/retry-failed/`).json<any>(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: invalidateQueryKey })
      queryClient.invalidateQueries({ queryKey: ['customer-list-logs', campaign?.id] })
      if (customerStatusFilter === 'FAILED') {
        setCustomerStatusFilter('PENDING')
      }
      const msg = data?.message || 'Retrying failed campaign messages...'
      if (data?.warning) {
        toast.warning(msg, { duration: 6000 })
      } else {
        toast.success(msg)
      }
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to retry campaign.'))
    },
  })

  const retryRecipientMutation = useMutation({
    mutationFn: ({ cId, phone }: { cId: string | number; phone: string }) =>
      api.post(`blast-campaigns/${cId}/retry-recipient/`, { json: { phone } }).json<any>(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: invalidateQueryKey })
      queryClient.invalidateQueries({ queryKey: ['customer-list-logs', campaign?.id] })
      if (customerStatusFilter === 'FAILED') {
        setCustomerStatusFilter('PENDING')
      }
      const msg = data?.message || 'Message retried successfully!'
      if (data?.warning) {
        toast.warning(msg, { duration: 6000 })
      } else {
        toast.success(msg)
      }
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to retry message.'))
    },
  })

  const recipientPhones: string[] =
    campaign?.recipient_phones ||
    campaign?.contacts?.map((c: any) => (typeof c === 'string' ? c : c.phone || c.recipient_phone || c.name || c)) ||
    []

  const logs: any[] = customerLogsData?.results || []

  const customerRows =
    recipientPhones.length > 0
      ? recipientPhones.map((phone, idx) => {
          const matchedLog = logs.find(
            (l) =>
              isSamePhone(phone, l.recipient_phone) ||
              isSamePhone(phone, l.to_jid)
          )

          if (matchedLog) {
            return {
              phone,
              status: (matchedLog.status || 'sent').toLowerCase(),
              time: matchedLog.created_at || matchedLog.wa_timestamp || matchedLog.createdAt,
              error: matchedLog.error ? safeText(matchedLog.error) : null,
              message: safeText(matchedLog.content?.text || matchedLog.content, 'Template message sent'),
              retryCount: matchedLog.retry_count || matchedLog.retryCount || 0,
            }
          }

          if (idx < (campaign?.current_index || 0)) {
            return {
              phone,
              status: 'failed',
              time: null,
              error: 'Send failed during execution',
              message: 'Template message failed',
              retryCount: 0,
            }
          }

          return {
            phone,
            status: 'pending',
            time: null,
            error: null,
            message: 'Scheduled in queue',
            retryCount: 0,
          }
        })
      : logs.map((l) => ({
          phone: l.recipient_phone || l.to_jid || 'Recipient',
          status: (l.status || 'sent').toLowerCase(),
          time: l.created_at || l.wa_timestamp,
          error: l.error ? safeText(l.error) : null,
          message: safeText(l.content?.text || l.content, 'Message'),
          retryCount: l.retry_count || l.retryCount || 0,
        }))

  const sentCount = customerRows.filter((r) => r.status === 'sent' || r.status === 'delivered' || r.status === 'read').length
  const failedCount = customerRows.filter((r) => r.status === 'failed' || r.status === 'error').length
  const pendingCount = customerRows.filter((r) => r.status === 'pending' || r.status === 'queued').length

  const filteredCustomerRows = customerRows.filter((row) => {
    const matchesSearch = !customerSearch || row.phone.toLowerCase().includes(customerSearch.toLowerCase())
    let matchesStatus = true
    if (customerStatusFilter === 'SENT') {
      matchesStatus = row.status === 'sent' || row.status === 'delivered' || row.status === 'read'
    } else if (customerStatusFilter === 'FAILED') {
      matchesStatus = row.status === 'failed' || row.status === 'error'
    } else if (customerStatusFilter === 'PENDING') {
      matchesStatus = row.status === 'pending' || row.status === 'queued'
    }
    return matchesSearch && matchesStatus
  })

  return (
    <Dialog
      open={Boolean(campaign)}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          setCustomerSearch('')
          setCustomerStatusFilter('ALL')
        }
      }}
    >
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Customer List
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  {campaign?.name} &bull; {customerRows.length} total customer(s)
                </DialogDescription>
              </div>
            </div>

            {failedCount > 0 && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-8 px-3 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium shadow-xs gap-1.5"
                disabled={retryFailedMutation.isPending}
                onClick={() => campaign && retryFailedMutation.mutate(campaign.id)}
              >
                {retryFailedMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Retrying All...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry All Failed ({failedCount})
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Sent: {sentCount}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
              Failed: {failedCount}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              Pending: {pendingCount}
            </span>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search customer phone number..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
            {customerSearch && (
              <button
                type="button"
                onClick={() => setCustomerSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900 text-xs">
            <button
              type="button"
              onClick={() => setCustomerStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                customerStatusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              All ({customerRows.length})
            </button>
            <button
              type="button"
              onClick={() => setCustomerStatusFilter('SENT')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                customerStatusFilter === 'SENT'
                  ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              Sent ({sentCount})
            </button>
            <button
              type="button"
              onClick={() => setCustomerStatusFilter('FAILED')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                customerStatusFilter === 'FAILED'
                  ? 'bg-white text-rose-700 shadow-xs dark:bg-slate-800 dark:text-rose-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              Failed ({failedCount})
            </button>
            <button
              type="button"
              onClick={() => setCustomerStatusFilter('PENDING')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                customerStatusFilter === 'PENDING'
                  ? 'bg-white text-amber-700 shadow-xs dark:bg-slate-800 dark:text-amber-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              Pending ({pendingCount})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[250px] border border-slate-200 rounded-lg dark:border-slate-800 my-2">
          {isLoadingCustomerLogs ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
            </div>
          ) : filteredCustomerRows.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">No matching customers found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 dark:bg-slate-900/60 text-xs">
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Customer Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Info / Details</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomerRows.map((row, idx) => {
                  const isFailed = row.status === 'failed' || row.status === 'error'
                  const isSent = row.status === 'sent' || row.status === 'delivered' || row.status === 'read'

                  return (
                    <TableRow key={`${row.phone}-${idx}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 text-xs">
                      <TableCell className="font-mono text-slate-400">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-emerald-600 dark:text-emerald-400">{row.phone}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            isSent
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : isFailed
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {row.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-500 whitespace-nowrap">
                        {row.time ? dayjs(row.time).format('DD/MM/YY h:mm A') : '-'}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title={safeText(row.error || row.message)}>
                        {row.error ? (
                          <span className="text-rose-600 dark:text-rose-400 font-medium">{safeText(row.error)}</span>
                        ) : (
                          <span>{safeText(row.message)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center justify-center text-center w-full min-w-[100px] mx-auto min-h-[42px] gap-1">
                          {!isSent && (
                            <Button
                              type="button"
                              variant={isFailed ? 'destructive' : 'outline'}
                              size="sm"
                              className={`h-7 px-2.5 text-xs font-medium gap-1 ${
                                isFailed ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900 border-slate-200'
                              }`}
                              disabled={retryRecipientMutation.isPending}
                              onClick={() => campaign && retryRecipientMutation.mutate({ cId: campaign.id, phone: row.phone })}
                              title="Retry message for this customer"
                            >
                              {retryRecipientMutation.isPending && retryRecipientMutation.variables.phone === row.phone ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                                  Retrying...
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="h-3 w-3 shrink-0" />
                                  Retry
                                </>
                              )}
                            </Button>
                          )}
                          {Boolean(row.retryCount) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/60 leading-none whitespace-nowrap">
                              <RotateCcw className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                              Retried {row.retryCount} time{row.retryCount > 1 ? 's' : ''}
                            </span>
                          )}
                          {isSent && !row.retryCount && <span className="text-xs text-slate-400 font-normal block text-center">-</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
            onClick={() => {
              if (campaign) {
                const id = campaign.id
                onClose()
                navigate({ to: '/merchant/campaigns/progress', search: { id } })
              }
            }}
          >
            <Activity className="mr-1.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            View Full Progress Page
          </Button>

          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
