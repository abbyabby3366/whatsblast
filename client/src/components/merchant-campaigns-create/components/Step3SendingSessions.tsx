import React from 'react'
import { Check, Smartphone, AlertCircle, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

interface Step3Props {
  sessionMode: 'AUTO' | 'SPECIFIC'
  setSessionMode: (mode: 'AUTO' | 'SPECIFIC') => void
  selectedSessions: string[]
  setSelectedSessions: React.Dispatch<React.SetStateAction<string[]>>
  connectedSessions: any[]
}

export function Step3SendingSessions({
  sessionMode,
  setSessionMode,
  selectedSessions,
  setSelectedSessions,
  connectedSessions,
}: Step3Props) {
  const toggleSession = (id: string) => {
    setSelectedSessions((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            3
          </div>
          <div>
            <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">Sending Sessions</h3>
            <p className="text-xs text-slate-500">Choose which WhatsApp accounts to use for sending this blast.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div 
            onClick={() => setSessionMode('AUTO')}
            className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
              sessionMode === 'AUTO'
                ? 'bg-emerald-50/50 border-emerald-500 dark:bg-emerald-950/30'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <input
              type="radio"
              name="sessionMode"
              id="mode-auto"
              checked={sessionMode === 'AUTO'}
              onChange={() => setSessionMode('AUTO')}
              className="mt-1 accent-emerald-600 cursor-pointer"
            />
            <div className="space-y-1">
              <Label htmlFor="mode-auto" className="font-semibold text-sm cursor-pointer">
                Automatic Distribution (All Connected Sessions)
              </Label>
              <p className="text-xs text-slate-500">
                Automatically rotate and balance sending load across all currently connected WhatsApp sessions ({connectedSessions.length} available).
              </p>
            </div>
          </div>

          <div 
            onClick={() => setSessionMode('SPECIFIC')}
            className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
              sessionMode === 'SPECIFIC'
                ? 'bg-emerald-50/50 border-emerald-500 dark:bg-emerald-950/30'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <input
              type="radio"
              name="sessionMode"
              id="mode-specific"
              checked={sessionMode === 'SPECIFIC'}
              onChange={() => setSessionMode('SPECIFIC')}
              className="mt-1 accent-emerald-600 cursor-pointer"
            />
            <div className="space-y-1 w-full">
              <Label htmlFor="mode-specific" className="font-semibold text-sm cursor-pointer">
                Select Specific WhatsApp Sessions
              </Label>
              <p className="text-xs text-slate-500">
                Manually pick specific WhatsApp numbers for this campaign.
              </p>

              {sessionMode === 'SPECIFIC' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3">
                  {connectedSessions.length === 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.location.href = '/merchant/whatsapp-sessions'
                      }}
                      className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs col-span-2 flex items-center justify-between cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-all text-left group"
                      title="Failed to find connected session. Click to redirect to Connect WhatsApp page"
                    >
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>No connected WhatsApp sessions found. Failed to connect session.</span>
                      </div>
                      <span className="font-semibold underline text-amber-700 dark:text-amber-300 shrink-0 flex items-center gap-1 group-hover:text-amber-800">
                        Connect WhatsApp <ExternalLink className="w-3 h-3" />
                      </span>
                    </button>
                  ) : (
                    connectedSessions.map((s: any) => {
                      const sId = s.id || s.session_id
                      const isSelected = selectedSessions.includes(sId)
                      return (
                        <div
                          key={sId}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleSession(sId)
                          }}
                          className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-emerald-600" />
                            <span className="font-mono text-xs font-semibold">{s.phone_number || s.alias || sId}</span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-emerald-600" />}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
