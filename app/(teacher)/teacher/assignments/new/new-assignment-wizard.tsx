'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string
  type: string
  content: string
  difficulty: string | null
}

interface Course {
  id: string
  title: string
}

interface Class {
  id: string
  title: string
  course_id: string
}

interface Week {
  id: string
  title: string
  class_id: string
  order: number
}

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
  tag_id: string | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  skip: boolean
  replace: boolean
}

interface Props {
  questions: Question[]
  courses: Course[]
  classes: Class[]
  weeks: Week[]
  tags: Tag[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Dễ',
  medium: 'TB',
  hard: 'Khó',
}

const DIFFICULTY_VARIANT: Record<string, 'success' | 'warning' | 'error'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'error',
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={[
      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors',
      done ? 'bg-primary text-white' : active ? 'bg-primary text-white' : 'bg-surface-soft text-mute-light',
    ].join(' ')}>
      {done ? (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : n}
    </div>
  )
}

// ─── Docx upload sub-flow ─────────────────────────────────────────────────────

type DocxPhase = 'upload' | 'review'

function DocxUploadPane({
  tags,
  onQuestionsReady,
}: {
  tags: Tag[]
  onQuestionsReady: (savedIds: string[], count: number) => void
}) {
  const [phase, setPhase] = useState<DocxPhase>('upload')
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const [items, setItems] = useState<ReviewQuestion[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const rwTags = tags.filter((t) => t.subject === 'reading_writing')
  const mathTags = tags.filter((t) => t.subject === 'math')

  // ── Parse docx ──────────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    if (!file.name.endsWith('.docx')) {
      setParseError('Chỉ chấp nhận file .docx.')
      return
    }
    setParseError(null)
    setParsing(true)

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/questions/parse', { method: 'POST', body: form })
      const json = await res.json()

      if (!res.ok || json.error) {
        setParseError(json.error ?? 'Lỗi phân tích file.')
        return
      }

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
      setItems(questions)
      setFilename(file.name)
      setPhase('review')
    } catch {
      setParseError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setParsing(false)
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateItem(idx: number, patch: Partial<ReviewQuestion>) {
    setItems((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  }

  const toSave = items.filter((q) => !q.skip)

  // ── Save to bank then hand IDs back to wizard ────────────────────────────
  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/questions/bulk-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: items }),
      })
      const json = await res.json()
      if (!res.ok && !json.data) {
        setSaveError(json.error ?? 'Không thể lưu câu hỏi.')
        return
      }
      const savedIds: string[] = json.data?.savedIds ?? []
      onQuestionsReady(savedIds, json.data?.saved ?? 0)
    } catch {
      setSaveError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  // ── Upload phase ─────────────────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !parsing && inputRef.current?.click()}
          className={[
            'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors py-12 px-8',
            dragging ? 'border-primary bg-blue-50' : 'border-ash-light hover:border-primary hover:bg-surface-card',
            parsing ? 'pointer-events-none opacity-60' : '',
          ].join(' ')}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />

          {parsing ? (
            <>
              <svg className="animate-spin w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-mute-light">Đang phân tích file...</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-xl bg-indigo-50 flex items-center justify-center">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-medium text-ink text-sm">Kéo thả file vào đây</p>
                <p className="text-xs text-mute-light mt-1">hoặc nhấn để chọn file .docx</p>
              </div>
            </>
          )}
        </div>

        {parseError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-warning">{parseError}</p>
          </div>
        )}

        <div className="rounded-lg bg-surface-card border border-hairline-light p-4 space-y-1.5">
          <p className="text-xs font-semibold text-ink">Yêu cầu định dạng</p>
          <ul className="text-xs text-mute-light space-y-1 list-disc list-inside">
            <li>Heading: <code className="bg-surface-soft px-1 rounded">**Module 1: Reading and Writing**</code></li>
            <li>Câu hỏi: <code className="bg-surface-soft px-1 rounded">**Question N**</code></li>
            <li>Đáp án đúng: in đậm trong Options</li>
          </ul>
        </div>
      </div>
    )
  }

  // ── Review phase ──────────────────────────────────────────────────────────
  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-4 p-4 bg-surface-card rounded-lg border border-hairline-light">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink truncate">{filename}</p>
          <p className="text-xs text-mute-light mt-0.5">
            {items.length} câu hỏi · {items.filter(q => q.is_duplicate).length} trùng lặp · {toSave.length} sẽ được lưu
          </p>
        </div>
        <button
          onClick={() => { setPhase('upload'); setItems([]); setFilename('') }}
          className="text-xs text-mute-light hover:text-ink transition-colors shrink-0"
        >
          ← Tải file khác
        </button>
      </div>

      {saveError && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-warning">{saveError}</p>
        </div>
      )}

      {/* Question list */}
      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
        {items.map((q, idx) => (
          <Card key={q.content_hash + idx} className={['p-4 transition-opacity', q.skip ? 'opacity-40' : ''].join(' ')}>
            <div className="flex items-start gap-3 mb-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-surface-soft text-mute-light text-xs font-bold flex items-center justify-center mt-0.5">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <Badge variant={q.type === 'multiple_choice' ? 'info' : 'default'}>
                    {q.type === 'multiple_choice' ? 'TN' : 'SA'}
                  </Badge>
                  {q.module && <span className="text-xs text-mute-light">{q.module}</span>}
                  {q.is_duplicate && !q.skip && (
                    <span className="text-xs text-orange-600 font-medium bg-orange-50 px-1.5 py-0.5 rounded-full">⚠ Trùng</span>
                  )}
                </div>
                <p className="text-xs text-ink leading-relaxed line-clamp-2">{q.content}</p>
              </div>
              <button
                onClick={() => updateItem(idx, { skip: !q.skip, replace: false })}
                className="shrink-0 text-xs text-mute-light hover:text-warning transition-colors"
              >
                {q.skip ? 'Khôi phục' : 'Bỏ qua'}
              </button>
            </div>

            {!q.skip && (
              <div className="pl-9 flex items-center gap-3 flex-wrap">
                {/* Duplicate action */}
                {q.is_duplicate && (
                  <div className="flex items-center gap-2 w-full mb-1">
                    <p className="text-xs text-orange-600">Trùng lặp:</p>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" name={`dup-${idx}`} checked={!q.replace} onChange={() => updateItem(idx, { replace: false })} className="accent-primary" />
                      <span className="text-xs text-ink">Giữ cả hai</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" name={`dup-${idx}`} checked={q.replace} onChange={() => updateItem(idx, { replace: true })} className="accent-primary" />
                      <span className="text-xs text-ink">Thay thế</span>
                    </label>
                  </div>
                )}

                {/* Tag */}
                <select
                  value={q.tag_id ?? ''}
                  onChange={(e) => updateItem(idx, { tag_id: e.target.value || null })}
                  className="text-xs border border-ash-light rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">-- Chủ đề --</option>
                  <optgroup label="Reading &amp; Writing">
                    {rwTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                  <optgroup label="Math">
                    {mathTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                </select>

                {/* Difficulty */}
                <div className="flex gap-1">
                  {[
                    { value: 'easy', label: 'Dễ', color: 'bg-green-100 text-green-700' },
                    { value: 'medium', label: 'TB', color: 'bg-yellow-100 text-yellow-700' },
                    { value: 'hard', label: 'Khó', color: 'bg-red-100 text-red-700' },
                  ].map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => updateItem(idx, { difficulty: q.difficulty === d.value ? null : (d.value as 'easy' | 'medium' | 'hard') })}
                      className={[
                        'px-2 py-0.5 rounded-full text-xs font-medium transition-all border',
                        q.difficulty === d.value ? `${d.color} border-current` : 'bg-surface-soft text-mute-light border-transparent hover:border-ash-light',
                      ].join(' ')}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Save bar */}
      <div className="mt-4 pt-4 border-t border-hairline-light flex items-center justify-between">
        <p className="text-xs text-mute-light">{toSave.length}/{items.length} câu hỏi sẽ được lưu vào ngân hàng</p>
        <Button onClick={handleSave} loading={saving} disabled={toSave.length === 0}>
          Lưu & chọn {toSave.length} câu hỏi →
        </Button>
      </div>
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function NewAssignmentWizard({ questions, courses, classes, weeks, tags }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1 mode: bank picker vs docx upload
  const [sourceMode, setSourceMode] = useState<'bank' | 'docx'>('bank')

  // Step 1: question selection (bank mode)
  const [questionSearch, setQuestionSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [diffFilter, setDiffFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Docx mode: status message after save
  const [docxSavedCount, setDocxSavedCount] = useState(0)
  const [docxDone, setDocxDone] = useState(false)

  // All available questions (bank + newly saved from docx)
  const [allQuestions, setAllQuestions] = useState<Question[]>(questions)

  // Step 2: settings
  const [title, setTitle] = useState('')
  const [classId, setClassId] = useState('')
  const [weekId, setWeekId] = useState('')
  const [deadline, setDeadline] = useState('')
  const [isTimed, setIsTimed] = useState(false)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState('60')
  const [shuffleQuestions, setShuffleQuestions] = useState(false)
  const [shuffleOptions, setShuffleOptions] = useState(false)
  const [publishNow, setPublishNow] = useState(true)
  const [maxRetakes, setMaxRetakes] = useState('1')

  // Submission state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredQuestions = useMemo(() => {
    return allQuestions.filter((q) => {
      const matchSearch = !questionSearch || q.content.toLowerCase().includes(questionSearch.toLowerCase())
      const matchType = typeFilter === 'all' || q.type === typeFilter
      const matchDiff = diffFilter === 'all' || q.difficulty === diffFilter
      return matchSearch && matchType && matchDiff
    })
  }, [allQuestions, questionSearch, typeFilter, diffFilter])

  const availableWeeks = weeks.filter((w) => w.class_id === classId)

  function toggleQuestion(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === filteredQuestions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredQuestions.map((q) => q.id)))
    }
  }

  // Called when docx upload flow finishes saving questions to bank
  function handleDocxSaved(savedIds: string[], count: number) {
    setDocxSavedCount(count)
    setDocxDone(true)
    // Auto-select all newly saved questions
    setSelectedIds(new Set(savedIds))
    // Note: allQuestions won't have the new ones yet since the bank was fetched server-side
    // We'll show the count and let the teacher proceed
  }

  // ── Create & publish ───────────────────────────────────────────────────────

  async function handleCreate() {
    if (!title.trim()) { setError('Vui lòng nhập tên bài tập.'); return }
    if (!classId) { setError('Vui lòng chọn lớp.'); return }
    if (!deadline) { setError('Vui lòng chọn hạn nộp.'); return }
    if (selectedIds.size === 0) { setError('Vui lòng chọn ít nhất một câu hỏi.'); return }

    setError(null)
    setLoading(true)

    try {
      const assignRes = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      })
      const assignJson = await assignRes.json()
      if (assignJson.error) { setError(assignJson.error); return }
      const assignmentId: string = assignJson.data.id

      const qRes = await fetch(`/api/assignments/${assignmentId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_ids: Array.from(selectedIds) }),
      })
      const qJson = await qRes.json()
      if (qJson.error) { setError(qJson.error); return }

      const instanceBody: Record<string, unknown> = {
        assignment_id: assignmentId,
        class_id: classId,
        week_id: weekId || undefined,
        deadline: new Date(deadline).toISOString(),
        is_timed: isTimed,
        time_limit_seconds: isTimed ? Number(timeLimitMinutes) * 60 : null,
        shuffle_questions: shuffleQuestions,
        shuffle_options: shuffleOptions,
        max_retakes: Number(maxRetakes),
        published_at: publishNow ? new Date().toISOString() : null,
      }

      const instRes = await fetch('/api/assignment-instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instanceBody),
      })
      const instJson = await instRes.json()
      if (instJson.error) { setError(instJson.error); return }

      router.push('/teacher/assignments')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Tạo bài tập mới"
        breadcrumbs={[
          { label: 'Bài tập', href: '/teacher/assignments' },
          { label: 'Tạo mới' },
        ]}
      />

      {/* Step progress */}
      <div className="flex items-center gap-3 mb-8">
        {[
          { n: 1, label: 'Chọn câu hỏi' },
          { n: 2, label: 'Cài đặt' },
          { n: 3, label: 'Xuất bản' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <StepDot n={s.n} active={step === s.n} done={step > s.n} />
              <span className={`text-sm font-medium ${step === s.n ? 'text-ink' : step > s.n ? 'text-primary' : 'text-mute-light'}`}>
                {s.label}
              </span>
            </div>
            {i < 2 && <div className="h-px w-8 bg-hairline-light" />}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-warning">{error}</p>
        </div>
      )}

      {/* ── STEP 1: SELECT QUESTIONS ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">

          {/* Mode switcher */}
          <div className="flex gap-2 p-1 bg-surface-soft rounded-xl w-fit">
            <button
              onClick={() => { setSourceMode('bank'); setDocxDone(false) }}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                sourceMode === 'bank'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-mute-light hover:text-ink',
              ].join(' ')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Chọn từ ngân hàng
            </button>
            <button
              onClick={() => setSourceMode('docx')}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                sourceMode === 'docx'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-mute-light hover:text-ink',
              ].join(' ')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload file .docx
            </button>
          </div>

          {/* ── Bank mode ────────────────────────────────────────────────────── */}
          {sourceMode === 'bank' && (
            <>
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mute-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Tìm câu hỏi..."
                    value={questionSearch}
                    onChange={(e) => setQuestionSearch(e.target.value)}
                    className="w-full pl-9 pr-4 h-9 rounded-lg border border-ash-light text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-canvas-light text-ink placeholder:text-mute-light"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {[{ val: 'all', label: 'Tất cả' }, { val: 'multiple_choice', label: 'Trắc nghiệm' }, { val: 'short_answer', label: 'Điền đáp án' }].map((opt) => (
                    <button key={opt.val} onClick={() => setTypeFilter(opt.val)} className={['px-3 py-1.5 rounded-full text-xs font-medium transition-colors', typeFilter === opt.val ? 'bg-primary text-white' : 'bg-surface-soft text-mute-light hover:text-ink'].join(' ')}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  {[{ val: 'all', label: 'Mọi độ khó' }, { val: 'easy', label: 'Dễ' }, { val: 'medium', label: 'TB' }, { val: 'hard', label: 'Khó' }].map((opt) => (
                    <button key={opt.val} onClick={() => setDiffFilter(opt.val)} className={['px-3 py-1.5 rounded-full text-xs font-medium transition-colors', diffFilter === opt.val ? 'bg-ink text-canvas-light' : 'bg-surface-soft text-mute-light hover:text-ink'].join(' ')}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Select all + count */}
              <div className="flex items-center justify-between text-sm">
                <button onClick={toggleAll} className="text-primary hover:underline text-xs font-medium">
                  {selectedIds.size === filteredQuestions.length && filteredQuestions.length > 0 ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
                <span className="text-mute-light text-xs">Đã chọn {selectedIds.size} / {filteredQuestions.length} câu hỏi</span>
              </div>

              {/* Question list */}
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {filteredQuestions.length === 0 ? (
                  <p className="text-sm text-mute-light text-center py-8">Không tìm thấy câu hỏi nào</p>
                ) : (
                  filteredQuestions.map((q) => {
                    const selected = selectedIds.has(q.id)
                    return (
                      <div
                        key={q.id}
                        onClick={() => toggleQuestion(q.id)}
                        className={[
                          'flex items-center gap-4 px-5 py-3.5 rounded-card cursor-pointer transition-colors border-2',
                          selected ? 'border-primary bg-primary/5' : 'border-transparent bg-surface-card hover:bg-surface-soft',
                        ].join(' ')}
                      >
                        <div className={['w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 border-2 transition-colors', selected ? 'bg-primary border-primary' : 'border-ash-light'].join(' ')}>
                          {selected && (
                            <svg fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5} className="w-3 h-3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ink truncate">
                            {q.content.slice(0, 100)}{q.content.length > 100 ? '…' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {q.type === 'multiple_choice' ? <Badge variant="info">TN</Badge> : <Badge variant="default">ĐĐ</Badge>}
                          {q.difficulty && <Badge variant={DIFFICULTY_VARIANT[q.difficulty] ?? 'default'}>{DIFFICULTY_LABEL[q.difficulty]}</Badge>}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button disabled={selectedIds.size === 0} onClick={() => { setError(null); setStep(2) }}>
                  Tiếp theo → ({selectedIds.size} câu)
                </Button>
                <Button variant="ghost" onClick={() => router.back()}>Hủy</Button>
              </div>
            </>
          )}

          {/* ── Docx mode ────────────────────────────────────────────────────── */}
          {sourceMode === 'docx' && (
            <>
              {docxDone ? (
                /* Success state — questions saved, ready to proceed */
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-5 bg-green-50 border border-green-200 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-600">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-green-800">
                        Đã lưu {docxSavedCount} câu hỏi vào ngân hàng
                      </p>
                      <p className="text-xs text-green-700 mt-0.5">
                        Tất cả câu hỏi đã được chọn. Tiếp tục để cài đặt bài tập.
                      </p>
                    </div>
                    <button
                      onClick={() => { setDocxDone(false); setSelectedIds(new Set()) }}
                      className="text-xs text-green-700 hover:text-green-900 underline shrink-0"
                    >
                      Upload file khác
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button disabled={selectedIds.size === 0} onClick={() => { setError(null); setStep(2) }}>
                      Tiếp theo → ({selectedIds.size} câu)
                    </Button>
                    <Button variant="ghost" onClick={() => router.back()}>Hủy</Button>
                  </div>
                </div>
              ) : (
                <DocxUploadPane tags={tags} onQuestionsReady={handleDocxSaved} />
              )}
            </>
          )}
        </div>
      )}

      {/* ── STEP 2: SETTINGS ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5 max-w-xl">
          <Card className="p-6 space-y-5">
            <Input
              label="Tên bài tập"
              placeholder="Ví dụ: Module 1 - Reading & Writing"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <div>
              <label className="block text-xs font-medium text-mute-light mb-1.5">Lớp học</label>
              <select
                value={classId}
                onChange={(e) => { setClassId(e.target.value); setWeekId('') }}
                className="w-full h-10 px-3 rounded-lg border border-ash-light text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-canvas-light text-ink"
              >
                <option value="">— Chọn lớp —</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>

            {classId && (
              <div>
                <label className="block text-xs font-medium text-mute-light mb-1.5">Tuần học (tùy chọn)</label>
                <select
                  value={weekId}
                  onChange={(e) => setWeekId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-ash-light text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-canvas-light text-ink"
                >
                  <option value="">— Không gán tuần —</option>
                  {availableWeeks.map((w) => (
                    <option key={w.id} value={w.id}>{w.title}</option>
                  ))}
                </select>
              </div>
            )}

            <Input
              label="Hạn nộp"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
            />

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsTimed(!isTimed)}
                  className={['relative w-10 h-[22px] rounded-full transition-colors', isTimed ? 'bg-primary' : 'bg-ash-light'].join(' ')}
                >
                  <span className={['absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform', isTimed ? 'translate-x-[18px]' : ''].join(' ')} />
                </button>
                <span className="text-sm text-ink">Giới hạn thời gian</span>
              </div>
              {isTimed && (
                <Input
                  label="Thời gian (phút)"
                  type="number"
                  min="1"
                  max="300"
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(e.target.value)}
                />
              )}
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <p className="text-sm font-medium text-ink">Tùy chọn nâng cao</p>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-sm text-ink">Xáo trộn thứ tự câu hỏi</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-sm text-ink">Xáo trộn thứ tự đáp án</span>
            </label>

            <div>
              <label className="block text-xs font-medium text-mute-light mb-1.5">Số lần làm bài tối đa</label>
              <select
                value={maxRetakes}
                onChange={(e) => setMaxRetakes(e.target.value)}
                className="w-40 h-10 px-3 rounded-lg border border-ash-light text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-canvas-light text-ink"
              >
                {[1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>{n} lần</option>
                ))}
              </select>
            </div>
          </Card>

          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => setStep(1)}>← Quay lại</Button>
            <Button onClick={() => { setError(null); setStep(3) }}>Tiếp theo →</Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: CONFIRM & PUBLISH ────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5 max-w-xl">
          <Card className="p-6 space-y-4">
            <p className="text-sm font-medium text-ink mb-2">Xác nhận thông tin bài tập</p>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between border-b border-hairline-light pb-2">
                <span className="text-mute-light">Tên bài tập</span>
                <span className="font-medium text-ink">{title || '—'}</span>
              </div>
              <div className="flex items-center justify-between border-b border-hairline-light pb-2">
                <span className="text-mute-light">Số câu hỏi</span>
                <span className="font-medium text-ink">{selectedIds.size} câu</span>
              </div>
              <div className="flex items-center justify-between border-b border-hairline-light pb-2">
                <span className="text-mute-light">Nguồn câu hỏi</span>
                <span className="font-medium text-ink">{sourceMode === 'docx' ? 'Upload .docx' : 'Ngân hàng câu hỏi'}</span>
              </div>
              <div className="flex items-center justify-between border-b border-hairline-light pb-2">
                <span className="text-mute-light">Lớp</span>
                <span className="font-medium text-ink">{classes.find((c) => c.id === classId)?.title ?? '—'}</span>
              </div>
              {weekId && (
                <div className="flex items-center justify-between border-b border-hairline-light pb-2">
                  <span className="text-mute-light">Tuần</span>
                  <span className="font-medium text-ink">{weeks.find((w) => w.id === weekId)?.title ?? '—'}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-b border-hairline-light pb-2">
                <span className="text-mute-light">Hạn nộp</span>
                <span className="font-medium text-ink">
                  {deadline ? new Date(deadline).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
              </div>
              {isTimed && (
                <div className="flex items-center justify-between border-b border-hairline-light pb-2">
                  <span className="text-mute-light">Giới hạn thời gian</span>
                  <span className="font-medium text-ink">{timeLimitMinutes} phút</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-mute-light">Số lần làm bài</span>
                <span className="font-medium text-ink">{maxRetakes} lần</span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <label className="flex items-center gap-3 cursor-pointer">
              <button
                type="button"
                onClick={() => setPublishNow(!publishNow)}
                className={['relative w-10 h-[22px] rounded-full transition-colors', publishNow ? 'bg-primary' : 'bg-ash-light'].join(' ')}
              >
                <span className={['absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform', publishNow ? 'translate-x-[18px]' : ''].join(' ')} />
              </button>
              <div>
                <p className="text-sm font-medium text-ink">Xuất bản ngay</p>
                <p className="text-xs text-mute-light">Học sinh có thể làm bài ngay sau khi lưu</p>
              </div>
            </label>
          </Card>

          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => setStep(2)}>← Quay lại</Button>
            <Button loading={loading} onClick={handleCreate}>
              {publishNow ? 'Lưu & Xuất bản' : 'Lưu bài tập'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
