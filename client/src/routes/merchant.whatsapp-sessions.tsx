import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, QrCode, Trash2, Smartphone, Settings } from 'lucide-react'
import dayjs from 'dayjs'

import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/merchant/whatsapp-sessions')({
  component: SessionsPage,
})

function SessionsPage() {
  const queryClient = useQueryClient()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [isQrOpen, setIsQrOpen] = useState(false)
  const [isManageOpen, setIsManageOpen] = useState(false)

  const { data: sessionsResponse, isLoading } = useQuery({
    queryKey: ['whatsapp-sessions'],
    queryFn: () => api.get('whatsapp-sessions/').json<any>(),
  })

  const sessions = Array.isArray(sessionsResponse) ? sessionsResponse : sessionsResponse?.results || []

  const createSessionMutation = useMutation({
    mutationFn: () => api.post('whatsapp-sessions/').json<any>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
      toast.success('Session created successfully!')
    },
    onError: () => toast.error('Failed to create session.')
  })

  const fetchQrMutation = useMutation({
    mutationFn: (id: string) => api.get(`whatsapp-sessions/${id}/qr/`).json<any>(),
    onSuccess: (data) => {
      if (data.qrBase64) {
        setQrBase64(data.qrBase64)
      } else if (data.data?.qrBase64) {
        setQrBase64(data.data.qrBase64)
      } else {
        toast.error('No QR code returned.')
      }
    },
    onError: () => toast.error('Failed to fetch QR. Try again.')
  })

  const disconnectSessionMutation = useMutation({
    mutationFn: (id: string) => api.patch(`whatsapp-sessions/${id}/`, { json: { status: 'disconnecting' } }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
      toast.success('Session disconnected')
    },
    onError: () => toast.error('Failed to disconnect session.')
  })

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`whatsapp-sessions/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
      toast.success('Session deleted')
    },
    onError: () => toast.error('Failed to delete session.')
  })

  const handleScan = (id: string) => {
    setSelectedSessionId(id)
    setQrBase64(null)
    setIsQrOpen(true)
    fetchQrMutation.mutate(id)
  }

  const handleManage = (id: string) => {
    setSelectedSessionId(id)
    setIsManageOpen(true)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-emerald-100 text-emerald-800'
      case 'connecting': return 'bg-amber-100 text-amber-800'
      case 'initializing': return 'bg-teal-100 text-teal-800'
      case 'disconnected': 
      case 'logout': return 'bg-red-100 text-red-800'
      default: return 'bg-slate-100 text-slate-800'
    }
  }

  const selectedSession = sessions.find((s: any) => s.id === selectedSessionId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">WhatsApp Sessions</h2>
          <p className="text-slate-500">
            Create and scan WhatsApp sessions to connect your number.
          </p>
        </div>

        <Button 
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
          onClick={() => createSessionMutation.mutate()}
          disabled={createSessionMutation.isPending}
        >
          {createSessionMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          New Session
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            <Smartphone className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
              No Sessions Active
            </h3>
            <p className="mb-4">
              Create your first WhatsApp session and scan the QR code to connect your number.
            </p>
            <Button onClick={() => createSessionMutation.mutate()} variant="outline">
              Create Session
            </Button>
          </div>
        ) : (
          sessions.map((session: any) => (
            <Card key={session.id} className="overflow-hidden bg-white dark:bg-slate-900">
              <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Smartphone className="w-4 h-4" /> Session
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {session.phone_number || 'No phone number'}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className={getStatusColor(session.status)}>
                    {(session.status || 'unknown').charAt(0).toUpperCase() + (session.status || 'unknown').slice(1)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="text-xs text-slate-500">
                  Created {dayjs(session.created_at).format('MMM D, YYYY h:mm A')}
                </div>
                
                <div className="flex justify-between items-center pt-2">
                  <div className="flex space-x-2">
                    {session.status === 'connected' ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={disconnectSessionMutation.isPending}
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200"
                          >
                            Disconnect
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Disconnect Session?</DialogTitle>
                            <DialogDescription>
                              Are you sure you want to disconnect this session?
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
                                onClick={() => disconnectSessionMutation.mutate(session.id)}
                                className="bg-amber-600 hover:bg-amber-700 text-white"
                              >
                                Disconnect
                              </Button>
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleScan(session.id)}
                      >
                        <QrCode className="w-4 h-4 mr-2" />
                        Scan
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleManage(session.id)}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Manage
                    </Button>
                  </div>
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        disabled={deleteSessionMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Delete Session?</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete this session? This action cannot be undone.
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
                            onClick={() => deleteSessionMutation.mutate(session.id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            Delete
                          </Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isQrOpen} onOpenChange={setIsQrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan WhatsApp QR</DialogTitle>
            <DialogDescription>
              Open WhatsApp on your phone, go to Linked Devices, and scan this QR code.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900 rounded-lg min-h-[300px]">
            {fetchQrMutation.isPending ? (
              <div className="text-center space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto" />
                <p className="text-sm text-slate-500">Generating QR Code...</p>
              </div>
            ) : qrBase64 ? (
              <div className="flex flex-col items-center">
                <img 
                  src={qrBase64.startsWith('data:image/png;base64,') ? qrBase64 : `data:image/png;base64,${qrBase64}`} 
                  alt="WhatsApp QR Code" 
                  className="w-64 h-64 border-4 border-white shadow-sm rounded-lg"
                />
                <Button 
                  variant="outline" 
                  className="mt-6" 
                  onClick={() => selectedSessionId && fetchQrMutation.mutate(selectedSessionId)}
                >
                  Refresh QR Code
                </Button>
              </div>
            ) : (
              <div className="text-center text-red-500">
                <p>Could not generate QR Code.</p>
                <Button variant="outline" className="mt-4" onClick={() => selectedSessionId && fetchQrMutation.mutate(selectedSessionId)}>
                  Retry
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Session Dialog */}
      {selectedSession && (
        <ManageSessionDialog 
          isOpen={isManageOpen} 
          onClose={() => setIsManageOpen(false)} 
          session={selectedSession} 
        />
      )}
    </div>
  )
}

function ManageSessionDialog({ isOpen, onClose, session }: { isOpen: boolean, onClose: () => void, session: any }) {
  const queryClient = useQueryClient()
  const [warmup, setWarmup] = useState(session.warmup_schedule?.join(', ') || '')
  const [newAgentPhone, setNewAgentPhone] = useState('')

  useEffect(() => {
    if (isOpen) {
      setWarmup(session.warmup_schedule?.join(', ') || '')
      setNewAgentPhone('')
    }
  }, [isOpen, session])

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
    onError: () => toast.error('Failed to update session')
  })

  const createAgentMutation = useMutation({
    mutationFn: (phone_number: string) => api.post('agent-phone-numbers/', { json: { session: session.id, phone_number } }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-phone-numbers', session.id] })
      setNewAgentPhone('')
      toast.success('Agent phone number added')
    },
    onError: () => toast.error('Failed to add agent phone number')
  })

  const deleteAgentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`agent-phone-numbers/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-phone-numbers', session.id] })
      toast.success('Agent removed')
    },
    onError: () => toast.error('Failed to remove agent')
  })

  const handleUpdateSession = () => {
    const data: any = {}
    
    // Parse warmup string to array of ints
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

    updateSessionMutation.mutate(data)
  }

  const handleAddAgent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAgentPhone.trim()) return
    createAgentMutation.mutate(newAgentPhone.trim())
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Session</DialogTitle>
          <DialogDescription>
            Update session status, warmup schedule, and agent phone numbers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Session Settings</h3>
            
            <div className="space-y-2">
              <Label>Warmup Schedule (Messages per day)</Label>
              <Input 
                value={warmup} 
                onChange={(e) => setWarmup(e.target.value)} 
                placeholder="e.g. 5, 10, 15, 20, 30"
              />
              <p className="text-xs text-slate-500">
                Comma-separated list of numbers. First number is day 1, second is day 2, etc. The last number applies to all following days.
              </p>
            </div>

            <Button 
              onClick={handleUpdateSession} 
              disabled={updateSessionMutation.isPending}
              className="w-full"
            >
              {updateSessionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Session Settings
            </Button>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Agent Phone Numbers</h3>
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
