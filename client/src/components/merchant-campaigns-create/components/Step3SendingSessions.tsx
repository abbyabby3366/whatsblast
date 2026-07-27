import { Check, Smartphone, AlertCircle, ExternalLink, Flame, ArrowLeft, ArrowRight, Save, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface Step3Props {
  sessionMode: 'ALL' | 'SPECIFIC' | 'AUTO' | string
  setSessionMode: (mode: any) => void
  selectedSessions: string[]
  setSelectedSessions: React.Dispatch<React.SetStateAction<string[]>>
  connectedSessions?: any[]
  availableSessions?: any[]
  isLoadingSessions?: boolean
  retryOnFailure?: boolean
  setRetryOnFailure?: (v: boolean) => void
  enableWarmup?: boolean
  setEnableWarmup?: (v: boolean) => void
  onNext?: () => void
  onBack?: () => void
  onSaveDraft?: () => void
  isSavingDraft?: boolean
}

export function Step3SendingSessions({
  sessionMode,
  setSessionMode,
  selectedSessions,
  setSelectedSessions,
  connectedSessions,
  availableSessions,
  isLoadingSessions: _isLoadingSessions,
  enableWarmup = true,
  setEnableWarmup,
  onNext,
  onBack,
  onSaveDraft,
  isSavingDraft,
}: Step3Props) {
  const sessions = connectedSessions || availableSessions || []

  const toggleSession = (id: string) => {
    setSelectedSessions((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const isAutoMode = sessionMode === 'ALL' || sessionMode === 'AUTO'

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            3
          </div>
          <div>
            <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">Sending Sessions</h3>
            <p className="text-xs text-slate-500">Choose which WhatsApp accounts to use for sending this blast and configure warmup protection.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-3">
            <div 
              onClick={() => setSessionMode('ALL')}
              className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
                isAutoMode
                  ? 'bg-emerald-50/50 border-emerald-500 dark:bg-emerald-950/30'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <input
                type="radio"
                name="sessionMode"
                id="mode-auto"
                checked={isAutoMode}
                onChange={() => setSessionMode('ALL')}
                className="mt-1 accent-emerald-600 cursor-pointer"
              />
              <div className="space-y-1">
                <Label htmlFor="mode-auto" className="font-semibold text-sm cursor-pointer">
                  Automatic Distribution (All Connected Sessions)
                </Label>
                <p className="text-xs text-slate-500">
                  Automatically rotate and balance sending load across all currently connected WhatsApp sessions ({sessions.length} available).
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
                    {sessions.length === 0 ? (
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
                      sessions.map((s: any) => {
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

          {/* Warmup Protection */}
          {setEnableWarmup && (
            <div className="flex items-start space-x-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 bg-slate-50/50 dark:bg-slate-900/50">
              <input
                type="checkbox"
                id="warmup-mode"
                checked={enableWarmup}
                onChange={(e) => setEnableWarmup(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
              />
              <div className="space-y-1">
                <Label htmlFor="warmup-mode" className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  Enable Account Warmup Protection
                </Label>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Gradually ramps up sending frequency to reduce WhatsApp account restriction risks.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation Controls */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            {onBack && (
              <Button type="button" variant="outline" size="sm" onClick={onBack} className="text-xs gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </Button>
            )}
            {onSaveDraft && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSaveDraft}
                disabled={isSavingDraft}
                className="text-xs gap-1.5"
              >
                {isSavingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Draft
              </Button>
            )}
          </div>

          {onNext && (
            <Button
              type="button"
              onClick={onNext}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-5 h-9 gap-1.5 shadow-xs"
            >
              Next: Recipients
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
