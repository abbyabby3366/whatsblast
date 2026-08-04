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
  Play, 
  ArrowRight
} from 'lucide-react'

import { api, getErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

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

interface CrossChatWarmupDialogProps {
  connectedSessionsCount: number
}

export function CrossChatWarmupDialog({ connectedSessionsCount }: CrossChatWarmupDialogProps) {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [timeLeftStr, setTimeLeftStr] = useState<string>('')

  const { data: settingsData } = useQuery({
    queryKey: ['cross-chat-settings'],
    queryFn: () => api.get('cross-chat/settings').json<CrossChatSettingsResponse>(),
    refetchInterval: isOpen ? 2500 : 5000,
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-emerald-300 bg-emerald-50/50 hover:bg-emerald-100/60 text-emerald-700 font-semibold text-xs h-9 px-3 gap-2 shadow-2xs transition-all"
        >
          <Zap className="w-4 h-4 text-emerald-600 animate-pulse" />
          <span>Cross-Chat Warmup</span>
          <Badge 
            variant={isEnabled ? 'default' : 'secondary'}
            className={isEnabled ? 'bg-emerald-600 text-white text-[10px] px-1.5 py-0' : 'bg-slate-200 text-slate-600 text-[10px] px-1.5 py-0'}
          >
            {isEnabled ? 'ACTIVE' : 'OFF'}
          </Badge>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg bg-white p-6 rounded-2xl shadow-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-200">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Auto Session Cross-Chat (Warmup)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Automatically exchanges multi-turn realistic dialogues between connected sessions to build number reputation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Main Toggle Switch Control */}
          <div className="flex items-center justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-800">Warmup Status</span>
              <p className="text-[11px] text-slate-500">
                {isEnabled ? 'Active sessions are scheduled to exchange simulated conversations.' : 'Warmup is disabled.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">
                {isEnabled ? 'ENABLED' : 'DISABLED'}
              </span>
              <Switch
                checked={isEnabled}
                onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                disabled={toggleMutation.isPending}
              />
            </div>
          </div>

          {/* Next Scheduled Message Section */}
          {isEnabled && (
            <div className="bg-gradient-to-br from-emerald-50/50 via-teal-50/20 to-white border border-emerald-200/70 rounded-xl p-4 space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800 border-b border-emerald-100 pb-2">
                <span className="flex items-center gap-1.5 text-emerald-800">
                  <Bot className="h-4 w-4 text-emerald-600" />
                  Next Scheduled Message
                </span>
                {currentDialogue && (
                  <span className="text-[11px] font-mono text-emerald-700 font-bold flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 animate-pulse" />
                    Sends in: {timeLeftStr || 'calculating...'}
                  </span>
                )}
              </div>

              {connectedSessionsCount < 2 ? (
                <div className="flex items-center gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>At least 2 connected WhatsApp sessions are required for cross-chatting.</span>
                </div>
              ) : currentDialogue ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Topic: <strong className="text-slate-900">{currentDialogue.topic}</strong></span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-emerald-300 text-emerald-700 bg-emerald-50">
                      Turn {currentDialogue.current_turn_index + 1} of {currentDialogue.total_turns}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Sender → Recipient</span>
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <span className="text-emerald-700">{currentDialogue.sender_phone}</span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <span className="text-slate-700">{currentDialogue.recipient_phone}</span>
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Message Preview</span>
                      <p className="text-slate-700 italic truncate text-[11px]" title={currentDialogue.next_message_preview}>
                        "{currentDialogue.next_message_preview || 'Generating text...'}"
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      Auto-scheduled
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
                  <span className="text-slate-600">No active dialogue running. Ready to start!</span>
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
      </DialogContent>
    </Dialog>
  )
}
