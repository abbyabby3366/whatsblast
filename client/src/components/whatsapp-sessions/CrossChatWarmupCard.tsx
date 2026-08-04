import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { 
  Zap, 
  Send, 
  Clock, 
  Bot, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Play
} from 'lucide-react'

import { api, getErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'

interface ActiveDialogueStatus {
  dialogue_id: string
  topic: string
  current_turn_index: number
  total_turns: number
  next_turn_at: number
  sender_phone: string
  recipient_phone: string
  next_message_preview: string
}

interface CrossChatSettingsResponse {
  cross_chat_enabled: boolean
  active_dialogues: ActiveDialogueStatus[]
}

interface CrossChatWarmupCardProps {
  connectedSessionsCount: number
}

export function CrossChatWarmupCard({ connectedSessionsCount }: CrossChatWarmupCardProps) {
  const queryClient = useQueryClient()
  const [timeLeftStr, setTimeLeftStr] = useState<string>('')

  const { data: settingsData } = useQuery({
    queryKey: ['cross-chat-settings'],
    queryFn: () => api.get('cross-chat/settings').json<CrossChatSettingsResponse>(),
    refetchInterval: 3000,
  })

  const isEnabled = Boolean(settingsData?.cross_chat_enabled)
  const activeDialogues = settingsData?.active_dialogues || []
  const currentDialogue = activeDialogues[0]

  // Toggle Mutation
  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => api.post('cross-chat/toggle', { json: { enabled } }).json(),
    onSuccess: (data: any) => {
      queryClient.setQueryData(['cross-chat-settings'], data)
      toast.success(data.cross_chat_enabled ? 'Auto Cross-Chat Warmup Enabled' : 'Cross-Chat Warmup Disabled')
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  // Send Now Mutation
  const sendNowMutation = useMutation({
    mutationFn: () => api.post('cross-chat/send-now').json<any>(),
    onSuccess: (res: any) => {
      if (res.success) {
        toast.success(res.message || 'Next message dispatched successfully!')
      } else {
        toast.error(res.message || 'Could not send message')
      }
      queryClient.invalidateQueries({ queryKey: ['cross-chat-settings'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  // Timer Countdown Effect
  useEffect(() => {
    if (!currentDialogue || !currentDialogue.next_turn_at) {
      setTimeLeftStr('')
      return
    }

    const interval = setInterval(() => {
      const now = Date.now()
      const diffMs = currentDialogue.next_turn_at - now

      if (diffMs <= 0) {
        setTimeLeftStr('Sending now...')
      } else {
        const seconds = Math.ceil(diffMs / 1000)
        if (seconds < 60) {
          setTimeLeftStr(`${seconds}s`)
        } else {
          const mins = Math.floor(seconds / 60)
          const remSecs = seconds % 60
          setTimeLeftStr(`${mins}m ${remSecs}s`)
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [currentDialogue])

  return (
    <div className="bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-slate-50 border border-emerald-200/80 rounded-xl p-5 shadow-sm space-y-4 mb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-200">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 text-base">Auto Session Cross-Chat (Warmup)</h3>
              <Badge 
                variant={isEnabled ? 'default' : 'secondary'}
                className={isEnabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-200 text-slate-700'}
              >
                {isEnabled ? 'ACTIVE' : 'DISABLED'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Automatically exchanges multi-turn realistic dialogues between connected sessions to build number reputation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center">
          <span className="text-xs font-medium text-slate-600">
            {isEnabled ? 'Warmup Enabled' : 'Warmup Off'}
          </span>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => toggleMutation.mutate(checked)}
            disabled={toggleMutation.isPending}
          />
        </div>
      </div>

      {/* Next Scheduled Message Panel */}
      {isEnabled && (
        <div className="bg-white border border-emerald-100 rounded-lg p-4 shadow-2xs">
          {connectedSessionsCount < 2 ? (
            <div className="flex items-center gap-2.5 text-amber-700 bg-amber-50 border border-amber-200/60 rounded-md p-3 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                At least <strong>2 connected WhatsApp sessions</strong> are required for automated cross-chatting. (Currently connected: {connectedSessionsCount}).
              </span>
            </div>
          ) : currentDialogue ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <Bot className="h-4 w-4 text-emerald-600" />
                  <span>Topic: <strong className="text-slate-900">{currentDialogue.topic}</strong></span>
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-emerald-300 text-emerald-700 bg-emerald-50">
                    Turn {currentDialogue.current_turn_index + 1} of {currentDialogue.total_turns}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500 font-mono">
                  <Clock className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                  <span>Next send in: <strong className="text-emerald-700 font-bold">{timeLeftStr || 'calculating...'}</strong></span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-md border border-slate-200/60 space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Sender → Recipient</span>
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <span className="text-emerald-700">{currentDialogue.sender_phone}</span>
                    <span className="text-slate-400">→</span>
                    <span className="text-slate-700">{currentDialogue.recipient_phone}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-md border border-slate-200/60 space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Next Message Preview</span>
                  <p className="text-slate-700 italic truncate" title={currentDialogue.next_message_preview}>
                    "{currentDialogue.next_message_preview || 'Generating text...'}"
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  Scheduled automatically by cross-chat runner
                </span>
                <Button
                  size="sm"
                  variant="default"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-8 px-3 shadow-xs"
                  onClick={() => sendNowMutation.mutate()}
                  disabled={sendNowMutation.isPending}
                >
                  {sendNowMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Send Now
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs py-1">
              <div className="flex items-center gap-2 text-slate-600">
                <Clock className="h-4 w-4 text-emerald-600" />
                <span>Next dialogue scheduled soon across your active sessions.</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1 text-xs h-8"
                onClick={() => sendNowMutation.mutate()}
                disabled={sendNowMutation.isPending}
              >
                {sendNowMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Start Dialogue Now
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
