import { useState, useEffect } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { UserSearchSelect } from './UserSearchSelect'
import type { User } from '../types'

interface CreateSessionDialogProps {
  isOpen: boolean
  onClose: () => void
  users: User[]
  onSubmit: (data: { user?: string; alias?: string }) => void
  isPending: boolean
}

export function CreateSessionDialog({
  isOpen,
  onClose,
  users,
  onSubmit,
  isPending,
}: CreateSessionDialogProps) {
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [alias, setAlias] = useState('')

  useEffect(() => {
    if (isOpen) {
      setSelectedUser('')
      setAlias('')
    }
  }, [isOpen])

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      user: selectedUser || undefined,
      alias: alias.trim() || undefined,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New WhatsApp Session</DialogTitle>
          <DialogDescription>
            Select an owner account (admin or merchant) for this new session.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Owner / Merchant Account</Label>
            <UserSearchSelect
              users={users}
              value={selectedUser}
              onChange={setSelectedUser}
              placeholder="Select merchant or admin account..."
            />
            <p className="text-[11px] text-slate-500">
              Select a merchant account or leave blank to assign to yourself (Admin).
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Session Alias (Optional)</Label>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="e.g. Support Line, Marketing 1"
              className="h-9 text-xs"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create Session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
