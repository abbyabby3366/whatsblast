import React, { useState } from 'react'
import { Plus, Trash2, Key, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { Session, MasterPhone } from '../types'

interface MasterPhonesCardProps {
  // Props passed from admin.sessions.tsx
  masters?: MasterPhone[]
  mastersLoading?: boolean
  connectedSessions?: Session[]
  selectedMasterSession?: string
  setSelectedMasterSession?: (val: string) => void
  createMaster?: { mutate: (session: string) => void; isPending: boolean }
  toggleMaster?: { mutate: (args: { id: string; is_active: boolean }) => void }
  deleteMaster?: { mutate: (id: string) => void }
  getStatusBadge?: (status?: string) => React.ReactNode

  // Alternative/legacy prop names fallback
  masterPhones?: MasterPhone[]
  isLoading?: boolean
  sessions?: Session[]
  onAddMasterPhone?: (phone: string, sessionId: string) => void
  isAdding?: boolean
  onToggleMasterPhone?: (id: string, isActive: boolean) => void
  onDeleteMasterPhone?: (id: string) => void
  defaultCollapsed?: boolean
}

export function MasterPhonesCard({
  masters,
  mastersLoading,
  connectedSessions,
  selectedMasterSession: propSelectedMasterSession,
  setSelectedMasterSession: propSetSelectedMasterSession,
  createMaster,
  toggleMaster,
  deleteMaster,
  getStatusBadge,

  masterPhones: propMasterPhones,
  isLoading: propIsLoading,
  sessions: propSessions,
  onAddMasterPhone,
  isAdding: propIsAdding,
  onToggleMasterPhone,
  onDeleteMasterPhone,
  defaultCollapsed = true,
}: MasterPhonesCardProps) {
  // Resolve actual prop values with defensive fallback arrays
  const masterList = masters ?? propMasterPhones ?? []
  const loading = mastersLoading ?? propIsLoading ?? false
  const availableSessions = connectedSessions ?? propSessions ?? []
  const isPendingAdd = createMaster?.isPending ?? propIsAdding ?? false

  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const [localSelectedSession, setLocalSelectedSession] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const selectedSessionId = propSelectedMasterSession !== undefined ? propSelectedMasterSession : localSelectedSession
  const setSelectedSessionId = propSetSelectedMasterSession || setLocalSelectedSession

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSessionId) {
      toast.error('Please select a WhatsApp session to assign as a Master OTP phone.')
      return
    }

    if (createMaster) {
      createMaster.mutate(selectedSessionId)
    } else if (onAddMasterPhone) {
      const selectedSess = availableSessions.find((s) => s.id === selectedSessionId)
      onAddMasterPhone(selectedSess?.phone_number || '', selectedSessionId)
    }
  }

  const handleToggle = (id: string, currentActive: boolean) => {
    if (toggleMaster) {
      toggleMaster.mutate({ id, is_active: !currentActive })
    } else if (onToggleMasterPhone) {
      onToggleMasterPhone(id, !currentActive)
    }
  }

  const handleDelete = (id: string) => {
    if (deleteMaster) {
      deleteMaster.mutate(id)
    } else if (onDeleteMasterPhone) {
      onDeleteMasterPhone(id)
    }
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs transition-all">
      <CardHeader
        className={`select-none cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30 ${
          isCollapsed ? 'py-4' : 'pb-3'
        }`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Key className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                Master OTP Phone Numbers
                <Badge variant="secondary" className="text-xs font-normal font-mono">
                  {masterList.length}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                System phone numbers configured to receive OTP authentication messages automatically.
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            onClick={(e) => {
              e.stopPropagation()
              setIsCollapsed(!isCollapsed)
            }}
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            <span className="sr-only">Toggle Master OTP Section</span>
          </Button>
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardContent className="space-y-4">
          {/* Add Form */}
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5 items-end">
            <div className="flex-1 space-y-1 w-full">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Target Connected Session</label>
              <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select connected WhatsApp session..." />
                </SelectTrigger>
                <SelectContent>
                  {availableSessions.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No available connected sessions
                    </SelectItem>
                  ) : (
                    availableSessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.phone_number ? `${s.phone_number} (${s.alias || s.session_id || s.id})` : (s.alias || s.session_id || s.id)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={isPendingAdd || !selectedSessionId || selectedSessionId === '_none'}
              className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5 px-4 shrink-0"
            >
              {isPendingAdd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add Master Phone
            </Button>
          </form>

          {/* Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 dark:bg-slate-900/60">
                  <TableHead className="text-xs">Phone Number</TableHead>
                  <TableHead className="text-xs">Session ID</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center">
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : masterList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-xs text-slate-500">
                      No master OTP phone numbers configured yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  masterList.map((mp) => (
                    <TableRow key={mp.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50">
                      <TableCell className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {mp.phone_number || 'Pending connection'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">
                        {mp.session_id || mp.session}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusBadge && getStatusBadge(mp.session_status)}
                          <button
                            type="button"
                            onClick={() => handleToggle(mp.id, mp.is_active)}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                              mp.is_active
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {mp.is_active ? 'Active' : 'Disabled'}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTargetId(mp.id)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={Boolean(deleteTargetId)} onOpenChange={(v) => !v && setDeleteTargetId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Master Phone?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">
            Are you sure you want to remove this master OTP phone number? OTP messages will no longer be intercepted automatically.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTargetId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (deleteTargetId) handleDelete(deleteTargetId)
                setDeleteTargetId(null)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
