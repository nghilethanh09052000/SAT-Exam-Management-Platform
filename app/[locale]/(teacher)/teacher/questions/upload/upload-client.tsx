'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ProgressStepper } from '@/components/ui/progress-stepper'
import { CreateFlowShell } from '@/components/ui/create-flow-shell'
import {
  QuestionFormEditor,
  type EditableDifficulty,
  type EditableOption,
  type EditableQuestionType,
} from '@/components/questions/question-form-editor'
import { getEditorText } from '@/components/questions/rich-text-editor'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tag {
  id: string
  subject: string
  name: string
}

interface ParsedOption {
  label: string
  content: string
  is_correct: boolean
  order: number
}

interface ReviewQuestion {
  content: string
  type: 'multiple_choice' | 'short_answer'
  content_hash: string
  image_url: string | null
  module: string
  options?: ParsedOption[]
  accepted_answers?: string[]
  is_duplicate: boolean
  // Teacher fills these in the review step
  tag_id: string | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  teacher_explanation: string | null
  category: string | null
  skip: boolean
  replace: boolean
}

interface ParseError {
  line?: number
  message: string
}

type QuestionImportStatus = {
  id: string
  status: 'processing' | 'parsed' | 'success' | 'partial_success' | 'failed'
  total_records: number
  success_count: number
  failure_count: number
  error_message: string | null
  parsed_payload?: {
    questions?: Array<Omit<ReviewQuestion, 'skip' | 'replace' | 'tag_id' | 'difficulty' | 'teacher_explanation' | 'category'> & {
      difficulty?: string | null
      tag_id?: string | null
      teacher_explanation?: string | null
      category?: string | null
    }>
    save_disabled_reason?: string | null
  } | null
  parse_errors?: ParseError[] | null
  save_result?: {
    saved?: number
    savedIds?: string[]
    errors?: Array<{ content: string; error: string }>
  } | null
  save_errors?: Array<{ content: string; error: string }> | null
}

const TERMINAL_IMPORT_STATUSES = new Set(['parsed', 'success', 'partial_success', 'failed'])

async function waitForQuestionImport(
  importId: string,
  isDone: (status: QuestionImportStatus) => boolean = (status) => TERMINAL_IMPORT_STATUSES.has(status.status)
) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const res = await fetch(`/api/question-imports/${importId}`, { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok || json.error) {
      throw new Error(json.error ?? 'Không thể kiểm tra trạng thái import.')
    }

    const status = json.data as QuestionImportStatus
    if (isDone(status)) return status
    await new Promise((resolve) => setTimeout(resolve, attempt < 15 ? 2000 : 5000))
  }

  throw new Error('Import vẫn đang xử lý. Vui lòng thử kiểm tra lại sau.')
}

function toReviewQuestions(status: QuestionImportStatus): ReviewQuestion[] {
  return (status.parsed_payload?.questions ?? []).map((q) => ({
    ...q,
    tag_id: q.tag_id ?? null,
    difficulty: (q.difficulty as ReviewQuestion['difficulty']) ?? null,
    teacher_explanation: q.teacher_explanation ?? null,
    category: q.category ?? null,
    skip: false,
    replace: false,
  }))
}

function generateReviewHash(question: ReviewQuestion): string {
  const correctAnswer = question.type === 'multiple_choice'
    ? question.options?.find((opt) => opt.is_correct)?.content ?? ''
    : question.accepted_answers?.join('|') ?? ''
  const value = `${getEditorText(question.content)}${getEditorText(correctAnswer)}`
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i)
    hash |= 0
  }
  return `review-${Math.abs(hash).toString(16)}`
}

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ProgressStepper
      currentStep={step}
      steps={[
        { n: 1, label: 'Tải lên file' },
        { n: 2, label: 'Xem xét câu hỏi' },
        { n: 3, label: 'Hoàn thành' },
      ]}
    />
  )
}

// ─── Step 1: Upload ──────────────────────────────────────────────────────────

function UploadStep({
  onParsed,
}: {
  onParsed: (questions: ReviewQuestion[], filename: string, uploadImportId: string | null) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parseErrors, setParseErrors] = useState<ParseError[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.docx') && !file.name.endsWith('.pdf')) {
      setError('Chỉ chấp nhận file .docx hoặc .pdf.')
      return
    }
    setError(null)
    setParseErrors([])
    setLoading(true)

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/questions/parse', { method: 'POST', body: form })
      const json = await res.json()

      if (!res.ok || json.error) {
        setError(json.error ?? 'Lỗi phân tích file.')
        if (json.parseErrors?.length) setParseErrors(json.parseErrors)
        return
      }

      const importId = json.data.upload_import_id as string | undefined
      if (!importId) {
        setError('Không nhận được mã import từ server.')
        return
      }

      const status = await waitForQuestionImport(importId, (s) => s.status === 'parsed' || s.status === 'failed')
      if (status.status === 'failed') {
        setError(status.error_message ?? 'Lỗi phân tích file.')
        if (status.parse_errors?.length) setParseErrors(status.parse_errors)
        return
      }

      onParsed(toReviewQuestions(status), file.name, importId)
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return (
    <div className="max-w-xl">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !loading && inputRef.current?.click()}
        className={[
          'flex flex-col items-center justify-center gap-4 rounded-[12px] border-2 border-dashed cursor-pointer transition-colors py-16 px-8',
          dragging
            ? 'border-primary bg-blue-50'
            : 'border-ash-light hover:border-primary hover:bg-surface-card',
          loading ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        {loading ? (
          <>
            <svg className="animate-spin w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-mute-light">Đang phân tích file...</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-[12px] bg-surface-card flex items-center justify-center">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-primary">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-medium text-ink">Kéo thả file vào đây</p>
              <p className="text-sm text-mute-light mt-1">hoặc nhấn để chọn file .docx/.pdf (tối đa 50MB)</p>
            </div>
          </>
        )}
      </div>

      {/* Errors */}
      {error && (
        <div className="mt-4 rounded-[8px] bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-warning mb-2">{error}</p>
          {parseErrors.length > 0 && (
            <ul className="text-xs text-warning space-y-1 list-disc list-inside">
              {parseErrors.map((e, i) => (
                <li key={i}>
                  {e.line ? `Dòng ${e.line}: ` : ''}{e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Format guide */}
      <div className="mt-6 rounded-[8px] bg-surface-card border border-hairline-light p-4 space-y-2">
        <p className="text-xs font-semibold text-ink">Yêu cầu định dạng file</p>
        <ul className="text-xs text-mute-light space-y-1 list-disc list-inside">
          <li>Heading module: <code className="bg-surface-soft px-1 rounded">**Module 1: Reading and Writing**</code></li>
          <li>Đầu câu hỏi: <code className="bg-surface-soft px-1 rounded">**Question N**</code></li>
          <li>Đáp án đúng: in đậm trong phần Options</li>
          <li>Short answer: dùng <code className="bg-surface-soft px-1 rounded">- **Answer:**</code></li>
        </ul>
      </div>
    </div>
  )
}

// ─── Step 2: Review ──────────────────────────────────────────────────────────

function ReviewStep({
  questions,
  filename,
  uploadImportId,
  tags,
  onSaved,
  onBack,
}: {
  questions: ReviewQuestion[]
  filename: string
  uploadImportId: string | null
  tags: Tag[]
  onSaved: (saved: number) => void
  onBack: () => void
}) {
  const [items, setItems] = useState<ReviewQuestion[]>(questions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const rwTags = tags.filter((t) => t.subject === 'reading_writing')
  const mathTags = tags.filter((t) => t.subject === 'math')

  function update(idx: number, patch: Partial<ReviewQuestion>) {
    setItems((prev) => prev.map((q, i) => {
      if (i !== idx) return q
      const next = { ...q, ...patch }
      const changedAnswerShape = Boolean(patch.content || patch.options || patch.accepted_answers || patch.type)
      return {
        ...next,
        content_hash: changedAnswerShape ? generateReviewHash(next) : next.content_hash,
        is_duplicate: changedAnswerShape ? false : next.is_duplicate,
      }
    }))
  }

  const toSave = items.filter((q) => !q.skip)

  async function handleSave() {
    for (const q of toSave) {
      if (!getEditorText(q.content)) {
        setError('Vui lòng nhập nội dung cho tất cả câu hỏi được lưu.')
        return
      }
      if (q.type === 'multiple_choice') {
        if (!q.options?.some((opt) => opt.is_correct) || !q.options.every((opt) => getEditorText(opt.content))) {
          setError('Vui lòng hoàn thiện đáp án trắc nghiệm cho tất cả câu hỏi được lưu.')
          return
        }
      }
      if (q.type === 'short_answer' && !q.accepted_answers?.some((answer) => answer.trim())) {
        setError('Vui lòng nhập đáp án cho tất cả câu hỏi điền đáp án được lưu.')
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/questions/bulk-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: items, upload_import_id: uploadImportId ?? undefined }),
      })
      const json = await res.json()
      if (!res.ok && !json.data) {
        setError(json.error ?? 'Không thể lưu câu hỏi.')
        return
      }
      const importId = json.data?.upload_import_id ?? uploadImportId
      if (!importId) {
        setError('Không nhận được mã import để kiểm tra trạng thái lưu.')
        return
      }

      const status = await waitForQuestionImport(importId, (s) => ['success', 'partial_success', 'failed'].includes(s.status))
      if (status.status === 'failed') {
        setError(status.error_message ?? 'Không thể lưu câu hỏi.')
        return
      }

      onSaved(status.save_result?.saved ?? status.success_count ?? 0)
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  function updateType(idx: number, type: EditableQuestionType) {
    const current = items[idx]
    update(idx, {
      type,
      options: type === 'multiple_choice'
        ? (current.options?.length ? current.options : [
          { label: 'A', content: '', is_correct: true, order: 1 },
          { label: 'B', content: '', is_correct: false, order: 2 },
          { label: 'C', content: '', is_correct: false, order: 3 },
          { label: 'D', content: '', is_correct: false, order: 4 },
        ])
        : current.options,
      accepted_answers: type === 'short_answer' ? (current.accepted_answers?.length ? current.accepted_answers : ['']) : current.accepted_answers,
    })
  }

  function updateOptions(idx: number, options: EditableOption[]) {
    update(idx, {
      options: options.map((option, optionIdx) => ({
        label: option.label,
        content: option.content,
        is_correct: option.is_correct,
        order: optionIdx + 1,
      })),
    })
  }

  function tagSelector(q: ReviewQuestion, idx: number) {
    return (
      <div>
        <label className="mb-2 block text-sm font-medium text-ink">Loại</label>
        <select
          value={q.tag_id ?? ''}
          onChange={(e) => update(idx, { tag_id: e.target.value || null })}
          className="h-12 w-full rounded-[8px] border border-slate-200 bg-slate-50 px-4 text-base text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary"
        >
          <option value="">Chọn chủ đề</option>
          <optgroup label="Reading & Writing">
            {rwTags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </optgroup>
          <optgroup label="Math">
            {mathTags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </optgroup>
        </select>
      </div>
    )
  }

  return (
    <CreateFlowShell>
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-6 p-4 bg-surface-card rounded-[8px] border border-hairline-light">
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">{filename}</p>
          <p className="text-xs text-mute-light mt-0.5">
            {items.length} câu hỏi · {items.filter(q => q.is_duplicate).length} trùng lặp · {toSave.length} sẽ được lưu
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onBack} disabled={saving}>
            ← Tải file khác
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={toSave.length === 0}>
            Lưu {toSave.length} câu hỏi
          </Button>
        </div>
      </div>

      {uploadImportId && (
        <SaveDisabledNotice importId={uploadImportId} />
      )}

      {error && (
        <div className="mb-4 rounded-[8px] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-warning">{error}</p>
        </div>
      )}

      {/* Question list */}
      <div className="space-y-3">
        {items.map((q, idx) => (
          <Card key={idx} className={['p-5 transition-opacity', q.skip ? 'opacity-40' : ''].join(' ')}>
            {/* Header row */}
            <div className="flex items-start gap-3 mb-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-surface-soft text-mute-light text-xs font-bold flex items-center justify-center mt-0.5">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant={q.type === 'multiple_choice' ? 'info' : 'default'}>
                    {q.type === 'multiple_choice' ? 'Trắc nghiệm' : 'Điền đáp án'}
                  </Badge>
                  {q.module && (
                    <span className="text-xs text-mute-light">{q.module}</span>
                  )}
                  {q.is_duplicate && !q.skip && (
                    <span className="text-xs text-orange-600 font-medium bg-orange-50 px-2 py-0.5 rounded-full">
                      ⚠ Trùng lặp
                    </span>
                  )}
                  {q.category && (
                    <span className="text-xs text-mute-light">Category: {q.category}</span>
                  )}
                </div>
                <p className="text-sm text-ink leading-relaxed line-clamp-3">{getEditorText(q.content)}</p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                {!q.skip && (
                  <button
                    type="button"
                    onClick={() => setEditingIndex(editingIndex === idx ? null : idx)}
                    className="text-xs font-medium text-primary hover:text-blue-700"
                  >
                    {editingIndex === idx ? 'Thu gọn' : 'Chỉnh sửa'}
                  </button>
                )}
                <button
                  onClick={() => update(idx, { skip: !q.skip, replace: false })}
                  className="text-xs text-mute-light hover:text-warning transition-colors"
                  title={q.skip ? 'Bỏ bỏ qua' : 'Bỏ qua câu hỏi này'}
                >
                  {q.skip ? 'Khôi phục' : 'Bỏ qua'}
                </button>
              </div>
            </div>

            {!q.skip && (
              <>
                {editingIndex === idx ? (
                  <div className="pl-10">
                    <QuestionFormEditor
                      compact
                      type={q.type as EditableQuestionType}
                      onTypeChange={(type) => updateType(idx, type)}
                      content={q.content}
                      onContentChange={(value) => update(idx, { content: value })}
                      options={(q.options ?? []) as EditableOption[]}
                      onOptionsChange={(nextOptions) => updateOptions(idx, nextOptions)}
                      acceptedAnswers={q.accepted_answers ?? ['']}
                      onAcceptedAnswersChange={(answers) => update(idx, { accepted_answers: answers })}
                      difficulty={q.difficulty as EditableDifficulty | null}
                      onDifficultyChange={(nextDifficulty) => update(idx, { difficulty: nextDifficulty })}
                      explanation={q.teacher_explanation ?? ''}
                      onExplanationChange={(value) => update(idx, { teacher_explanation: value || null })}
                      tagSelector={tagSelector(q, idx)}
                    />
                  </div>
                ) : (
                  <>
                {/* Options preview (MC) */}
                {q.type === 'multiple_choice' && q.options && (
                  <div className="grid grid-cols-2 gap-1.5 mb-3 pl-10">
                    {q.options.map((opt) => (
                      <div
                        key={opt.label}
                        className={[
                          'flex items-start gap-2 px-3 py-1.5 rounded-[6px] text-xs',
                          opt.is_correct
                            ? 'bg-green-50 text-green-800 font-medium'
                            : 'bg-surface-soft text-mute-light',
                        ].join(' ')}
                      >
                        <span className="font-bold shrink-0">{opt.label}.</span>
                        <span className="line-clamp-2">{getEditorText(opt.content)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Accepted answers preview (SA) */}
                {q.type === 'short_answer' && q.accepted_answers && (
                  <div className="mb-3 pl-10">
                    <p className="text-xs text-mute-light mb-1">Đáp án chấp nhận:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {q.accepted_answers.map((a, i) => (
                        <span key={i} className="text-xs bg-green-50 text-green-800 px-2 py-0.5 rounded-full">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                  </>
                )}

                {/* Duplicate action */}
                {q.is_duplicate && editingIndex !== idx && (
                  <div className="mb-3 pl-10 flex items-center gap-3">
                    <p className="text-xs text-orange-600">Câu hỏi này đã có trong ngân hàng. Bạn muốn:</p>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`dup-${idx}`}
                        checked={!q.replace}
                        onChange={() => update(idx, { replace: false })}
                        className="accent-primary"
                      />
                      <span className="text-xs text-ink">Giữ cả hai</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`dup-${idx}`}
                        checked={q.replace}
                        onChange={() => update(idx, { replace: true })}
                        className="accent-primary"
                      />
                      <span className="text-xs text-ink">Thay thế câu cũ</span>
                    </label>
                  </div>
                )}

                {/* Tag + difficulty pickers */}
                {editingIndex !== idx && (
                <div className="pl-10 flex items-center gap-3 flex-wrap">
                  {/* Tag selector */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-mute-light whitespace-nowrap">Chủ đề:</label>
                    <select
                      value={q.tag_id ?? ''}
                      onChange={(e) => update(idx, { tag_id: e.target.value || null })}
                      className="text-xs border border-ash-light rounded-[6px] px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    >
                      <option value="">-- Chọn chủ đề --</option>
                      <optgroup label="Reading &amp; Writing">
                        {rwTags.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Math">
                        {mathTags.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Difficulty selector */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-mute-light whitespace-nowrap">Độ khó:</label>
                    <div className="flex gap-1">
                      {[
                        { value: 'easy', label: 'Dễ', color: 'bg-green-100 text-green-700' },
                        { value: 'medium', label: 'TB', color: 'bg-yellow-100 text-yellow-700' },
                        { value: 'hard', label: 'Khó', color: 'bg-red-100 text-red-700' },
                      ].map((d) => (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() =>
                            update(idx, {
                              difficulty: q.difficulty === d.value
                                ? null
                                : (d.value as 'easy' | 'medium' | 'hard'),
                            })
                          }
                          className={[
                            'px-2 py-1 rounded-full text-xs font-medium transition-all border',
                            q.difficulty === d.value
                              ? `${d.color} border-current`
                              : 'bg-surface-soft text-mute-light border-transparent hover:border-ash-light',
                          ].join(' ')}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                )}
              </>
            )}
          </Card>
        ))}
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 mt-6 py-4 bg-white border-t border-hairline-light flex items-center justify-between">
        <p className="text-sm text-mute-light">
          {toSave.length}/{items.length} câu hỏi sẽ được lưu
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={toSave.length === 0}>
            Lưu vào ngân hàng câu hỏi
          </Button>
        </div>
      </div>
    </div>
    </CreateFlowShell>
  )
}

function SaveDisabledNotice({ importId }: { importId: string }) {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/question-imports/${importId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setMessage(json.data?.parsed_payload?.save_disabled_reason ?? null)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [importId])

  if (!message) return null
  return (
    <div className="mb-4 rounded-[8px] bg-amber-50 border border-amber-200 px-4 py-3">
      <p className="text-sm text-amber-800">{message}</p>
    </div>
  )
}

// ─── Step 3: Done ─────────────────────────────────────────────────────────────

function DoneStep({ saved, onReset }: { saved: number; onReset: () => void }) {
  const router = useRouter()
  const locale = useLocale()
  return (
    <div className="max-w-sm mx-auto text-center py-16">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-green-600">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-ink mb-2">Lưu thành công!</h2>
      <p className="text-sm text-mute-light mb-8">
        Đã thêm <span className="font-semibold text-ink">{saved} câu hỏi</span> vào ngân hàng.
      </p>
      <div className="flex flex-col gap-3">
        <Button onClick={() => {
          router.push(`/${locale}/teacher/questions`)
          router.refresh()
        }}>
          Xem ngân hàng câu hỏi
        </Button>
        <Button variant="ghost" onClick={onReset}>
          Tải lên file khác
        </Button>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function UploadDocxClient({ tags }: { tags: Tag[] }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [questions, setQuestions] = useState<ReviewQuestion[]>([])
  const [filename, setFilename] = useState('')
  const [uploadImportId, setUploadImportId] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)

  function handleParsed(qs: ReviewQuestion[], name: string, importId: string | null) {
    setQuestions(qs)
    setFilename(name)
    setUploadImportId(importId)
    setStep(2)
  }

  function handleSaved(count: number) {
    setSavedCount(count)
    setStep(3)
  }

  function reset() {
    setStep(1)
    setQuestions([])
    setFilename('')
    setUploadImportId(null)
    setSavedCount(0)
  }

  return (
    <div>
      <PageHeader
        title="Tải lên câu hỏi từ file .docx/.pdf"
        breadcrumbs={[
          { label: 'Ngân hàng câu hỏi', href: '/teacher/questions' },
          { label: 'Tải lên .docx/.pdf' },
        ]}
      />

      <StepIndicator step={step} />

      {step === 1 && <UploadStep onParsed={handleParsed} />}
      {step === 2 && (
        <ReviewStep
          questions={questions}
          filename={filename}
          uploadImportId={uploadImportId}
          tags={tags}
          onSaved={handleSaved}
          onBack={reset}
        />
      )}
      {step === 3 && <DoneStep saved={savedCount} onReset={reset} />}
    </div>
  )
}
