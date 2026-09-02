import { useEffect, useState } from 'react'
import { Trash2, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { Customer } from '../types'

export const DeleteCustomerButton = ({ id, removeCustomerMutation }: { id: string, removeCustomerMutation: any }) => {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-red-500 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the customer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button 
            onClick={() => {
              removeCustomerMutation.mutate(id, {
                onSuccess: () => setIsOpen(false)
              })
            }}
            disabled={removeCustomerMutation.isPending}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {removeCustomerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const EditCustomerButton = ({ customer, updateCustomerMutation }: { customer: Customer; updateCustomerMutation: any }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState(customer.name || '')
  const [phone, setPhone] = useState(customer.phone_number || '')
  const [label, setLabel] = useState(customer.label || '')

  useEffect(() => {
    if (isOpen) {
      setName(customer.name || '')
      setPhone(customer.phone_number || '')
      setLabel(customer.label || '')
    }
  }, [isOpen, customer])

  const handleUpdate = () => {
    if (!phone.trim()) {
      toast.error('Please enter a phone number.')
      return
    }
    updateCustomerMutation.mutate(
      { id: customer.id, name: name.trim(), phone_number: phone.trim(), label: label.trim() },
      {
        onSuccess: () => setIsOpen(false)
      }
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
          <DialogDescription>
            Update customer name, phone number, or tag label.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2 sm:py-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
            <Label htmlFor="edit-name" className="sm:text-right text-xs sm:text-sm">
              Name
            </Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="sm:col-span-3 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
            <Label htmlFor="edit-phone" className="sm:text-right text-xs sm:text-sm">
              Phone
            </Label>
            <Input
              id="edit-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="sm:col-span-3 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
            <Label htmlFor="edit-label" className="sm:text-right text-xs sm:text-sm">
              Tag / Label
            </Label>
            <Input
              id="edit-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. VIP, Wholesaler"
              className="sm:col-span-3 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button 
            type="button" 
            onClick={handleUpdate} 
            disabled={updateCustomerMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {updateCustomerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
