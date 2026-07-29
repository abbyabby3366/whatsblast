import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, Phone, MessageSquare, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api, getErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface TestSendMessageModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function TestSendMessageModal({
  isOpen,
  onClose,
  onSuccess,
}: TestSendMessageModalProps) {
  const queryClient = useQueryClient()
  const [selectedSessionId, setSelectedSessionId] = useState<string>('')
  const [recipientPhone, setRecipientPhone] = useState<string>('')
  const [messageText, setMessageText] = useState<string>('Hello! This is a test message from WhatsBlast.')
  const [isSending, setIsSending] = useState<boolean>(false)

  // Fetch sessions
  const { data: sessionsResponse, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['whatsapp-sessions'],
    queryFn: () => api.get('whatsapp-sessions/').json<any>(),
    enabled: isOpen,
  })

  const sessions = Array.isArray(sessionsResponse) ? sessionsResponse : sessionsResponse?.results || []
  const connectedSessions = sessions.filter((s: any) => (s.status || '').toLowerCase() === 'connected')

  // Auto-select first connected session when loaded
  useEffect(() => {
    if (connectedSessions.length > 0 && !selectedSessionId) {
      const defaultSession = connectedSessions[0]
      setSelectedSessionId(defaultSession.session_id || defaultSession.id)
    }
  }, [connectedSessions, selectedSessionId])

  const handleSend = async () => {
    const cleanPhone = recipientPhone.replace(/[^0-9]/g, '')
    if (!cleanPhone) {
      toast.error('Please enter a valid recipient phone number')
      return
    }

    if (!selectedSessionId) {
      toast.error('Please select a connected WhatsApp session')
      return
    }

    if (!messageText.trim()) {
      toast.error('Please enter a message to send')
      return
    }

    setIsSending(true)
    try {
      await api.post(`messages/${selectedSessionId}/send-text`, {
        json: {
          to: cleanPhone,
          text: messageText.trim(),
        },
      }).json()

      toast.success(`Test message sent successfully to ${cleanPhone}!`)
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
      onSuccess?.()
      onClose()
    } catch (err: any) {
      const errorMsg = await getErrorMessage(err, 'Failed to send test message')
      toast.error(errorMsg)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Send className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Test Send Message
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Send a quick WhatsApp message directly using your connected session to verify message delivery.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Session Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Sender WhatsApp Session
            </Label>
            {isLoadingSessions ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading sessions...
              </div>
            ) : connectedSessions.length === 0 ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>No connected WhatsApp sessions found. Please connect a WhatsApp phone session first before test sending.</span>
              </div>
            ) : (
              <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select a connected session" />
                </SelectTrigger>
                <SelectContent>
                  {connectedSessions.map((session: any) => {
                    const sid = session.session_id || session.id
                    const phone = session.phone_number || session.alias || sid
                    return (
                      <SelectItem key={sid} value={sid} className="text-xs">
                        <div className="flex items-center justify-between w-full gap-2">
                          <span>{phone}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-medium">
                            Connected
                          </span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Recipient Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="recipientPhone" className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Phone className="w-3 h-3 text-slate-400" /> Recipient Phone Number
            </Label>
            <Input
              id="recipientPhone"
              placeholder="e.g. 60123456789"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              className="h-9 text-xs"
            />
            <p className="text-[11px] text-slate-400">Include country code without + or spaces (e.g. 60123456789)</p>
          </div>

          {/* Message Text */}
          <div className="space-y-1.5">
            <Label htmlFor="messageText" className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <MessageSquare className="w-3 h-3 text-slate-400" /> Message Text
            </Label>
            <Textarea
              id="messageText"
              placeholder="Type your test message..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={3}
              className="text-xs resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSending} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={isSending || connectedSessions.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
          >
            {isSending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" /> Send Test Message
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
