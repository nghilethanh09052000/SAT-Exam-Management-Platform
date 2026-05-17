'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

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
  skip: boolean
  replace: boolean
}

interface ParseError {
  line?: number
  message: string
}

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: 'Tải lên file' },
    { n: 2, label: 'Xem xét câu hỏi' },
    { n: 3, label: 'Hoàn thành' },
  ]
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={[
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                step === s.n
                  ? 'bg-primary text-white'
                  : step > s.n
                  ? 'bg-green-500 text-white'
                  : 'bg-surface-soft text-mute-light',
              ].join(' ')}
            >
              {step > s.n ? (
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              ) : (
                s.n
              )}
            </div>
            <span
              className={[
                'text-sm font-medium',
                step >= s.n ? 'text-ink' : 'text-mute-light',
              ].join(' ')}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={['w-16 h-px mx-3', step > s.n ? 'bg-green-400' : 'bg-hairline-light'].join(' ')} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Step 1: Upload ──────────────────────────────────────────────────────────

function UploadStep({
  onParsed,
}: {
  onParsed: (questions: ReviewQuestion[], filename: string) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parseErrors, setParseErrors] = useState<ParseError[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.docx')) {
      setError('Chỉ chấp nhận file .docx.')
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

      // Annotate with default teacher review values
      const questions: ReviewQuestion[] = json.data.questions.map(
        (q: Omit<ReviewQuestion, 'skip' | 'replace' | 'tag_id' | 'difficulty'> & {
          difficulty?: string | null
          tag_id?: string | null
        }) => ({
          ...q,
          tag_id: null,
          difficulty: q.difficulty ?? null,
          skip: false,
          replace: false,
        })
      )
      onParsed(questions, file.name)
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
          accept=".docx"
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
              <p className="text-sm text-mute-light mt-1">hoặc nhấn để chọn file .docx (tối đa 20MB)</p>
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
  tags,
  onSaved,
  onBack,
}: {
  questions: ReviewQuestion[]
  filename: string
  tags: Tag[]
  onSaved: (saved: number) => void
  onBack: () => void
}) {
  const [items, setItems] = useState<ReviewQuestion[]>(questions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rwTags = tags.filter((t) => t.subject === 'reading_writing')
  const mathTags = tags.filter((t) => t.subject === 'math')

  function update(idx: number, patch: Partial<ReviewQuestion>) {
    setItems((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  }

  const toSave = items.filter((q) => !q.skip)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/questions/bulk-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: items }),
      })
      const json = await res.json()
      if (!res.ok && !json.data) {
        setError(json.error ?? 'Không thể lưu câu hỏi.')
        return
      }
      onSaved(json.data?.saved ?? 0)
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
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

      {error && (
        <div className="mb-4 rounded-[8px] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-warning">{error}</p>
        </div>
      )}

      {/* Question list */}
      <div className="space-y-3">
        {items.map((q, idx) => (
          <Card key={q.content_hash + idx} className={['p-5 transition-opacity', q.skip ? 'opacity-40' : ''].join(' ')}>
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
                </div>
                <p className="text-sm text-ink leading-relaxed line-clamp-3">{q.content}</p>
              </div>

              {/* Skip toggle */}
              <button
                onClick={() => update(idx, { skip: !q.skip, replace: false })}
                className="shrink-0 text-xs text-mute-light hover:text-warning transition-colors"
                title={q.skip ? 'Bỏ bỏ qua' : 'Bỏ qua câu hỏi này'}
              >
                {q.skip ? 'Khôi phục' : 'Bỏ qua'}
              </button>
            </div>

            {!q.skip && (
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
                        <span className="line-clamp-2">{opt.content}</span>
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

                {/* Duplicate action */}
                {q.is_duplicate && (
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
  )
}

// ─── Step 3: Done ─────────────────────────────────────────────────────────────

function DoneStep({ saved, onReset }: { saved: number; onReset: () => void }) {
  const router = useRouter()
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
          router.push('/teacher/questions')
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
  const [savedCount, setSavedCount] = useState(0)

  function handleParsed(qs: ReviewQuestion[], name: string) {
    setQuestions(qs)
    setFilename(name)
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
    setSavedCount(0)
  }

  return (
    <div>
      <PageHeader
        title="Tải lên câu hỏi từ file .docx"
        breadcrumbs={[
          { label: 'Ngân hàng câu hỏi', href: '/teacher/questions' },
          { label: 'Tải lên .docx' },
        ]}
      />

      <StepIndicator step={step} />

      {step === 1 && <UploadStep onParsed={handleParsed} />}
      {step === 2 && (
        <ReviewStep
          questions={questions}
          filename={filename}
          tags={tags}
          onSaved={handleSaved}
          onBack={reset}
        />
      )}
      {step === 3 && <DoneStep saved={savedCount} onReset={reset} />}
    </div>
  )
}
