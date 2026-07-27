import React, { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  QrCode,
  RefreshCw,
  LogOut,
  Trash2,
  HelpCircle,
  Plus,
  Shuffle,
  Send,
  Loader2,
  Copy,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PhoneActiveIndicator, PhoneActiveTooltip, LastSentMessageTooltip } from '@/components/whatsapp-sessions/PhoneActiveIndicator'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ManageMerchantSessionDialogProps {
  isOpen: boolean
  onClose: () => void
  session: any
  onScan: () => void
  onReconnect: () => void
  onDisconnect: () => void
  onDelete: () => void
  isReconnecting: boolean
}

export function ManageMerchantSessionDialog({
  isOpen,
  onClose,
  session,
  onScan,
  onReconnect,
  onDisconnect,
  onDelete,
  isReconnecting,
}: ManageMerchantSessionDialogProps) {
  const queryClient = useQueryClient()
  const [alias, setAlias] = useState(session.alias || '')
  const [labelsStr, setLabelsStr] = useState(session.labels?.join(', ') || '')
  const [warmup, setWarmup] = useState(session.warmup_schedule?.join(', ') || '')
  const [minInterval, setMinInterval] = useState<number>(session.min_interval_seconds ?? 10)
  const [maxInterval, setMaxInterval] = useState<number>(session.max_interval_seconds ?? 15)
  const [activeStartTime, setActiveStartTime] = useState<string>(session.active_start_time || '00:00')
  const [activeEndTime, setActiveEndTime] = useState<string>(session.active_end_time || '23:59')
  const [newAgentPhone, setNewAgentPhone] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [testText, setTestText] = useState('Hello! This is a test message sent from WhatsBlast session.')
  const [isSendingTest, setIsSendingTest] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setAlias(session.alias || '')
      setLabelsStr(session.labels?.join(', ') || '')
      setWarmup(session.warmup_schedule?.join(', ') || '')
      setMinInterval(session.min_interval_seconds ?? 10)
      setMaxInterval(session.max_interval_seconds ?? 15)
      setActiveStartTime(session.active_start_time || '00:00')
      setActiveEndTime(session.active_end_time || '23:59')
      setNewAgentPhone('')
      setTestPhone('')
      setTestText('Hello! This is a test message sent from WhatsBlast session.')
      setIsSendingTest(false)
    }
  }, [isOpen, session])

  const { data: customersRes } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('customers/').json<any>(),
    enabled: isOpen,
  })
  const customers = Array.isArray(customersRes) ? customersRes : customersRes?.results || []

  const { data: agentsResponse, isLoading: isLoadingAgents } = useQuery({
    queryKey: ['agent-phone-numbers', session.id],
    queryFn: () => api.get(`agent-phone-numbers/?session=${session.id}`).json<any>(),
    enabled: isOpen,
  })

  const agents = Array.isArray(agentsResponse) ? agentsResponse : agentsResponse?.results || []

  const updateSessionMutation = useMutation({
    mutationFn: (data: any) => api.patch(`whatsapp-sessions/${session.id}/`, { json: data }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
      toast.success('Session updated successfully')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to update session'))
  })

  const createAgentMutation = useMutation({
    mutationFn: (phone_number: string) => api.post('agent-phone-numbers/', { json: { session: session.id, phone_number } }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-phone-numbers', session.id] })
      setNewAgentPhone('')
      toast.success('Agent phone number added')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to add agent phone number'))
  })

  const deleteAgentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`agent-phone-numbers/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-phone-numbers', session.id] })
      toast.success('Agent removed')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to remove agent'))
  })

  const handleUpdateSession = () => {
    const data: any = {}
    
    data.alias = alias.trim()
    data.labels = labelsStr.split(',').map((s: string) => s.trim()).filter(Boolean)

    if (warmup.trim()) {
      const parts = warmup.split(',').map((s: string) => parseInt(s.trim()))
      if (parts.some(isNaN)) {
        toast.error('Warmup schedule must be a comma-separated list of numbers')
        return
      }
      data.warmup_schedule = parts
    } else {
      data.warmup_schedule = []
    }

    data.min_interval_seconds = Number(minInterval) || 10
    data.max_interval_seconds = Number(maxInterval) || 15
    data.active_start_time = activeStartTime || '00:00'
    data.active_end_time = activeEndTime || '23:59'

    updateSessionMutation.mutate(data)
  }

  const handleAddAgent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAgentPhone.trim()) return
    createAgentMutation.mutate(newAgentPhone.trim())
  }

  const handlePickRandomCustomer = () => {
    const validCustomers = customers.filter((c: any) => c.phone_number)
    if (validCustomers.length === 0) {
      toast.error('No customer contacts with phone numbers found')
      return
    }
    const randomContact = validCustomers[Math.floor(Math.random() * validCustomers.length)]
    setTestPhone(randomContact.phone_number)
    toast.info(`Selected random contact: ${randomContact.name ? `${randomContact.name} (${randomContact.phone_number})` : randomContact.phone_number}`)
  }

  const handleSendTestMessage = async () => {
    if (!testPhone.trim() || !testText.trim()) {
      toast.error('Please enter a recipient phone number and test message')
      return
    }
    setIsSendingTest(true)
    try {
      const sessionIdStr = session.session_id || session.id
      await api.post(`messages/${sessionIdStr}/send-text`, {
        json: { to: testPhone.trim(), text: testText.trim() },
      }).json()
      toast.success(`Test message sent to ${testPhone.trim()}!`)
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || err.message || 'Failed to send test message'
      toast.error(errorMsg)
    } finally {
      setIsSendingTest(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Session</DialogTitle>
          <DialogDescription>
            Configure session settings, forwarding, and test messaging.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Key Info & Quick Actions Banner */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Session ID:</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(session.session_id || session.id)
                    toast.success('Session ID copied!')
                  }}
                  className="font-mono text-slate-800 dark:text-slate-200 font-semibold hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1"
                >
                  {session.session_id || session.id}
                  <Copy className="w-3 h-3 text-slate-400" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Phone:</span>
                <span className="font-mono">{session.phone_number || 'Not connected yet'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium flex items-center gap-1">
                  Phone Active:
                  <PhoneActiveTooltip />
                </span>
                <PhoneActiveIndicator lastPhoneActivityAt={session.last_phone_activity_at} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium flex items-center gap-1">
                  Last Message:
                  <LastSentMessageTooltip />
                </span>
                <PhoneActiveIndicator lastPhoneActivityAt={session.last_physical_phone_sent_message_at} emptyLabel="No messages sent" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {(session.status || '').toLowerCase() === 'connected' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Connected</span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Disconnected</span>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 font-medium">
                    Actions
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={() => {
                      onClose()
                      onScan()
                    }}
                    className="cursor-pointer gap-2 text-xs"
                  >
                    <QrCode className="h-3.5 w-3.5 text-slate-600" />
                    Scan QR
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onReconnect()}
                    disabled={isReconnecting}
                    className="cursor-pointer gap-2 text-xs text-blue-600 focus:text-blue-600"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
                    Reconnect
                  </DropdownMenuItem>
                  {(session.status || '').toLowerCase() === 'connected' && (
                    <DropdownMenuItem
                      onClick={() => {
                        onClose()
                        onDisconnect()
                      }}
                      className="cursor-pointer gap-2 text-xs text-amber-600 focus:text-amber-600"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Logout
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      onClose()
                      onDelete()
                    }}
                    className="cursor-pointer gap-2 text-xs text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Session
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="settings">Session settings</TabsTrigger>
              <TabsTrigger value="forwarding">Forwarding</TabsTrigger>
              <TabsTrigger value="testing">Testing</TabsTrigger>
            </TabsList>

            {/* TAB 1: Session Settings */}
            <TabsContent value="settings" className="space-y-4 pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Session Alias (Friendly Name)</Label>
                  <Input 
                    value={alias} 
                    onChange={(e) => setAlias(e.target.value)} 
                    placeholder="e.g. Main Store WhatsApp"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Labels / Tags (comma-separated)</Label>
                  <Input 
                    value={labelsStr} 
                    onChange={(e) => setLabelsStr(e.target.value)} 
                    placeholder="e.g. marketing, sales, promo"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>Warmup Schedule (Messages per day)</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        Comma-separated list of numbers. First number is day 1, second is day 2, etc. The last number applies to all following days.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input 
                  value={warmup} 
                  onChange={(e) => setWarmup(e.target.value)} 
                  placeholder="e.g. 5, 10, 15, 20, 30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Min Interval (seconds)</Label>
                  <Input 
                    type="number" 
                    min={1} 
                    value={minInterval} 
                    onChange={(e) => setMinInterval(parseInt(e.target.value, 10) || 1)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Interval (seconds)</Label>
                  <Input 
                    type="number" 
                    min={1} 
                    value={maxInterval} 
                    onChange={(e) => setMaxInterval(parseInt(e.target.value, 10) || 1)} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Active Window Start</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          Daily start time for sending messages. Messages queued before this time will wait until the window opens.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input 
                    type="time" 
                    value={activeStartTime} 
                    onChange={(e) => setActiveStartTime(e.target.value)} 
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Active Window End</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          Daily end time for sending messages. Messages queued after this time will pause until the next day.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input 
                    type="time" 
                    value={activeEndTime} 
                    onChange={(e) => setActiveEndTime(e.target.value)} 
                  />
                </div>
              </div>

              <Button 
                onClick={handleUpdateSession} 
                disabled={updateSessionMutation.isPending}
                className="w-full"
              >
                {updateSessionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Session Settings
              </Button>
            </TabsContent>

            {/* TAB 2: Forwarding */}
            <TabsContent value="forwarding" className="space-y-4 pt-3">
              <p className="text-xs text-slate-500">
                Add external agent phone numbers here. Whenever this session receives a message, it will be automatically forwarded to these agents.
              </p>
              
              <form onSubmit={handleAddAgent} className="flex items-end gap-2">
                <div className="space-y-1 flex-1">
                  <Label>Add Agent Phone Number</Label>
                  <Input 
                    value={newAgentPhone} 
                    onChange={(e) => setNewAgentPhone(e.target.value)} 
                    placeholder="e.g. 60123456789"
                  />
                </div>
                <Button type="submit" disabled={!newAgentPhone.trim() || createAgentMutation.isPending}>
                  {createAgentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </form>

              <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                {isLoadingAgents ? (
                  <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-emerald-600" /></div>
                ) : agents.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">No agents added yet.</div>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {agents.map((agent: any) => (
                      <li key={agent.id} className="p-3 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                        <span className="font-medium text-sm">{agent.phone_number}</span>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                              disabled={deleteAgentMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Delete Agent?</DialogTitle>
                              <DialogDescription>
                                Are you sure you want to remove this agent's phone number?
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <DialogClose asChild>
                                <Button type="button" variant="outline">Cancel</Button>
                              </DialogClose>
                              <DialogClose asChild>
                                <Button 
                                  type="button"
                                  variant="destructive" 
                                  onClick={() => deleteAgentMutation.mutate(agent.id)}
                                  className="bg-red-600 hover:bg-red-700 text-white"
                                >
                                  Delete
                                </Button>
                              </DialogClose>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>

            {/* TAB 3: Testing */}
            <TabsContent value="testing" className="space-y-4 pt-3">
              <p className="text-xs text-slate-500">
                Send a test message using this WhatsApp session to test connection and message delivery.
              </p>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Recipient Phone Number</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePickRandomCustomer}
                      className="h-7 text-xs gap-1 text-slate-700 dark:text-slate-300"
                    >
                      <Shuffle className="h-3.5 w-3.5" /> Pick Random Contact
                    </Button>
                  </div>
                  <Input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="e.g. 60123456789"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Test Message Text</Label>
                  <Textarea
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    rows={3}
                    placeholder="Type a message to test..."
                  />
                </div>

                <Button
                  onClick={handleSendTestMessage}
                  disabled={isSendingTest || !testPhone.trim() || !testText.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {isSendingTest ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send Test Message
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
