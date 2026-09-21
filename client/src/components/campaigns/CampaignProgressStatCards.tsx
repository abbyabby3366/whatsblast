import React from 'react'

export type CampaignStatusFilter = 'all' | 'sent' | 'failed' | 'pending'

interface CampaignProgressStatCardsProps {
  total: number
  sent: number
  failed: number
  expired: number
  processed: number
  percent: number
  retryableCount: number
  activeFilter?: CampaignStatusFilter
  onSelectFilter?: (filter: CampaignStatusFilter) => void
}

export const CampaignProgressStatCards: React.FC<CampaignProgressStatCardsProps> = ({
  total,
  sent,
  failed,
  expired,
  processed,
  percent,
  retryableCount,
  activeFilter,
  onSelectFilter,
}) => {
  return (
    <div className="space-y-4">
      {/* Blast Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm font-medium">
          <span className="text-slate-700 dark:text-slate-300">Blast Progress</span>
          <div className="flex items-center gap-2">
            {retryableCount > 0 && (
              <button
                type="button"
                onClick={() => onSelectFilter?.('failed')}
                className="text-amber-600 dark:text-amber-400 font-semibold text-xs bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900/50 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer transition-colors"
                title="Click to filter table to failed/expired contacts"
              >
                {failed > 0 && expired > 0
                  ? `${failed} Failed, ${expired} Expired`
                  : failed > 0
                  ? `${failed} Failed`
                  : `${expired} Expired`}
              </button>
            )}
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              {percent}% ({processed}/{total})
            </span>
          </div>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 flex">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
            style={{ width: `${total > 0 ? (sent / total) * 100 : 0}%` }}
            title={`Success / Sent: ${sent}`}
          />
          {retryableCount > 0 && (
            <div
              className="h-full bg-amber-500 transition-all duration-500"
              style={{ width: `${total > 0 ? (retryableCount / total) * 100 : 0}%` }}
              title={`Failed/Expired: ${retryableCount}`}
            />
          )}
        </div>
      </div>

      {/* Metrics Grid (Clickable Filters) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => onSelectFilter?.('all')}
          className={`flex flex-col justify-between rounded-xl border p-4 text-center transition-all ${
            onSelectFilter ? 'cursor-pointer hover:shadow-xs' : ''
          } ${
            activeFilter === 'all'
              ? 'border-slate-400 ring-2 ring-slate-400/50 bg-white dark:bg-slate-800'
              : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700'
          }`}
          title="Click to view all recipients"
        >
          <p className="text-xs font-medium text-slate-500">Total Recipients</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{total}</p>
        </button>

        <button
          type="button"
          onClick={() => onSelectFilter?.('sent')}
          className={`flex flex-col justify-between rounded-xl border p-4 text-center transition-all ${
            onSelectFilter ? 'cursor-pointer hover:shadow-xs' : ''
          } ${
            activeFilter === 'sent'
              ? 'border-emerald-500 ring-2 ring-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/40'
              : 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-300 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:hover:border-emerald-800'
          }`}
          title="Click to view successful sent recipients"
        >
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Successful (Sent)</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{sent}</p>
        </button>

        <button
          type="button"
          onClick={() => onSelectFilter?.('failed')}
          className={`flex flex-col justify-between rounded-xl border p-4 text-center transition-all ${
            onSelectFilter ? 'cursor-pointer hover:shadow-xs' : ''
          } ${
            activeFilter === 'failed'
              ? 'border-rose-500 ring-2 ring-rose-500/50 bg-rose-50 dark:bg-rose-950/40'
              : 'border-rose-200 bg-rose-50/50 hover:border-rose-300 dark:border-rose-900/40 dark:bg-rose-950/20 dark:hover:border-rose-800'
          }`}
          title="Click to view failed & expired recipients"
        >
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400">Failed / Expired</p>
          <p className="mt-2 text-2xl font-bold text-rose-700 dark:text-rose-400">{failed + expired}</p>
        </button>

        <button
          type="button"
          onClick={() => onSelectFilter?.('pending')}
          className={`flex flex-col justify-between rounded-xl border p-4 text-center transition-all ${
            onSelectFilter ? 'cursor-pointer hover:shadow-xs' : ''
          } ${
            activeFilter === 'pending'
              ? 'border-amber-500 ring-2 ring-amber-500/50 bg-amber-50 dark:bg-amber-950/40'
              : 'border-amber-200 bg-amber-50/50 hover:border-amber-300 dark:border-amber-900/40 dark:bg-amber-950/20 dark:hover:border-amber-800'
          }`}
          title="Click to view remaining pending recipients"
        >
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Remaining (Pending)</p>
          <p className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-400">
            {Math.max(0, total - (sent + failed + expired))}
          </p>
        </button>
      </div>
    </div>
  )
}
