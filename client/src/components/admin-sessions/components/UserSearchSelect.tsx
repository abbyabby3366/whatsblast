import { useState, useRef, useEffect } from 'react'
import { Search, Check, ChevronsUpDown, User as UserIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { User } from '../types'

interface UserSearchSelectProps {
  users: User[]
  value: string
  onChange: (val: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function UserSearchSelect({
  users,
  value,
  onChange,
  placeholder = 'Select merchant or owner...',
  className = '',
  disabled = false,
}: UserSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const getUserId = (u: User) => u.id || (u as any)._id?.toString() || (u as any)._id || ''

  const selectedUser = users.find((u) => getUserId(u) === value)

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true
    const s = search.toLowerCase().trim()
    const phone = (u.phone_number || '').toLowerCase()
    const uid = (getUserId(u) || '').toLowerCase()
    const role = (u.role || '').toLowerCase()
    return phone.includes(s) || uid.includes(s) || role.includes(s)
  })

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-xs ring-offset-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus:ring-slate-300 cursor-pointer"
      >
        <span className="truncate flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
          <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {selectedUser ? (
            <span>
              {selectedUser.phone_number || getUserId(selectedUser)}
              <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-normal">({selectedUser.role || 'user'})</span>
            </span>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">{placeholder}</span>
          )}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-2" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-hidden rounded-md border border-slate-200 bg-white text-slate-950 shadow-md dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50">
          {/* Search Bar */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 relative">
            <Search className="absolute left-4 top-3.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              type="text"
              autoFocus
              placeholder="Search by phone number or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700"
            />
          </div>

          {/* User List */}
          <div className="max-h-44 overflow-y-auto p-1 space-y-0.5">
            {filteredUsers.length === 0 ? (
              <div className="py-3 text-center text-xs text-slate-500 dark:text-slate-400">No merchant or user found.</div>
            ) : (
              filteredUsers.map((u) => {
                const uid = getUserId(u)
                const isSelected = uid === value

                return (
                  <div
                    key={uid}
                    onClick={() => {
                      onChange(uid)
                      setIsOpen(false)
                      setSearch('')
                    }}
                    className={`flex items-center justify-between px-2.5 py-1.5 text-xs rounded-sm cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-900 font-medium dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="truncate">{u.phone_number || uid}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-normal">
                        {u.role || 'user'}
                      </span>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
