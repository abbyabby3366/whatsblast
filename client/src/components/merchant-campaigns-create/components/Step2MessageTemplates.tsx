import React, { useRef, useState } from 'react'
import { Plus, Trash2, Upload, FileText, Image as ImageIcon, Video, File, HelpCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { TemplateDraft, ButtonDraft } from '../types'
import { isTemplateTextRequired, filePreviewUrl, normalizeButtonType, createEmptyTemplateDraft } from '../types'

interface Step2Props {
  templates: TemplateDraft[]
  setTemplates: React.Dispatch<React.SetStateAction<TemplateDraft[]>>
  activeTmplIdx: number
  setActiveTmplIdx: (idx: number) => void
  userFiles: any[]
  uploadFileMutation: any
  deleteFileMutation: any
  onPreview: () => void
}

export function Step2MessageTemplates({
  templates,
  setTemplates,
  activeTmplIdx,
  setActiveTmplIdx,
  userFiles,
  uploadFileMutation,
  deleteFileMutation,
  onPreview,
}: Step2Props) {
  const currentTmpl = templates[activeTmplIdx] || templates[0]
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpdateCurrent = (updates: Partial<TemplateDraft>) => {
    setTemplates((prev) => {
      const updated = [...prev]
      updated[activeTmplIdx] = { ...updated[activeTmplIdx], ...updates }
      return updated
    })
  }

  const handleAddTemplate = () => {
    setTemplates((prev) => [...prev, createEmptyTemplateDraft()])
    setActiveTmplIdx(templates.length)
  }

  const handleRemoveTemplate = (idx: number) => {
    if (templates.length <= 1) {
      toast.error('At least one template sequence is required.')
      return
    }
    const updated = templates.filter((_, i) => i !== idx)
    setTemplates(updated)
    setActiveTmplIdx(Math.max(0, idx - 1))
  }

  const handleAddButton = () => {
    if ((currentTmpl.buttons || []).length >= 3) {
      toast.error('Maximum of 3 buttons allowed per template.')
      return
    }
    const newBtn: ButtonDraft = {
      id: String(Date.now()),
      type: 'reply',
      display_text: 'Click Here',
    }
    handleUpdateCurrent({ buttons: [...(currentTmpl.buttons || []), newBtn] })
  }

  const handleUpdateButton = (btnId: string, updates: Partial<ButtonDraft>) => {
    const updated = (currentTmpl.buttons || []).map((b) => (b.id === btnId ? { ...b, ...updates } : b))
    handleUpdateCurrent({ buttons: updated })
  }

  const handleRemoveButton = (btnId: string) => {
    const updated = (currentTmpl.buttons || []).filter((b) => b.id !== btnId)
    handleUpdateCurrent({ buttons: updated })
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadFileMutation.mutate(file, {
      onSuccess: (data: any) => {
        const fileObj = data?.file || data
        handleUpdateCurrent({
          fileId: fileObj.id || fileObj._id,
          previewUrl: filePreviewUrl(fileObj),
        })
      },
    })
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              2
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">Message Templates</h3>
              <p className="text-xs text-slate-500">Configure message variants for sequence blasting.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onPreview} className="text-xs">
            Preview WhatsApp View
          </Button>
        </div>

        {/* Template Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          {templates.map((tmpl, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTmplIdx(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTmplIdx === idx
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                Variant #{idx + 1} ({tmpl.messageType})
              </button>
              {templates.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveTemplate(idx)}
                  className="text-slate-400 hover:text-red-500 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={handleAddTemplate} className="h-8 text-xs gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Variant
          </Button>
        </div>

        {/* Template Editor */}
        <div className="space-y-4 max-w-2xl">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Message Type</Label>
            <Select
              value={currentTmpl.messageType}
              onValueChange={(val) => handleUpdateCurrent({ messageType: val })}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text Only</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="buttons">Interactive Buttons</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Message Text / Caption</Label>
            <Textarea
              value={currentTmpl.template}
              onChange={(e) => handleUpdateCurrent({ template: e.target.value })}
              rows={4}
              placeholder="Type your message here... Use {{name}} or {{phone}} for dynamic variables."
              className="text-xs font-mono"
            />
          </div>

          {['image', 'video', 'document'].includes(currentTmpl.messageType) && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Media Attachment</Label>
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadFileMutation.isPending}
                  className="text-xs gap-1.5"
                >
                  {uploadFileMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload Media File
                </Button>
                {currentTmpl.previewUrl && (
                  <span className="text-xs text-emerald-600 font-medium truncate max-w-xs">
                    File Attached ✓
                  </span>
                )}
              </div>
            </div>
          )}

          {currentTmpl.messageType === 'buttons' && (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Interactive Buttons (Max 3)</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddButton} className="h-7 text-xs gap-1">
                  <Plus className="w-3 h-3" /> Add Button
                </Button>
              </div>

              {(currentTmpl.buttons || []).map((btn) => (
                <div key={btn.id} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={btn.type}
                      onValueChange={(val: any) => handleUpdateButton(btn.id, { type: val })}
                    >
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reply">Quick Reply</SelectItem>
                        <SelectItem value="url">URL Link</SelectItem>
                        <SelectItem value="call">Call Phone</SelectItem>
                        <SelectItem value="copy">Copy Code</SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      placeholder="Button Label"
                      value={btn.display_text}
                      onChange={(e) => handleUpdateButton(btn.id, { display_text: e.target.value })}
                      className="h-8 text-xs flex-1"
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveButton(btn.id)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {btn.type !== 'reply' && (
                    <Input
                      placeholder={
                        btn.type === 'url'
                          ? 'https://example.com'
                          : btn.type === 'call'
                          ? '60123456789'
                          : 'PROMO2026'
                      }
                      value={btn.value || ''}
                      onChange={(e) => handleUpdateButton(btn.id, { value: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
