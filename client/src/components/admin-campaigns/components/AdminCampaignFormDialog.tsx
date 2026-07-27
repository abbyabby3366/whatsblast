import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { FormState, User } from '../types'

interface AdminCampaignFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  users: User[]
  onSave: () => void
  isSaving: boolean
}

export function AdminCampaignFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  users,
  onSave,
  isSaving,
}: AdminCampaignFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Edit Campaign' : 'Create Campaign'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Campaign Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Summer Sale"
            />
          </div>
          <div>
            <Label>Owner / Merchant</Label>
            <Select value={form.user} onValueChange={(val) => setForm({ ...form, user: val })}>
              <SelectTrigger>
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id || u._id} value={u.id || u._id || ''}>
                    {u.phone_number || u.id} ({u.role || 'merchant'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Recipients (comma or newline separated)</Label>
            <Textarea
              value={form.recipient_phones}
              onChange={(e) => setForm({ ...form, recipient_phones: e.target.value })}
              placeholder="60123456789, 60198765432"
            />
          </div>
          <div>
            <Label>Templates (separate sequences with ---)</Label>
            <Textarea
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              rows={4}
              placeholder="Message 1&#10;---&#10;Message 2"
            />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.enable_warmup}
                onChange={(e) => setForm({ ...form, enable_warmup: e.target.checked })}
              />
              Enable Warmup
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.retry_on_failure}
                onChange={(e) => setForm({ ...form, retry_on_failure: e.target.checked })}
              />
              Retry on Failure
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
