import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  RotateCcw,
  Loader2,
  ChevronDown,
  Shuffle,
  Smartphone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface RecipientRetryDropdownProps {
  phone: string
  campaignId: string | number
  originalSenderPhone?: string | null
  isPending?: boolean
  onRetry: (payload: { phone: string; sessionId?: string }) => void
  disabled?: boolean
  title?: string
  className?: string
}

export function RecipientRetryDropdown({
  phone,
  originalSenderPhone,
  isPending = false,
  onRetry,
  disabled = false,
  title,
  className,
}: RecipientRetryDropdownProps) {
  const { data: userSessions = [] } = useQuery({
    queryKey: ['whatsapp-sessions'],
    queryFn: () => api.get('whatsapp-sessions/').json<any[]>(),
  })

  const connectedSessions = userSessions.filter(
    (s) => (s.status || '').toUpperCase() === 'CONNECTED'
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending || disabled}
          className={cn(
            'h-7 px-2 text-xs border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-950/40 gap-1 font-medium',
            className
          )}
          title={title || 'Retry sending message'}
        >
          {isPending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              Retrying...
            </>
          ) : (
            <>
              <RotateCcw className="h-3 w-3 shrink-0" />
              Retry
              <ChevronDown className="h-3 w-3 opacity-60 ml-0.5 shrink-0" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto z-50">
        <DropdownMenuLabel className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between">
          <span>Retry Recipient</span>
          <span className="text-[10px] font-normal text-slate-400">
            {connectedSessions.length} connected
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Option 1: Random Connected Phone */}
        <DropdownMenuItem
          onClick={() => onRetry({ phone, sessionId: 'random' })}
          disabled={isPending || connectedSessions.length === 0}
          className="cursor-pointer py-2 gap-2"
        >
          <Shuffle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              Random Connected Phone
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                Auto
              </span>
            </span>
            <span className="text-[10px] text-slate-500">
              {connectedSessions.length > 0
                ? `Assign to 1 of ${connectedSessions.length} connected phone${connectedSessions.length > 1 ? 's' : ''}`
                : 'No active connected phones available'}
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Option 2: Specific Connected Phones */}
        <DropdownMenuLabel className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-2 py-1">
          Connected Phones
        </DropdownMenuLabel>

        {connectedSessions.map((session) => {
          const sId = session.id || session._id || session.session_id
          const displayPhone = session.phone_number || session.session_id
          return (
            <DropdownMenuItem
              key={sId}
              onClick={() => onRetry({ phone, sessionId: sId })}
              disabled={isPending}
              className="cursor-pointer py-1.5 gap-2"
            >
              <Smartphone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {displayPhone}
                  </span>
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-emerald-500 shrink-0"
                    title="Connected"
                  />
                </div>
                {session.alias && (
                  <span className="text-[10px] text-slate-500 truncate">
                    {session.alias}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          )
        })}

        {connectedSessions.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/30 rounded mx-1 mb-1">
            No phones connected. Connect a phone in WhatsApp Sessions.
          </div>
        )}

        {/* Option 3: Keep Original Phone */}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onRetry({ phone, sessionId: 'original' })}
          disabled={isPending}
          className="cursor-pointer py-1.5 gap-2 text-slate-600 dark:text-slate-400"
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <div className="flex flex-col">
            <span className="text-xs font-medium">Keep Original Phone</span>
            {originalSenderPhone ? (
              <span className="font-mono text-[10px] text-slate-400 truncate">
                {originalSenderPhone}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">
                Retry with originally assigned phone
              </span>
            )}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export interface CampaignRetryAllDropdownProps {
  retryableCount?: number
  isPending?: boolean
  onRetryAll: (sessionId?: string) => void
  disabled?: boolean
  className?: string
  buttonText?: string
  size?: 'sm' | 'default'
  variant?: 'default' | 'outline'
}

export function CampaignRetryAllDropdown({
  retryableCount,
  isPending = false,
  onRetryAll,
  disabled = false,
  className,
  buttonText,
  size = 'default',
  variant = 'default',
}: CampaignRetryAllDropdownProps) {
  const { data: userSessions = [] } = useQuery({
    queryKey: ['whatsapp-sessions'],
    queryFn: () => api.get('whatsapp-sessions/').json<any[]>(),
  })

  const connectedSessions = userSessions.filter(
    (s) => (s.status || '').toUpperCase() === 'CONNECTED'
  )

  const defaultText =
    buttonText ||
    (retryableCount !== undefined
      ? `Retry All Failed & Expired (${retryableCount})`
      : 'Retry All Failed & Expired')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant === 'outline' ? 'outline' : 'default'}
          size={size === 'sm' ? 'sm' : 'default'}
          disabled={isPending || disabled || retryableCount === 0}
          className={cn(
            variant === 'outline'
              ? 'text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900/60 dark:text-amber-400 text-xs font-medium gap-1.5'
              : 'bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium shadow-xs gap-1.5',
            size === 'sm' ? 'h-7 px-2.5' : 'h-8 px-3',
            className
          )}
        >
          {isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              Retrying All...
            </>
          ) : (
            <>
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              <span>{defaultText}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-70 shrink-0" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-68 max-h-80 overflow-y-auto z-50">
        <DropdownMenuLabel className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between">
          <span>Retry All Failed {retryableCount !== undefined ? `(${retryableCount})` : ''}</span>
          <span className="text-[10px] font-normal text-slate-400">
            {connectedSessions.length} connected
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Option 1: Distribute among Connected Phones */}
        <DropdownMenuItem
          onClick={() => onRetryAll('random')}
          disabled={isPending || connectedSessions.length === 0}
          className="cursor-pointer py-2 gap-2"
        >
          <Shuffle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              Distribute across Connected Active Phones
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                Auto
              </span>
            </span>
            <span className="text-[10px] text-slate-500">
              {connectedSessions.length > 0
                ? `Distribute evenly among ${connectedSessions.length} active connected phone${connectedSessions.length > 1 ? 's' : ''}`
                : 'No active connected phones available'}
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Option 2: Send all via specific phone */}
        <DropdownMenuLabel className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-2 py-1">
          Send All Via Specific Phone
        </DropdownMenuLabel>

        {connectedSessions.map((session) => {
          const sId = session.id || session._id || session.session_id
          const displayPhone = session.phone_number || session.session_id
          return (
            <DropdownMenuItem
              key={sId}
              onClick={() => onRetryAll(sId)}
              disabled={isPending}
              className="cursor-pointer py-1.5 gap-2"
            >
              <Smartphone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {displayPhone}
                  </span>
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-emerald-500 shrink-0"
                    title="Connected"
                  />
                </div>
                {session.alias && (
                  <span className="text-[10px] text-slate-500 truncate">
                    {session.alias}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          )
        })}

        {connectedSessions.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/30 rounded mx-1 mb-1">
            No phones connected. Connect a phone in WhatsApp Sessions.
          </div>
        )}

        {/* Option 3: Keep Original Phones */}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onRetryAll('original')}
          disabled={isPending}
          className="cursor-pointer py-1.5 gap-2 text-slate-600 dark:text-slate-400"
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <div className="flex flex-col">
            <span className="text-xs font-medium">Keep Original Assigned Phones</span>
            <span className="text-[10px] text-slate-400">
              Preserve each message's original assigned phone
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export interface MessageRowRetryDropdownProps {
  messageId: string
  originalSenderPhone?: string | null
  isPending?: boolean
  onRetry: (payload: { messageId: string; sessionId?: string }) => void
  disabled?: boolean
  title?: string
  className?: string
}

export function MessageRowRetryDropdown({
  messageId,
  originalSenderPhone,
  isPending = false,
  onRetry,
  disabled = false,
  title,
  className,
}: MessageRowRetryDropdownProps) {
  const { data: userSessions = [] } = useQuery({
    queryKey: ['whatsapp-sessions'],
    queryFn: () => api.get('whatsapp-sessions/').json<any[]>(),
  })

  const connectedSessions = userSessions.filter(
    (s) => (s.status || '').toUpperCase() === 'CONNECTED'
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || disabled}
          className={cn(
            'h-8 px-2.5 text-xs gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900/60 dark:text-amber-400 font-medium',
            className
          )}
          title={title || 'Retry sending message'}
        >
          {isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              Retrying...
            </>
          ) : (
            <>
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              Retry
              <ChevronDown className="h-3 w-3 opacity-60 ml-0.5 shrink-0" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto z-50">
        <DropdownMenuLabel className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between">
          <span>Retry Message</span>
          <span className="text-[10px] font-normal text-slate-400">
            {connectedSessions.length} connected
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => onRetry({ messageId, sessionId: 'random' })}
          disabled={isPending || connectedSessions.length === 0}
          className="cursor-pointer py-2 gap-2"
        >
          <Shuffle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              Random Connected Phone
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                Auto
              </span>
            </span>
            <span className="text-[10px] text-slate-500">
              {connectedSessions.length > 0
                ? `Assign to 1 of ${connectedSessions.length} connected phone${connectedSessions.length > 1 ? 's' : ''}`
                : 'No active connected phones available'}
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-2 py-1">
          Connected Phones
        </DropdownMenuLabel>

        {connectedSessions.map((session) => {
          const sId = session.id || session._id || session.session_id
          const displayPhone = session.phone_number || session.session_id
          return (
            <DropdownMenuItem
              key={sId}
              onClick={() => onRetry({ messageId, sessionId: sId })}
              disabled={isPending}
              className="cursor-pointer py-1.5 gap-2"
            >
              <Smartphone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {displayPhone}
                  </span>
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-emerald-500 shrink-0"
                    title="Connected"
                  />
                </div>
                {session.alias && (
                  <span className="text-[10px] text-slate-500 truncate">
                    {session.alias}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          )
        })}

        {connectedSessions.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/30 rounded mx-1 mb-1">
            No phones connected. Connect a phone in WhatsApp Sessions.
          </div>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onRetry({ messageId, sessionId: 'original' })}
          disabled={isPending}
          className="cursor-pointer py-1.5 gap-2 text-slate-600 dark:text-slate-400"
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <div className="flex flex-col">
            <span className="text-xs font-medium">Keep Original Phone</span>
            {originalSenderPhone ? (
              <span className="font-mono text-[10px] text-slate-400 truncate">
                {originalSenderPhone}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">
                Retry with originally assigned phone
              </span>
            )}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
