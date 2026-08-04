import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { 
  Send, 
  Clock, 
  Bot, 
  AlertCircle, 
  Loader2, 
  ArrowLeft,
  RefreshCw,
  Smartphone,
  Sliders,
  Save,
  BarChart3,
  RotateCcw
} from 'lucide-react'

import { api, getErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableHead, 
  TableRow, 
  TableCell 
} from '@/components/ui/table'

export const Route = createFileRoute('/merchant/cross-chat')({
  component: CrossChatPage,
})

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
  cross_chat_min_delay_sec: number
  cross_chat_max_delay_sec: number
  cross_chat_cooldown_min: number
  cross_chat_min_cooldown_min: number
  cross_chat_max_cooldown_min: number
  cross_chat_max_daily_messages: number
  cross_chat_turns_per_dialogue: number
  cross_chat_min_turns: number
  cross_chat_max_turns: number
  cross_chat_min_msgs_per_turn: number
  cross_chat_max_msgs_per_turn: number
  cross_chat_active_start_time?: string
  cross_chat_active_end_time?: string
  next_scheduled_at?: number
  total_messages_today?: number
  session_daily_counts?: Record<string, number>
  active_dialogues: ActiveDialogueStatus[]
}

function isTimeInWindow(startTime = '08:00', endTime = '22:00', date = new Date()): boolean {
  const [startHour, startMin] = (startTime || '08:00').split(':').map(Number)
  const [endHour, endMin] = (endTime || '22:00').split(':').map(Number)

  const curMinutes = date.getHours() * 60 + date.getMinutes()
  const startMinutes = (startHour || 0) * 60 + (startMin || 0)
  const endMinutes = (endHour || 0) * 60 + (endMin || 0)

  if (startMinutes <= endMinutes) {
    return curMinutes >= startMinutes && curMinutes <= endMinutes
  } else {
    return curMinutes >= startMinutes || curMinutes <= endMinutes
  }
}

const DEFAULT_CROSS_CHAT_CONFIGS = {
  cross_chat_min_delay_sec: 25,
  cross_chat_max_delay_sec: 300,
  cross_chat_min_cooldown_min: 5,
  cross_chat_max_cooldown_min: 720,
  cross_chat_min_turns: 3,
  cross_chat_max_turns: 5,
  cross_chat_min_msgs_per_turn: 1,
  cross_chat_max_msgs_per_turn: 4,
  cross_chat_max_daily_messages: 50,
  cross_chat_active_start_time: '08:00',
  cross_chat_active_end_time: '22:00',
}

function CrossChatPage() {
  const queryClient = useQueryClient()
  const [nowTs, setNowTs] = useState<number>(Date.now())

  // Form State - All Intervals & Active Window
  const [minDelay, setMinDelay] = useState<number | string>(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_min_delay_sec)
  const [maxDelay, setMaxDelay] = useState<number | string>(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_max_delay_sec)
  const [minCooldown, setMinCooldown] = useState<number | string>(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_min_cooldown_min)
  const [maxCooldown, setMaxCooldown] = useState<number | string>(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_max_cooldown_min)
  const [minTurns, setMinTurns] = useState<number | string>(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_min_turns)
  const [maxTurns, setMaxTurns] = useState<number | string>(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_max_turns)
  const [minMsgsPerTurn, setMinMsgsPerTurn] = useState<number | string>(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_min_msgs_per_turn)
  const [maxMsgsPerTurn, setMaxMsgsPerTurn] = useState<number | string>(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_max_msgs_per_turn)
  const [maxDaily, setMaxDaily] = useState<number | string>(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_max_daily_messages)
  const [activeStartTime, setActiveStartTime] = useState<string>(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_active_start_time)
  const [activeEndTime, setActiveEndTime] = useState<string>(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_active_end_time)

  // Fetch connected sessions count
  const { data: sessionsResponse } = useQuery({
    queryKey: ['whatsapp-sessions'],
    queryFn: () => api.get('whatsapp-sessions/').json<any>(),
  })
  const sessions = Array.isArray(sessionsResponse) ? sessionsResponse : sessionsResponse?.results || []
  const connectedSessions = useMemo(() => {
    return sessions.filter((s: any) => (s.status || '').toLowerCase() === 'connected')
  }, [sessions])
  const connectedCount = connectedSessions.length

  // Calculate unique session pairing links: N*(N-1)/2
  const sessionLinks = useMemo(() => {
    const links: { sessionA: any; sessionB: any; id: string }[] = []
    for (let i = 0; i < connectedSessions.length; i++) {
      for (let j = i + 1; j < connectedSessions.length; j++) {
        links.push({
          sessionA: connectedSessions[i],
          sessionB: connectedSessions[j],
          id: `${connectedSessions[i].session_id}_${connectedSessions[j].session_id}`
        })
      }
    }
    return links
  }, [connectedSessions])

  // Fetch cross-chat settings & next message info
  const { data: settingsData, refetch } = useQuery({
    queryKey: ['cross-chat-settings'],
    queryFn: () => api.get('cross-chat/settings').json<CrossChatSettingsResponse>(),
    refetchInterval: 3000,
  })

  // Sync initial settings into form state
  useEffect(() => {
    if (settingsData) {
      if (settingsData.cross_chat_min_delay_sec !== undefined) setMinDelay(settingsData.cross_chat_min_delay_sec)
      if (settingsData.cross_chat_max_delay_sec !== undefined) setMaxDelay(settingsData.cross_chat_max_delay_sec)
      if (settingsData.cross_chat_min_cooldown_min !== undefined) setMinCooldown(settingsData.cross_chat_min_cooldown_min)
      if (settingsData.cross_chat_max_cooldown_min !== undefined) setMaxCooldown(settingsData.cross_chat_max_cooldown_min)
      if (settingsData.cross_chat_min_turns !== undefined) setMinTurns(settingsData.cross_chat_min_turns)
      if (settingsData.cross_chat_max_turns !== undefined) setMaxTurns(settingsData.cross_chat_max_turns)
      if (settingsData.cross_chat_min_msgs_per_turn !== undefined) setMinMsgsPerTurn(settingsData.cross_chat_min_msgs_per_turn)
      if (settingsData.cross_chat_max_msgs_per_turn !== undefined) setMaxMsgsPerTurn(settingsData.cross_chat_max_msgs_per_turn)
      if (settingsData.cross_chat_max_daily_messages !== undefined) setMaxDaily(settingsData.cross_chat_max_daily_messages)
      if (settingsData.cross_chat_active_start_time !== undefined) setActiveStartTime(settingsData.cross_chat_active_start_time)
      if (settingsData.cross_chat_active_end_time !== undefined) setActiveEndTime(settingsData.cross_chat_active_end_time)
    }
  }, [settingsData])

  const isEnabled = Boolean(settingsData?.cross_chat_enabled)
  const activeDialogues = settingsData?.active_dialogues || []
  const currentDialogue = activeDialogues[0]
  const globalNextScheduledAt = settingsData?.next_scheduled_at || (Date.now() + 10000)
  const totalMessagesToday = settingsData?.total_messages_today || 0
  const sessionDailyCounts = settingsData?.session_daily_counts || {}

  const isWindowActive = useMemo(() => {
    return isTimeInWindow(activeStartTime, activeEndTime, new Date(nowTs))
  }, [activeStartTime, activeEndTime, nowTs])

  // Compute if form has unsaved configuration changes
  const isDirty = useMemo(() => {
    if (!settingsData) return false
    return (
      Number(minDelay) !== settingsData.cross_chat_min_delay_sec ||
      Number(maxDelay) !== settingsData.cross_chat_max_delay_sec ||
      Number(minCooldown) !== settingsData.cross_chat_min_cooldown_min ||
      Number(maxCooldown) !== settingsData.cross_chat_max_cooldown_min ||
      Number(minTurns) !== settingsData.cross_chat_min_turns ||
      Number(maxTurns) !== settingsData.cross_chat_max_turns ||
      Number(minMsgsPerTurn) !== settingsData.cross_chat_min_msgs_per_turn ||
      Number(maxMsgsPerTurn) !== settingsData.cross_chat_max_msgs_per_turn ||
      Number(maxDaily) !== settingsData.cross_chat_max_daily_messages ||
      activeStartTime !== (settingsData.cross_chat_active_start_time || '08:00') ||
      activeEndTime !== (settingsData.cross_chat_active_end_time || '22:00')
    )
  }, [
    settingsData,
    minDelay,
    maxDelay,
    minCooldown,
    maxCooldown,
    minTurns,
    maxTurns,
    minMsgsPerTurn,
    maxMsgsPerTurn,
    maxDaily,
    activeStartTime,
    activeEndTime,
  ])

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

  // Save Config Mutation
  const saveConfigMutation = useMutation({
    mutationFn: () => api.post('cross-chat/config', {
      json: {
        cross_chat_min_delay_sec: Number(minDelay),
        cross_chat_max_delay_sec: Number(maxDelay),
        cross_chat_min_cooldown_min: Number(minCooldown),
        cross_chat_max_cooldown_min: Number(maxCooldown),
        cross_chat_min_turns: Number(minTurns),
        cross_chat_max_turns: Number(maxTurns),
        cross_chat_min_msgs_per_turn: Number(minMsgsPerTurn),
        cross_chat_max_msgs_per_turn: Number(maxMsgsPerTurn),
        cross_chat_max_daily_messages: Number(maxDaily),
        cross_chat_active_start_time: activeStartTime,
        cross_chat_active_end_time: activeEndTime,
      }
    }).json<any>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cross-chat-settings'] })
      toast.success('Cross-Chat Configurations Saved Successfully!')
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  // Reset to Default handler
  const handleResetToDefault = () => {
    setMinDelay(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_min_delay_sec)
    setMaxDelay(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_max_delay_sec)
    setMinCooldown(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_min_cooldown_min)
    setMaxCooldown(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_max_cooldown_min)
    setMinTurns(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_min_turns)
    setMaxTurns(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_max_turns)
    setMinMsgsPerTurn(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_min_msgs_per_turn)
    setMaxMsgsPerTurn(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_max_msgs_per_turn)
    setMaxDaily(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_max_daily_messages)
    setActiveStartTime(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_active_start_time)
    setActiveEndTime(DEFAULT_CROSS_CHAT_CONFIGS.cross_chat_active_end_time)
    toast.info('Reset configurations to default values. Click Save Configurations to persist.')
  }

  // Send Now Mutation (targeted per pair or global)
  const sendNowMutation = useMutation({
    mutationFn: (pair?: { session_a_id?: string; session_b_id?: string }) => 
      api.post('cross-chat/send-now', { json: pair || {} }).json<any>(),
    onSuccess: (res: any) => {
      if (res.success) {
        toast.success(res.message || 'Message dispatched successfully!')
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

  // Smooth 1s Clock Ticker for countdowns
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTs(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Helper to format remaining countdown string
  const getTimeLeftStr = (targetTs?: number) => {
    if (!targetTs) return ''
    const diffMs = targetTs - nowTs
    if (diffMs <= 0) return 'Sending now...'
    const seconds = Math.ceil(diffMs / 1000)
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const remSecs = seconds % 60
    return `${mins}m ${remSecs}s`
  }

  // Helper to format exact clock time (e.g., 11:48:25 PM)
  const formatClockTime = (ts?: number) => {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="space-y-6 w-full pb-12 pt-2 select-text">
      {/* Top Header & Master Enable Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 gap-4">
        <div className="flex items-center gap-3">
          <Link to="/merchant/whatsapp-sessions">
            <Button variant="outline" size="sm" className="h-9 px-3 text-xs gap-1.5 border-slate-300">
              <ArrowLeft className="w-4 h-4" /> Back to Sessions
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Cross-Chat Session Warmup
              <Badge variant={isEnabled ? 'default' : 'secondary'} className={isEnabled ? 'bg-emerald-600' : 'bg-slate-300 text-slate-700'}>
                {isEnabled ? 'ACTIVE' : 'DISABLED'}
              </Badge>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Automated multi-turn chat sessions between connected WhatsApp accounts to build phone reputation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center">
          <div className="flex items-center gap-2.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {isEnabled ? 'ENABLED' : 'DISABLED'}
            </span>
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) => toggleMutation.mutate(checked)}
              disabled={toggleMutation.isPending}
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="h-9 px-3 text-xs gap-1.5 text-slate-600"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Main Settings & Controls Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">

        {/* Active Participating Sessions Summary Banner */}
        <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-900 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Active Participating Sessions
                </h3>
                {!isWindowActive ? (
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 text-[11px] font-semibold px-2.5 py-0.5">
                    PAUSED ({activeStartTime} - {activeEndTime})
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800 text-[11px] font-semibold px-2.5 py-0.5">
                    RUNNING ({activeStartTime} - {activeEndTime})
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connected WhatsApp accounts participating in automatic cross-chat pairing.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto shrink-0">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-center shadow-2xs">
              <div className="text-[10px] uppercase font-bold text-slate-400">Connected Pool</div>
              <div className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                {connectedCount} Sessions ({sessionLinks.length} Pairs)
              </div>
            </div>

            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-1.5 text-center shadow-2xs">
              <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1">
                <BarChart3 className="w-3 h-3 text-emerald-600" />
                Sent Today
              </div>
              <div className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 font-mono">
                {totalMessagesToday} Messages
              </div>
            </div>
          </div>
        </div>

        {/* Configurations Form Panel */}
        <div className="bg-slate-50/50 dark:bg-slate-950/40 rounded-xl border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-600" />
              Warmup Configuration Intervals
            </h3>

            <div className="flex items-center gap-2.5">
              {isDirty && (
                <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-800 dark:text-amber-300 text-xs font-semibold gap-1.5 px-2.5 py-1 animate-pulse">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  Unsaved Configurations
                </Badge>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleResetToDefault}
                className="h-8 px-3 text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Default
              </Button>

              <Button
                size="sm"
                onClick={() => saveConfigMutation.mutate()}
                disabled={saveConfigMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-8 px-3 gap-1.5 shadow-2xs"
              >
                {saveConfigMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Configurations
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* 1. Chat Session Cooldown Interval */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Chat Session Cooldown Interval (Minutes)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={minCooldown}
                  onChange={(e) => setMinCooldown(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Min"
                  className="h-9 text-xs bg-white dark:bg-slate-900"
                />
                <span className="text-slate-400 font-semibold text-xs">to</span>
                <Input
                  type="number"
                  min={2}
                  max={1440}
                  value={maxCooldown}
                  onChange={(e) => setMaxCooldown(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Max"
                  className="h-9 text-xs bg-white dark:bg-slate-900"
                />
              </div>
              <p className="text-[11px] text-slate-400">Randomized pause range between starting new chat sessions (e.g. 5 to 15 mins).</p>
            </div>

            {/* 2. Turns Per Chat Session Interval */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Turns Per Chat Session Interval
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={minTurns}
                  onChange={(e) => setMinTurns(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Min"
                  className="h-9 text-xs bg-white dark:bg-slate-900"
                />
                <span className="text-slate-400 font-semibold text-xs">to</span>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={maxTurns}
                  onChange={(e) => setMaxTurns(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Max"
                  className="h-9 text-xs bg-white dark:bg-slate-900"
                />
              </div>
              <p className="text-[11px] text-slate-400">Randomized turns count range exchanged per chat session (e.g. 3 to 5 turns).</p>
            </div>

            {/* 3. Delay Between Message Turns (Seconds) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Delay Between Message Turns (Seconds)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={1200}
                  value={minDelay}
                  onChange={(e) => setMinDelay(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Min"
                  className="h-9 text-xs bg-white dark:bg-slate-900"
                />
                <span className="text-slate-400 font-semibold text-xs">to</span>
                <Input
                  type="number"
                  min={1}
                  max={1200}
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Max"
                  className="h-9 text-xs bg-white dark:bg-slate-900"
                />
              </div>
              <p className="text-[11px] text-slate-400">Randomized delay range between back-and-forth replies (e.g. 12 to 25s).</p>
            </div>

            {/* 4. Messages Per Turn Interval */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Messages Per Turn Interval (Text Bubbles Per Turn)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={minMsgsPerTurn}
                  onChange={(e) => setMinMsgsPerTurn(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Min"
                  className="h-9 text-xs bg-white dark:bg-slate-900"
                />
                <span className="text-slate-400 font-semibold text-xs">to</span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={maxMsgsPerTurn}
                  onChange={(e) => setMaxMsgsPerTurn(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Max"
                  className="h-9 text-xs bg-white dark:bg-slate-900"
                />
              </div>
              <p className="text-[11px] text-slate-400">Randomized text bubbles sent consecutively per turn (e.g. 1 to 2 messages).</p>
            </div>

            {/* 5. Max Daily Limit */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Max Daily Warmup Messages / Session
              </Label>
              <Input
                type="number"
                min={5}
                max={500}
                value={maxDaily}
                onChange={(e) => setMaxDaily(e.target.value === '' ? '' : Number(e.target.value))}
                className="h-9 text-xs bg-white dark:bg-slate-900"
              />
              <p className="text-[11px] text-slate-400">Max warmup messages allowed per session per day.</p>
            </div>

            {/* 6. Active Sending Time Window */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Active Sending Time Window (24h)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={activeStartTime}
                  onChange={(e) => setActiveStartTime(e.target.value)}
                  className="h-9 text-xs bg-white dark:bg-slate-900 font-mono"
                />
                <span className="text-slate-400 font-semibold text-xs">to</span>
                <Input
                  type="time"
                  value={activeEndTime}
                  onChange={(e) => setActiveEndTime(e.target.value)}
                  className="h-9 text-xs bg-white dark:bg-slate-900 font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-400">Warmup sessions will only run between these hours (e.g. 08:00 to 22:00).</p>
            </div>
          </div>
        </div>

        {/* Next Scheduled Message & Session Pairing Links Table Section */}
        {isEnabled && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <Bot className="w-5 h-5" />
                Scheduled Messages & Active Session Links
              </h2>
              <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-300 text-xs font-bold gap-1 px-3 py-1">
                <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
                Total Messages Today: {totalMessagesToday}
              </Badge>
            </div>

            {connectedCount < 2 ? (
              <div className="flex items-center gap-3 text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs">
                <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <strong>At least 2 connected WhatsApp sessions are required for automated cross-chatting.</strong>
                  <p className="text-amber-700 mt-0.5">Please add or connect another WhatsApp account on the WhatsApp Sessions page.</p>
                </div>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-950">
                    <TableRow>
                      <TableHead className="w-16 font-bold text-xs">Pair #</TableHead>
                      <TableHead className="font-bold text-xs">Session A (Phone / Alias)</TableHead>
                      <TableHead className="w-8 text-center text-xs text-slate-400">↔</TableHead>
                      <TableHead className="font-bold text-xs">Session B (Phone / Alias)</TableHead>
                      <TableHead className="font-bold text-xs">Status / Active Topic</TableHead>
                      <TableHead className="font-bold text-xs">Scheduled Send</TableHead>
                      <TableHead className="font-bold text-xs">Total Messages Today</TableHead>
                      <TableHead className="font-bold text-xs">Upcoming Message Preview</TableHead>
                      <TableHead className="text-right font-bold text-xs">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessionLinks.map((link, index) => {
                      const phoneA = link.sessionA.phone_number || link.sessionA.session_id
                      const phoneB = link.sessionB.phone_number || link.sessionB.session_id
                      
                      // Check if this pair is currently running in currentDialogue
                      const isMatch = currentDialogue && (
                        (currentDialogue.sender_phone === phoneA && currentDialogue.recipient_phone === phoneB) ||
                        (currentDialogue.sender_phone === phoneB && currentDialogue.recipient_phone === phoneA)
                      )

                      const scheduledTime = isMatch ? currentDialogue.next_turn_at : globalNextScheduledAt

                      // Calculate sent count for Session A & B against max limit
                      const countA = sessionDailyCounts[link.sessionA.phone_number] || sessionDailyCounts[link.sessionA.session_id] || 0
                      const countB = sessionDailyCounts[link.sessionB.phone_number] || sessionDailyCounts[link.sessionB.session_id] || 0
                      const maxDailyNum = Number(maxDaily) || 50

                      return (
                        <TableRow key={link.id} className={isMatch ? 'bg-emerald-50/60 dark:bg-emerald-950/20 font-medium' : ''}>
                          <TableCell className="font-mono text-xs text-slate-500">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700 bg-emerald-50">
                              #{index + 1}
                            </Badge>
                          </TableCell>
                          
                          <TableCell className="text-xs">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {link.sessionA.alias || link.sessionA.phone_number || link.sessionA.session_id}
                            </div>
                            {link.sessionA.alias && (
                              <span className="text-[10px] text-slate-400 font-mono">{link.sessionA.phone_number}</span>
                            )}
                          </TableCell>

                          <TableCell className="text-center text-xs font-bold text-emerald-500">
                            ↔
                          </TableCell>

                          <TableCell className="text-xs">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {link.sessionB.alias || link.sessionB.phone_number || link.sessionB.session_id}
                            </div>
                            {link.sessionB.alias && (
                              <span className="text-[10px] text-slate-400 font-mono">{link.sessionB.phone_number}</span>
                            )}
                          </TableCell>

                          <TableCell className="text-xs">
                            {isMatch ? (
                              <div className="space-y-0.5">
                                <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">
                                  RUNNING (Turn {currentDialogue.current_turn_index + 1}/{currentDialogue.total_turns})
                                </Badge>
                                <div className="text-[11px] text-slate-700 dark:text-slate-300 font-semibold truncate max-w-[150px]">
                                  {currentDialogue.topic}
                                </div>
                              </div>
                            ) : !isWindowActive ? (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 border border-amber-200">
                                PAUSED (Outside Active Window)
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border border-slate-200">
                                Idle (Next Cycle)
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="text-xs">
                            <div className="space-y-0.5">
                              <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 w-fit">
                                <Clock className="w-3 h-3 animate-pulse" />
                                {!isWindowActive ? `Resume at ${activeStartTime}` : getTimeLeftStr(scheduledTime)}
                              </span>
                              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                at {formatClockTime(scheduledTime)}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            <div className="space-y-0.5">
                              <Badge variant="secondary" className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs gap-1 border border-emerald-200 font-bold">
                                <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
                                {countA + countB} / {maxDailyNum * 2} msgs today
                              </Badge>
                              <div className="text-[10px] text-slate-400 font-mono">
                                A: {countA}/{maxDailyNum} | B: {countB}/{maxDailyNum}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="text-xs max-w-[200px]">
                            {isMatch ? (
                              <p className="truncate italic text-slate-700 dark:text-slate-300 font-medium" title={currentDialogue.next_message_preview}>
                                "{currentDialogue.next_message_preview}"
                              </p>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">Dynamic spintax script ready</span>
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={isMatch ? 'default' : 'outline'}
                              className={isMatch ? 'bg-emerald-600 hover:bg-emerald-700 h-7 text-xs font-semibold px-2.5 gap-1' : 'h-7 text-xs font-semibold px-2.5 gap-1 border-slate-300 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'}
                              onClick={() => sendNowMutation.mutate({
                                session_a_id: link.sessionA.session_id,
                                session_b_id: link.sessionB.session_id,
                              })}
                              disabled={sendNowMutation.isPending || !isWindowActive}
                            >
                              {sendNowMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              Send Now
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
