import React from 'react'
import dayjs from 'dayjs'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function PhoneActiveTooltip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help inline-flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <Info className="w-3 h-3 shrink-0 ml-0.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs p-2.5 bg-slate-900 text-slate-100 shadow-md z-50">
          <p className="font-semibold text-amber-300 flex items-center gap-1 mb-1">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            Phone Sync Activity
          </p>
          <p className="text-slate-200 text-[11px] leading-relaxed">
            Tracks network connection, keep-alives, and protocol sync events with WhatsApp servers.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function LastSentMessageTooltip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help inline-flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <Info className="w-3 h-3 shrink-0 ml-0.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs p-2.5 bg-slate-900 text-slate-100 shadow-md z-50">
          <p className="font-semibold text-amber-300 flex items-center gap-1 mb-1">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            WhatsApp 14-Day Activity Rule
          </p>
          <p className="text-slate-200 text-[11px] leading-relaxed">
            Must send at least 1 message from your phone within 14 days to prevent getting logged out by WhatsApp.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface PhoneActiveIndicatorProps {
  lastPhoneActivityAt?: string | Date | null
  emptyLabel?: string
  className?: string
}

export function PhoneActiveIndicator({ lastPhoneActivityAt, emptyLabel = 'No activity', className = '' }: PhoneActiveIndicatorProps) {
  const now = dayjs()
  
  if (!lastPhoneActivityAt) {
    return (
      <span className={`inline-flex items-center gap-1 whitespace-nowrap px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200/80 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/80 font-mono text-[11px] sm:text-xs font-medium ${className}`}>
        <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
        <span>{emptyLabel}</span>
      </span>
    )
  }

  const activityDate = dayjs(lastPhoneActivityAt)
  const diffDays = now.diff(activityDate, 'day', true)
  const formattedDate = activityDate.format('DD/MM/YY · h:mm A')

  let badgeStyle = 'inline-flex items-center gap-1 whitespace-nowrap text-slate-700 dark:text-slate-300 font-mono font-medium text-[11px] sm:text-xs'
  let IconComponent: React.ComponentType<{ className?: string }> | null = null

  if (diffDays > 10) {
    // Red indicator (> 10 days)
    badgeStyle = 'inline-flex items-center gap-1 whitespace-nowrap px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200/80 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/80 font-mono text-[11px] sm:text-xs font-semibold'
    IconComponent = AlertCircle
  } else if (diffDays > 3) {
    // Yellow / Amber indicator (> 3 days)
    badgeStyle = 'inline-flex items-center gap-1 whitespace-nowrap px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 font-mono text-[11px] sm:text-xs font-semibold'
    IconComponent = AlertTriangle
  }

  return (
    <span className={`${badgeStyle} transition-all ${className}`}>
      {IconComponent && <IconComponent className="w-3 h-3 shrink-0" />}
      <span className="whitespace-nowrap">{formattedDate}</span>
    </span>
  )
}
