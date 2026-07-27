import { useEffect, useState, useMemo, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Plus, Trash2, Search, Loader2 } from 'lucide-react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { api, getErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { Customer, CustomerImportResult, CustomerResponse } from '@/components/merchant-customers/types'
import { EditCustomerButton, DeleteCustomerButton } from '@/components/merchant-customers/components/CustomerDialogs'

export const Route = createFileRoute('/merchant/customers')({
  component: CustomersPage,
})

const columnHelper = createColumnHelper<Customer>()

function CustomersPage() {
  const queryClient = useQueryClient()
  const [globalFilter, setGlobalFilter] = useState('')
  const [selectedLabel, setSelectedLabel] = useState<string>('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: availableLabels = [] } = useQuery({
    queryKey: ['customer-labels'],
    queryFn: () => api.get('customers/labels/').json<string[]>().catch(() => []),
  })

  const { data: response, isLoading } = useQuery({
    queryKey: ['customers', pageIndex, pageSize, globalFilter, selectedLabel],
    queryFn: () => {
      const searchParams = new URLSearchParams()
      searchParams.set('page', String(pageIndex + 1))
      searchParams.set('page_size', String(pageSize))

      if (globalFilter.trim()) {
        searchParams.set('search', globalFilter.trim())
      }
      if (selectedLabel && selectedLabel !== 'all') {
        searchParams.set('label', selectedLabel)
      }

      return api.get('customers/', { searchParams }).json<CustomerResponse | Customer[]>()
    },
    placeholderData: (previousData) => previousData,
  })

  const customers: Customer[] = useMemo(() => {
    if (!response) return []
    return Array.isArray(response) ? response : response.results
  }, [response])
  const totalCount = Array.isArray(response) ? response.length : response?.count || 0
  const pageCount = Math.ceil(totalCount / pageSize)

  useEffect(() => {
    setPageIndex(0)
  }, [globalFilter, selectedLabel])

  const addCustomerMutation = useMutation({
    mutationFn: (newCustomer: { name: string; phone_number: string; label?: string }) =>
      api.post('customers/', { json: newCustomer }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer-labels'] })
      setNewName('')
      setNewPhone('')
      setNewLabel('')
      setIsAddOpen(false)
      toast.success('Customer added successfully!')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to add customer.'))
  })

  const updateCustomerMutation = useMutation({
    mutationFn: (updatedCustomer: { id: string; name: string; phone_number: string; label?: string }) =>
      api.put(`customers/${updatedCustomer.id}/`, { json: updatedCustomer }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer-labels'] })
      toast.success('Customer updated successfully!')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to update customer.'))
  })

  const importCustomersMutation = useMutation({
    mutationFn: (importedCustomers: { name: string; phone_number: string; label?: string }[]) =>
      api.post('customers/import/', { json: { customers: importedCustomers } }).json<CustomerImportResult>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer-labels'] })
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to import customers.'))
  })

  const removeCustomerMutation = useMutation({
    mutationFn: (id: string) => api.delete(`customers/${id}/`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer-labels'] })
      setSelectedIds((current) => current.filter((selectedId) => selectedId !== id))
      toast.success('Customer removed')
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to remove customer.'))
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('customers/bulk-delete/', { json: { ids } }).json<{ deleted: number }>(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer-labels'] })
      setSelectedIds([])
      setBulkDeleteOpen(false)
      toast.success(`${data.deleted} customer${data.deleted === 1 ? '' : 's'} removed`)
    },
    onError: async (err) => toast.error(await getErrorMessage(err, 'Failed to remove selected customers.'))
  })

  const handleExportTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ name: 'John Doe', phone_number: '60123456789', label: 'VIP' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, 'customer_template.csv', { bookType: 'csv' })
  }

  const handleExportCustomers = () => {
    if (customers.length === 0) {
      toast.error('No customers to export')
      return
    }
    const data = customers.map(c => ({ name: c.name, phone_number: c.phone_number, label: c.label || '' }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Customers')
    XLSX.writeFile(wb, 'customers.csv', { bookType: 'csv' })
  }

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json<any>(ws)
        
        const importedCustomers: { name: string; phone_number: string; label?: string }[] = []
        for (const row of data) {
          const phone = row.phone_number || row.phone || row['Phone Number'] || row['Phone'] || row['phone number']
          const name = row.name || row.Name || row['Full Name']
          const label = row.label || row.Label || row['TAG'] || row['tag'] || ''
          if (name && phone) {
            importedCustomers.push({ name: String(name), phone_number: String(phone), label: label ? String(label) : '' })
          }
        }
        const result = await importCustomersMutation.mutateAsync(importedCustomers)
        toast.success(`Import complete: ${result.created || result.imported || importedCustomers.length} added/updated.`)
      } catch (err) {
        toast.error('Failed to import CSV file.')
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsBinaryString(file)
  }

  const handleAdd = () => {
    if (!newName || !newPhone) {
      toast.error('Please fill in both name and phone.')
      return
    }
    addCustomerMutation.mutate({ name: newName, phone_number: newPhone, label: newLabel })
  }

  const visibleIds = useMemo(() => customers.map((customer) => customer.id), [customers])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) => checked ? Array.from(new Set([...current, id])) : current.filter((selectedId) => selectedId !== id))
  }
  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((current) => checked ? Array.from(new Set([...current, ...visibleIds])) : current.filter((id) => !visibleIds.includes(id)))
  }

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={(e) => toggleAllVisible(e.target.checked)}
            aria-label="Select all visible customers"
          />
        ),
        cell: (info) => (
          <input
            type="checkbox"
            checked={selectedIds.includes(info.row.original.id)}
            onChange={(e) => toggleSelected(info.row.original.id, e.target.checked)}
            aria-label={`Select ${info.row.original.name}`}
          />
        ),
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor('phone_number', {
        header: 'Phone Number',
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor('label', {
        header: 'Label',
        cell: (info) => {
          const val = info.getValue()
          return val ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80">
              {val}
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-600">-</span>
          )
        },
      }),
      columnHelper.accessor('created_at', {
        header: 'Date Added',
        cell: (info) => dayjs(info.getValue()).format('MMM D, YYYY h:mm A'),
      }),
      columnHelper.display({
        id: 'actions',
        cell: (info) => (
          <div className="flex items-center gap-1">
            <EditCustomerButton customer={info.row.original} updateCustomerMutation={updateCustomerMutation} />
            <DeleteCustomerButton id={info.row.original.id} removeCustomerMutation={removeCustomerMutation} />
          </div>
        ),
      }),
    ],
    [removeCustomerMutation, updateCustomerMutation, selectedIds, allVisibleSelected, visibleIds]
  )

  const table = useReactTable({
    data: customers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: {
      pagination: {
        pageIndex,
        pageSize,
      },
    },
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const newState = updater({ pageIndex, pageSize })
        setPageIndex(newState.pageIndex)
        setPageSize(newState.pageSize)
      } else {
        setPageIndex(updater.pageIndex)
        setPageSize(updater.pageSize)
      }
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Customers</h2>
          <p className="text-xs text-slate-500">Manage your contact list for WhatsApp blasting.</p>
        </div>

        <div className="flex items-center gap-2">
          <input 
            type="file" 
            accept=".csv, .xlsx" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleImportCSV} 
          />
          <Button variant="outline" onClick={handleExportTemplate}>
            Template CSV
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            Import CSV
          </Button>
          <Button variant="outline" onClick={handleExportCustomers}>
            Export CSV
          </Button>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkDeleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete selected ({selectedIds.length})
            </Button>
          )}
          
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
                <DialogDescription>
                  Add a new customer to your contact list. Ensure the phone number includes the country code.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="John Doe"
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="phone" className="text-right">
                    Phone
                  </Label>
                  <Input
                    id="phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="60123456789"
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="label" className="text-right">
                    Label
                  </Label>
                  <Input
                    id="label"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="VIP, Retail, etc."
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" onClick={handleAdd} disabled={addCustomerMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {addCustomerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Contact
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 max-w-lg w-full">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search customers..."
                className="pl-9 bg-slate-50 dark:bg-slate-950 w-full"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </div>
            <Select value={selectedLabel} onValueChange={setSelectedLabel}>
              <SelectTrigger className="w-full sm:w-44 bg-slate-50 dark:bg-slate-950">
                <SelectValue placeholder="All Labels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Labels</SelectItem>
                {availableLabels.map((lbl) => (
                  <SelectItem key={lbl} value={lbl}>
                    {lbl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm font-medium text-slate-500">
            Total Records: {totalCount}
            {selectedIds.length > 0 ? ` • Selected: ${selectedIds.length}` : ''}
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">
                    No customers found. Try adding one!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="text-sm text-slate-500">
            Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1} • {totalCount} total • {table.getState().pagination.pageSize} / page
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => {
                setPageIndex(0)
                table.setPageSize(Number(v))
              }}
            >
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="20">20 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
                <SelectItem value="100">100 / page</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected customers?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete {selectedIds.length} selected customer{selectedIds.length === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => bulkDeleteMutation.mutate(selectedIds)}
              disabled={bulkDeleteMutation.isPending || selectedIds.length === 0}
            >
              {bulkDeleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
