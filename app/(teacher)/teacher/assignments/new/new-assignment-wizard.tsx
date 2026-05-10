'use client'

import { useState, useMemo } from 'react'
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

interface Props {
  questions: Question[]
  courses: Course[]
  classes: Class[]
  weeks: Week[]
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

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function NewAssignmentWizard({ questions, courses, classes, weeks }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1: question selection
  const [questionSearch, setQuestionSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [diffFilter, setDiffFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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
    return questions.filter((q) => {
      const matchSearch = !questionSearch || q.content.toLowerCase().includes(questionSearch.toLowerCase())
      const matchType = typeFilter === 'all' || q.type === typeFilter
      const matchDiff = diffFilter === 'all' || q.difficulty === diffFilter
      return matchSearch && matchType && matchDiff
    })
  }, [questions, questionSearch, typeFilter, diffFilter])

  // Available classes filtered by course
  const availableClasses = classes

  // Available weeks for selected class
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

  // ── Create & publish ───────────────────────────────────────────────────────

  async function handleCreate() {
    if (!title.trim()) { setError('Vui lòng nhập tên bài tập.'); return }
    if (!classId) { setError('Vui lòng chọn lớp.'); return }
    if (!deadline) { setError('Vui lòng chọn hạn nộp.'); return }
    if (selectedIds.size === 0) { setError('Vui lòng chọn ít nhất một câu hỏi.'); return }

    setError(null)
    setLoading(true)

    try {
      // 1. Create assignment
      const assignRes = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      })
      const assignJson = await assignRes.json()
      if (assignJson.error) { setError(assignJson.error); return }
      const assignmentId: string = assignJson.data.id

      // 2. Set questions
      const qRes = await fetch(`/api/assignments/${assignmentId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_ids: Array.from(selectedIds) }),
      })
      const qJson = await qRes.json()
      if (qJson.error) { setError(qJson.error); return }

      // 3. Create instance (assign to class/week)
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

      {/* ── STEP 1: SELECT QUESTIONS ────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
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
            <button
              onClick={toggleAll}
              className="text-primary hover:underline text-xs font-medium"
            >
              {selectedIds.size === filteredQuestions.length && filteredQuestions.length > 0 ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
            <span className="text-mute-light text-xs">
              Đã chọn {selectedIds.size} / {filteredQuestions.length} câu hỏi
            </span>
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
                    {/* Checkbox */}
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
            <Button
              disabled={selectedIds.size === 0}
              onClick={() => { setError(null); setStep(2) }}
            >
              Tiếp theo →
            </Button>
            <Button variant="ghost" onClick={() => router.back()}>Hủy</Button>
          </div>
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

            {/* Class picker */}
            <div>
              <label className="block text-xs font-medium text-mute-light mb-1.5">Lớp học</label>
              <select
                value={classId}
                onChange={(e) => { setClassId(e.target.value); setWeekId('') }}
                className="w-full h-10 px-3 rounded-lg border border-ash-light text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-canvas-light text-ink"
              >
                <option value="">— Chọn lớp —</option>
                {availableClasses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>

            {/* Week picker */}
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

            {/* Deadline */}
            <Input
              label="Hạn nộp"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
            />

            {/* Time limit toggle */}
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
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-ink">Xáo trộn thứ tự câu hỏi</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
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
                <span className="text-mute-light">Lớp</span>
                <span className="font-medium text-ink">
                  {classes.find((c) => c.id === classId)?.title ?? '—'}
                </span>
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

          {/* Publish toggle */}
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
