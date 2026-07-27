import React, { useRef } from 'react'
import {
  Plus,
  Trash2,
  Upload,
  Eye,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Save,
  FileImage,
  Film,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TemplateDraft, ButtonDraft, AttachedFile } from '../types'
import {
  filePreviewUrl,
  createEmptyTemplateDraft,
  formatFileSize,
  MEDIA_REQUIREMENTS,
  resolveDraftMediaList,
} from '../types'

interface Step2Props {
  templates?: TemplateDraft[]
  templateDrafts?: TemplateDraft[]
  setTemplates?: React.Dispatch<React.SetStateAction<TemplateDraft[]>>
  setTemplateDrafts?: React.Dispatch<React.SetStateAction<TemplateDraft[]>>
  activeTmplIdx?: number
  activeTemplateIndex?: number
  setActiveTmplIdx?: (idx: number) => void
  setActiveTemplateIndex?: (idx: number) => void
  userFiles?: any[]
  uploadFileMutation?: any
  deleteFileMutation?: any
  handleTemplateFilesUpload?: (fileList: FileList | File[]) => void
  onPreview?: () => void
  onBack?: () => void
  onNext?: () => void
  onSaveDraft?: () => void
  isSavingDraft?: boolean
}

export function Step2MessageTemplates({
  templates: propsTemplates,
  templateDrafts: propsTemplateDrafts,
  setTemplates: propsSetTemplates,
  setTemplateDrafts: propsSetTemplateDrafts,
  activeTmplIdx: propsActiveIdx,
  activeTemplateIndex: propsActiveTemplateIndex,
  setActiveTmplIdx: propsSetActiveIdx,
  setActiveTemplateIndex: propsSetActiveTemplateIndex,
  userFiles,
  uploadFileMutation,
  handleTemplateFilesUpload,
  onPreview,
  onBack,
  onNext,
  onSaveDraft,
  isSavingDraft,
}: Step2Props) {
  // Resolve templates list safely with fallback to prevent undefined errors
  const templatesList = propsTemplates || propsTemplateDrafts || [createEmptyTemplateDraft()]
  const setTemplatesFn = propsSetTemplates || propsSetTemplateDrafts || (() => {})
  const activeIdx = propsActiveIdx ?? propsActiveTemplateIndex ?? 0
  const setActiveIdxFn = propsSetActiveIdx || propsSetActiveTemplateIndex || (() => {})

  const safeActiveIndex = Math.min(Math.max(0, activeIdx), templatesList.length - 1)
  const currentTmpl = templatesList[safeActiveIndex] || templatesList[0] || createEmptyTemplateDraft()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpdateCurrent = (updates: Partial<TemplateDraft>) => {
    setTemplatesFn((prev) => {
      const list = prev && prev.length ? prev : templatesList
      const updated = [...list]
      updated[safeActiveIndex] = { ...updated[safeActiveIndex], ...updates }
      return updated
    })
  }

  const handleAddTemplate = () => {
    setTemplatesFn((prev) => {
      const list = prev && prev.length ? prev : templatesList
      return [...list, createEmptyTemplateDraft()]
    })
    setActiveIdxFn(templatesList.length)
  }

  const handleRemoveTemplate = (idx: number) => {
    if (templatesList.length <= 1) {
      toast.error('At least one template sequence is required.')
      return
    }
    const updated = templatesList.filter((_, i) => i !== idx)
    setTemplatesFn(updated)
    setActiveIdxFn(Math.max(0, idx - 1))
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
    const files = e.target.files
    if (!files || files.length === 0) return

    const currentMediaType = currentTmpl.messageType === 'buttons' ? currentTmpl.buttonMediaType : currentTmpl.messageType

    if (handleTemplateFilesUpload) {
      handleTemplateFilesUpload(files)
    } else if (uploadFileMutation) {
      const file = files[0]
      uploadFileMutation.mutate(
        { file, type: currentMediaType },
        {
          onSuccess: (data: any) => {
            const fileObj = data?.file || data
            const attached: AttachedFile = {
              id: fileObj.id || fileObj._id,
              url: filePreviewUrl(fileObj),
              name: fileObj.file_name || file.name,
              type: currentMediaType,
              size: file.size || fileObj.file_size || fileObj.size,
            }
            handleUpdateCurrent({
              fileId: attached.id,
              previewUrl: attached.url,
              attachedFiles: [...(currentTmpl.attachedFiles || []), attached],
            })
          },
        }
      )
    }
  }

  const handleRemoveAttachedFile = (fileId?: string, index?: number) => {
    const list = currentTmpl.attachedFiles || []
    let updated: AttachedFile[] = []
    if (fileId) {
      updated = list.filter((f) => f.id !== fileId)
    } else if (typeof index === 'number') {
      updated = list.filter((_, i) => i !== index)
    }
    handleUpdateCurrent({
      attachedFiles: updated,
      fileId: updated[0]?.id || '',
      previewUrl: updated[0]?.url || null,
    })
  }

  // Active media type calculation
  const currentMediaType =
    currentTmpl.messageType === 'buttons' ? currentTmpl.buttonMediaType : currentTmpl.messageType
  const isMediaActive = ['image', 'video', 'document'].includes(currentMediaType)
  const mediaReq = isMediaActive ? MEDIA_REQUIREMENTS[currentMediaType] : null

  // Resolved list of files attached to current template variant
  const attachedMediaList = resolveDraftMediaList(currentTmpl, userFiles)

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
      <CardContent className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center font-bold">
              2
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">Message Templates</h3>
              <p className="text-xs text-slate-500">Configure message variants for sequence blasting.</p>
            </div>
          </div>

          {onPreview && (
            <Button type="button" variant="outline" size="sm" onClick={onPreview} className="text-xs gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Preview WhatsApp View
            </Button>
          )}
        </div>

        {/* Template Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          {templatesList.map((tmpl, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveIdxFn(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  safeActiveIndex === idx
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Variant #{idx + 1} ({tmpl.messageType || 'text'})
              </button>
              {templatesList.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveTemplate(idx)}
                  className="text-slate-400 hover:text-red-500 p-1"
                  title="Remove Variant"
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
        <div className="space-y-5 max-w-2xl">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Message Type</Label>
            <Select
              value={currentTmpl.messageType || 'text'}
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

          {currentTmpl.messageType === 'buttons' && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Header Media Type (Optional)</Label>
              <Select
                value={currentTmpl.buttonMediaType || 'none'}
                onValueChange={(val) => handleUpdateCurrent({ buttonMediaType: val })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Header Media (Text Only)</SelectItem>
                  <SelectItem value="image">Image Header</SelectItem>
                  <SelectItem value="video">Video Header</SelectItem>
                  <SelectItem value="document">Document Header</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Media Requirements & Upload Section */}
          {isMediaActive && mediaReq && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {currentMediaType === 'image' && <FileImage className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                  {currentMediaType === 'video' && <Film className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                  {currentMediaType === 'document' && <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{mediaReq.title}</h4>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full">
                  Preferred Size: {mediaReq.preferredSizeText}
                </span>
              </div>

              {/* Requirement details grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-white dark:bg-slate-950 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80">
                <div>
                  <span className="text-slate-400 font-medium">Supported Formats: </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{mediaReq.formats}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Recommendation: </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{mediaReq.recommendation}</span>
                </div>
                <div className="col-span-1 sm:col-span-2 text-slate-500 flex items-center gap-1.5 pt-1">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{mediaReq.notes}</span>
                </div>
              </div>

              {/* Upload Action */}
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  accept={
                    currentMediaType === 'image'
                      ? 'image/*'
                      : currentMediaType === 'video'
                      ? 'video/*'
                      : '.pdf,.doc,.docx,.xls,.xlsx,.txt'
                  }
                  onChange={handleFileUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadFileMutation?.isPending}
                  className="text-xs gap-1.5 bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 hover:bg-slate-50"
                >
                  {uploadFileMutation?.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  Select & Upload {currentMediaType.toUpperCase()} File(s)
                </Button>
                <span className="text-[11px] text-slate-400">
                  Multiple files supported
                </span>
              </div>

              {/* Attached Media List with File Size & Preferred Match Badge */}
              {attachedMediaList.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                  <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Attached Files ({attachedMediaList.length})
                  </Label>

                  <div className="space-y-2">
                    {attachedMediaList.map((fileItem, fileIdx) => {
                      const formattedSize = formatFileSize(fileItem.size)
                      const isExceedingPreferred =
                        fileItem.size !== undefined && fileItem.size > mediaReq.preferredMaxBytes
                      const isExceedingHard =
                        fileItem.size !== undefined && fileItem.size > mediaReq.hardMaxBytes

                      return (
                        <div
                          key={fileItem.id || fileIdx}
                          className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* File Thumbnail or Icon */}
                            {currentMediaType === 'image' && fileItem.url ? (
                              <img
                                src={fileItem.url}
                                alt={fileItem.name || 'Image'}
                                className="w-10 h-10 object-cover rounded-md border border-slate-200 dark:border-slate-800 bg-slate-100 shrink-0"
                              />
                            ) : currentMediaType === 'video' ? (
                              <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                <Film className="w-5 h-5" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                            )}

                            <div className="min-w-0 space-y-0.5">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                {fileItem.name || `Attached ${currentMediaType} #${fileIdx + 1}`}
                              </p>

                              <div className="flex flex-wrap items-center gap-2">
                                {/* File Size Display */}
                                {formattedSize ? (
                                  <span className="text-[11px] font-mono font-medium text-slate-600 dark:text-slate-400">
                                    Size: {formattedSize}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">File uploaded</span>
                                )}

                                {/* Match Preferred File Size Badge */}
                                {fileItem.size !== undefined ? (
                                  isExceedingHard ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300 flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" /> Exceeds Max Limit ({formatFileSize(mediaReq.hardMaxBytes)})
                                    </span>
                                  ) : isExceedingPreferred ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" /> {formattedSize} (Exceeds preferred limit)
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> {formattedSize} (Matches preferred size)
                                    </span>
                                  )
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> File Attached ✓
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveAttachedFile(fileItem.id, fileIdx)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                            title="Remove attachment"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-medium">Message Text / Caption</Label>
            <Textarea
              value={currentTmpl.template || ''}
              onChange={(e) => handleUpdateCurrent({ template: e.target.value })}
              rows={4}
              placeholder="Type your message here... Use {{name}} or {{phone}} for dynamic variables."
              className="text-xs font-mono"
            />
          </div>

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
              Next: Sending Sessions
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

