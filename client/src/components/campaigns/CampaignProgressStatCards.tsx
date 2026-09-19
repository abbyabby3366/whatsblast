import React from 'react'

interface CampaignProgressStatCardsProps {
  total: number
  sent: number
  failed: number
  expired: number
  processed: number
  percent: number
  retryableCount: number
}

export const CampaignProgressStatCards: React.FC<CampaignProgressStatCardsProps> = ({
  total,
  sent,
  failed,
  expired,
  processed,
  percent,
  retryableCount,
}) => {
  return (
    <div className="space-y-4">
      {/* Blast Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm font-medium">
          <span className="text-slate-700 dark:text-slate-300">Blast Progress</span>
          <div className="flex items-center gap-2">
            {retryableCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-semibold text-xs bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900/50">
                {failed > 0 && expired > 0
                  ? `${failed} Failed, ${expired} Expired`
                  : failed > 0
                  ? `${failed} Failed`
                  : `${expired} Expired`}
              </span>
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

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center dark:border-slate-800 dark:bg-slate-900/50">
          <p className="text-xs font-medium text-slate-500">Total Recipients</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{total}</p>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Successful (Sent)</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{sent}</p>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400">Failed / Expired</p>
          <p className="mt-2 text-2xl font-bold text-rose-700 dark:text-rose-400">{failed + expired}</p>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Remaining (Pending)</p>
          <p className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-400">
            {Math.max(0, total - (sent + failed + expired))}
          </p>
        </div>
      </div>
    </div>
  )
}
