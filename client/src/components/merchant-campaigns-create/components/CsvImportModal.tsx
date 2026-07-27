import React, { useRef } from 'react'
import * as XLSX from 'xlsx'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CsvImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (phones: string[]) => void
}

export function CsvImportModal({ isOpen, onClose, onImport }: CsvImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ phone_number: '60123456789' }, { phone_number: '60198765432' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, 'recipients_template.csv', { bookType: 'csv' })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json<any>(ws)

        const phones: string[] = []
        for (const row of data) {
          const raw = row.phone_number || row.phone || row['Phone Number'] || row['Phone'] || row['phone'] || row['Mobile']
          if (raw) {
            const sanitized = String(raw).replace(/[^\d+]/g, '').trim()
            if (sanitized) phones.push(sanitized)
          }
        }

        if (phones.length === 0) {
          toast.error('No valid phone numbers found in CSV.')
          return
        }

        onImport(phones)
        toast.success(`Successfully imported ${phones.length} recipient(s).`)
        onClose()
      } catch (err) {
        toast.error('Failed to parse CSV file.')
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsBinaryString(file)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Recipients CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file containing phone numbers in a column named <code>phone_number</code> or <code>phone</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <input
            type="file"
            accept=".csv, .xlsx"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-xl p-8 text-center cursor-pointer transition-colors space-y-2 bg-slate-50/50 dark:bg-slate-900/50"
          >
            <Upload className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Click to select CSV or XLSX file
            </p>
            <p className="text-xs text-slate-400">
              Files should contain a column titled phone_number
            </p>
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
              Download CSV Template
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
