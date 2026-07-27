import React, { useState } from 'react'
import { Plus, Trash2, Key, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { Session, MasterPhone } from '../types'

interface MasterPhonesCardProps {
  masterPhones: MasterPhone[]
  isLoading: boolean
  sessions: Session[]
  onAddMasterPhone: (phone: string, sessionId: string) => void
  isAdding: boolean
  onToggleMasterPhone: (id: string, isActive: boolean) => void
  onDeleteMasterPhone: (id: string) => void
}

export function MasterPhonesCard({
  masterPhones,
  isLoading,
  sessions,
  onAddMasterPhone,
  isAdding,
  onToggleMasterPhone,
  onDeleteMasterPhone,
}: MasterPhonesCardProps) {
  const [phoneInput, setPhoneInput] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneInput.trim() || !selectedSessionId) {
      toast.error('Please enter a phone number and select a WhatsApp session.')
      return
    }
    onAddMasterPhone(phoneInput.trim(), selectedSessionId)
    setPhoneInput('')
    setSelectedSessionId('')
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Key className="w-5 h-5 text-emerald-600" />
              Master OTP Phone Numbers
            </CardTitle>
            <CardDescription className="text-xs">
              System phone numbers configured to receive OTP authentication messages automatically.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Form */}
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5 items-end">
          <div className="flex-1 space-y-1 w-full sm:w-auto">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Phone Number</label>
            <Input
              placeholder="e.g. 60123456789"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="h-9 text-xs font-mono"
            />
          </div>
          <div className="flex-1 space-y-1 w-full sm:w-auto">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Target Session</label>
            <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Select session..." />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.phone_number || s.alias || s.session_id || s.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            disabled={isAdding || !phoneInput.trim() || !selectedSessionId}
            className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5 px-4"
          >
            {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add Master Phone
          </Button>
        </form>

        {/* Table */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 dark:bg-slate-900/60">
                <TableHead className="text-xs">Phone Number</TableHead>
                <TableHead className="text-xs">Session</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : masterPhones.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-xs text-slate-500">
                    No master OTP phone numbers configured yet.
                  </TableCell>
                </TableRow>
              ) : (
                masterPhones.map((mp) => (
                  <TableRow key={mp.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50">
                    <TableCell className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {mp.phone_number}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">
                      {mp.session_id || mp.session}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => onToggleMasterPhone(mp.id, !mp.is_active)}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                          mp.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {mp.is_active ? 'Active' : 'Disabled'}
                      </button>
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
            <Button variant="outline" size="sm" onClick={() => setDeleteTargetId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (deleteTargetId) onDeleteMasterPhone(deleteTargetId)
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
