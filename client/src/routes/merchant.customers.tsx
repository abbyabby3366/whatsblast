import { useEffect, useState, useMemo, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Plus, Trash2, Search, Loader2, Upload, Download } from 'lucide-react'
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
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
        ),
        cell: (info) => (
          <input
            type="checkbox"
            checked={selectedIds.includes(info.row.original.id)}
            onChange={(e) => toggleSelected(info.row.original.id, e.target.checked)}
            aria-label={`Select ${info.row.original.name}`}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
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
        cell: (info) => dayjs(info.getValue()).format('DD/MM/YY h:mm A'),
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Manage your contact list for WhatsApp blasting.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <input 
            type="file" 
            accept=".csv, .xlsx" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleImportCSV} 
          />
          <Button 
            variant="outline" 
            size="sm"
            className="flex-1 sm:flex-initial text-xs sm:text-sm px-2.5 sm:px-3"
            onClick={handleExportTemplate}
          >
            <Download className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            <span>Template</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="flex-1 sm:flex-initial text-xs sm:text-sm px-2.5 sm:px-3"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            <span>Import</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="flex-1 sm:flex-initial text-xs sm:text-sm px-2.5 sm:px-3"
            onClick={handleExportCustomers}
          >
            <Download className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            <span>Export</span>
          </Button>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full sm:w-auto text-xs sm:text-sm"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkDeleteMutation.isPending}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete selected ({selectedIds.length})
            </Button>
          )}
          
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm px-3 sm:px-4">
                <Plus className="w-4 h-4 mr-1.5" />
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
              <div className="grid gap-3 py-2 sm:py-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
                  <Label htmlFor="name" className="sm:text-right text-xs sm:text-sm">
                    Name
                  </Label>
                  <Input
                    id="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="John Doe"
                    className="sm:col-span-3 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
                  <Label htmlFor="phone" className="sm:text-right text-xs sm:text-sm">
                    Phone
                  </Label>
                  <Input
                    id="phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="60123456789"
                    className="sm:col-span-3 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
                  <Label htmlFor="label" className="sm:text-right text-xs sm:text-sm">
                    Label
                  </Label>
                  <Input
                    id="label"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="VIP, Retail, etc."
                    className="sm:col-span-3 text-sm"
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
        <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-2.5 max-w-lg w-full">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search customers..."
                className="pl-9 bg-slate-50 dark:bg-slate-950 w-full text-sm"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </div>
            <Select value={selectedLabel} onValueChange={setSelectedLabel}>
              <SelectTrigger className="w-full sm:w-44 bg-slate-50 dark:bg-slate-950 text-sm">
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
          <div className="text-xs sm:text-sm font-medium text-slate-500 flex items-center justify-between sm:justify-end gap-2">
            <span>Total Records: {totalCount}</span>
            {selectedIds.length > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">• {selectedIds.length} selected</span>}
          </div>
        </div>

        {/* Mobile View Header / Select All */}
        <div className="md:hidden flex items-center justify-between px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(e) => toggleAllVisible(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Select all visible ({customers.length})</span>
          </label>
        </div>

        {/* Mobile Card List View */}
        <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
            </div>
          ) : customers.length ? (
            customers.map((customer) => {
              const isSelected = selectedIds.includes(customer.id)
              return (
                <div
                  key={customer.id}
                  className={`p-3.5 space-y-2.5 transition-colors ${
                    isSelected ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'hover:bg-slate-50/50 dark:hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelected(customer.id, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                        aria-label={`Select ${customer.name}`}
                      />
                      <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate">
                        {customer.name}
                      </span>
                      {customer.label && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 shrink-0">
                          {customer.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <EditCustomerButton customer={customer} updateCustomerMutation={updateCustomerMutation} />
                      <DeleteCustomerButton id={customer.id} removeCustomerMutation={removeCustomerMutation} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pl-6">
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {customer.phone_number}
                    </span>
                    <span>
                      {dayjs(customer.created_at).format('DD/MM/YY h:mm A')}
                    </span>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">
              No customers found. Try adding one!
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
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

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs sm:text-sm text-slate-500 text-center sm:text-left">
            Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1} • {totalCount} total
          </div>
          <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => {
                setPageIndex(0)
                table.setPageSize(Number(v))
              }}
            >
              <SelectTrigger className="w-24 text-xs sm:text-sm sm:w-28"><SelectValue /></SelectTrigger>
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
              className="text-xs sm:text-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm"
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
