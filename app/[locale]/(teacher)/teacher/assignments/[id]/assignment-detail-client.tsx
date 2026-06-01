'use client'

import { useState, useMemo, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { RichHtml } from '@/lib/rich-html'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string
  title: string
  created_at: string
}

interface InstanceRow {
  id: string
  class_id: string
  week_id: string
  deadline: string
  published_at: string | null
  is_timed: boolean
  time_limit_seconds: number | null
  max_retakes: number
  classes: { id: string; title: string } | null
  weeks: { id: string; title: string } | null
}

interface SubmissionRow {
  id: string
  instance_id: string
  student_id: string
  attempt_number: number
  status: string
  raw_score: number | null
  total_questions: number | null
  submitted_at: string | null
  time_spent_seconds: number | null
  profiles: { full_name: string; phone: string | null } | null
}

interface QuestionOption {
  id: string
  label: string
  content: string
  is_correct: boolean
  order: number
}

// Full detail is fetched lazily on "Xem" click — not loaded on page mount
interface QuestionDetail {
  id: string
  type: string
  content: string
  difficulty: string | null
  ai_explanation: string | null
  teacher_explanation: string | null
  question_options: QuestionOption[]
  question_accepted_answers: { id: string; answer_text: string }[]
}

// Lightweight list row — only what is needed for the table
interface QuestionRow {
  id: string
  order: number
  score_weight: number
  question: {
    id: string
    type: string
    content: string
    difficulty: string | null
  }
}

interface Props {
  assignment: Assignment
  instances: InstanceRow[]
  submissions: SubmissionRow[]
  questions: QuestionRow[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSeconds(s: number | null) {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function scorePercent(raw: number | null, total: number | null) {
  if (!raw || !total) return null
  return Math.round((raw / total) * 100)
}

function scoreTone(pct: number) {
  if (pct >= 70) return 'text-emerald-600'
  if (pct >= 50) return 'text-amber-600'
  return 'text-rose-500'
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Initials for the per-student rows — neutral, no generic "egg" avatars
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

// ─── Inline icons (match existing stroke convention) ────────────────────────────

const stroke = { fill: 'none' as const, viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.5 }

function IconQuestions(props: { className?: string }) {
  return (
    <svg {...stroke} className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function IconClasses(props: { className?: string }) {
  return (
    <svg {...stroke} className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}
function IconSubmissions(props: { className?: string }) {
  return (
    <svg {...stroke} className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function IconAvg(props: { className?: string }) {
  return (
    <svg {...stroke} className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}

// ─── Question Detail (lazy-loaded) ───────────────────────────────────────────

function QuestionDetailView({
  detail,
  aq,
}: {
  detail: QuestionDetail
  aq: QuestionRow
}) {
  const t = useTranslations('teacher.assignments')
  const options = [...(detail.question_options ?? [])].sort((a, b) => a.order - b.order)
  const answers = detail.question_accepted_answers ?? []

  const diffLabel: Record<string, string> = { easy: t('diffEasy'), medium: t('diffMedium'), hard: t('diffHard') }
  const diffVariant: Record<string, 'success' | 'warning' | 'error'> = { easy: 'success', medium: 'warning', hard: 'error' }
  const diff = detail.difficulty ?? ''

  return (
    <div className="space-y-5">
      {/* Meta row */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-surface-soft text-mute-light font-medium">
          {detail.type === 'multiple_choice' ? t('questionTypeMc') : t('questionTypeSa')}
        </span>
        {diff && <Badge variant={diffVariant[diff] ?? 'muted'}>{diffLabel[diff] ?? diff}</Badge>}
        <span className="px-2.5 py-1 rounded-full bg-blue-50 text-primary font-semibold">
          {t('qColScore')}: {aq.score_weight}
        </span>
      </div>

      {/* Question content */}
      <div>
        <p className="text-xs font-semibold text-mute-light uppercase tracking-wide mb-1.5">{t('qContent')}</p>
        <RichHtml
          html={detail.content}
          className="block text-sm text-ink leading-relaxed whitespace-pre-wrap [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg"
        />
      </div>

      {/* Options (MCQ) */}
      {options.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-mute-light uppercase tracking-wide mb-2">{t('qOptions')}</p>
          <div className="space-y-2">
            {options.map((opt) => (
              <div
                key={opt.id}
                className={[
                  'flex items-start gap-3 rounded-lg px-4 py-2.5 text-sm',
                  opt.is_correct
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    : 'bg-surface-soft text-ink',
                ].join(' ')}
              >
                <span className="shrink-0 font-bold w-5">{opt.label}.</span>
                <span className="flex-1">{opt.content}</span>
                {opt.is_correct && (
                  <svg className="shrink-0 w-4 h-4 text-emerald-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accepted answers (short answer) */}
      {answers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-mute-light uppercase tracking-wide mb-2">{t('qAccepted')}</p>
          <div className="flex flex-wrap gap-2">
            {answers.map((a) => (
              <span key={a.id} className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-medium">
                {a.answer_text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Explanations */}
      {(detail.ai_explanation || detail.teacher_explanation) && (
        <div className="space-y-3 pt-2 border-t border-hairline-light">
          {detail.teacher_explanation && (
            <div>
              <p className="text-xs font-semibold text-mute-light uppercase tracking-wide mb-1">{t('qTeacherExplanation')}</p>
              <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{detail.teacher_explanation}</p>
            </div>
          )}
          {detail.ai_explanation && (
            <div>
              <p className="text-xs font-semibold text-mute-light uppercase tracking-wide mb-1">{t('qAiExplanation')}</p>
              <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{detail.ai_explanation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Copy-to-Class Modal ──────────────────────────────────────────────────────

interface Course { id: string; title: string }
interface ClassItem { id: string; title: string }
interface WeekItem { id: string; title: string; order: number }

interface CopyToClassModalProps {
  assignmentId: string
  sourceInstance: InstanceRow | null
  assignedClassIds: string[]
  onClose: () => void
  onSuccess: () => void
}

function CopyToClassModal({ assignmentId, sourceInstance, assignedClassIds, onClose, onSuccess }: CopyToClassModalProps) {
  const t = useTranslations('teacher.assignments')

  // ── Cascading selects data ────────────────────────────────────────────────
  const [courses, setCourses] = useState<Course[]>([])
  const [coursesLoading, setCoursesLoading] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState('')

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [classesLoading, setClassesLoading] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState('')

  const [weeks, setWeeks] = useState<WeekItem[]>([])
  const [weeksLoading, setWeeksLoading] = useState(false)
  const [selectedWeekId, setSelectedWeekId] = useState('')

  // ── Form fields ───────────────────────────────────────────────────────────
  const defaultDeadline = sourceInstance
    ? toDateTimeLocalValue(sourceInstance.deadline)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)

  const [deadline, setDeadline] = useState(defaultDeadline)
  const [isTimed, setIsTimed] = useState(sourceInstance?.is_timed ?? true)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(
    sourceInstance?.time_limit_seconds ? String(Math.round(sourceInstance.time_limit_seconds / 60)) : '60'
  )
  const [maxRetakes, setMaxRetakes] = useState(sourceInstance?.max_retakes ?? 0)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const assignedClassIdSet = useMemo(() => new Set(assignedClassIds), [assignedClassIds])
  const availableClasses = useMemo(() => {
    const seen = new Set<string>()
    return classes.filter((classItem) => {
      if (seen.has(classItem.id) || assignedClassIdSet.has(classItem.id)) return false
      seen.add(classItem.id)
      return true
    })
  }, [assignedClassIdSet, classes])

  // ── Fetch courses on mount (active only — end_date >= today) ─────────────
  useEffect(() => {
    setCoursesLoading(true)
    fetch('/api/courses?active_only=true')
      .then((r) => r.json())
      .then((json) => setCourses(json.data ?? []))
      .finally(() => setCoursesLoading(false))
  }, [])

  // ── Fetch classes when course changes ────────────────────────────────────
  useEffect(() => {
    if (!selectedCourseId) { setClasses([]); setSelectedClassId(''); return }
    setClassesLoading(true)
    setSelectedClassId('')
    setClasses([])
    fetch(`/api/classes?course_id=${selectedCourseId}`)
      .then((r) => r.json())
      .then((json) => setClasses(json.data ?? []))
      .finally(() => setClassesLoading(false))
  }, [selectedCourseId])

  // ── Fetch weeks when class changes ───────────────────────────────────────
  useEffect(() => {
    if (!selectedClassId) { setWeeks([]); setSelectedWeekId(''); return }
    setWeeksLoading(true)
    setSelectedWeekId('')
    setWeeks([])
    fetch(`/api/weeks?class_id=${selectedClassId}`)
      .then((r) => r.json())
      .then((json) => setWeeks(json.data ?? []))
      .finally(() => setWeeksLoading(false))
  }, [selectedClassId])

  useEffect(() => {
    if (selectedClassId && !availableClasses.some((classItem) => classItem.id === selectedClassId)) {
      setSelectedClassId('')
    }
  }, [availableClasses, selectedClassId])

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (!selectedClassId)  { setFormError(t('copyErrNoClass')); return }
    if (assignedClassIdSet.has(selectedClassId)) { setFormError(t('copyErrAlreadyAssigned')); return }
    if (!selectedWeekId)   { setFormError(t('copyErrNoWeek')); return }
    if (!deadline)         { setFormError(t('copyErrNoDeadline')); return }

    setSubmitting(true)
    try {
      const body = {
        assignment_id:      assignmentId,
        class_id:           selectedClassId,
        week_id:            selectedWeekId,
        deadline:           new Date(deadline).toISOString(),
        is_timed:           isTimed,
        time_limit_seconds: isTimed ? parseInt(timeLimitMinutes, 10) * 60 : null,
        max_retakes:        maxRetakes,
      }

      const res  = await fetch('/api/assignment-instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setFormError(t('copyErrFailed', { msg: json.error ?? '—' }))
        return
      }
      onSuccess()
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const selectClass =
    'h-10 w-full rounded-[6px] border border-ash-light bg-canvas-light px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:bg-surface-soft'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Course */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">{t('copyLabelCourse')}</label>
        <select
          className={selectClass}
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          disabled={coursesLoading}
        >
          <option value="">{coursesLoading ? t('qLoading') : t('copySelectCourse')}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      {/* Class */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">{t('copyLabelClass')}</label>
        <select
          className={selectClass}
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
          disabled={!selectedCourseId || classesLoading}
        >
          <option value="">{classesLoading ? t('qLoading') : t('copySelectClass')}</option>
          {availableClasses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        {!classesLoading && selectedCourseId && availableClasses.length === 0 && (
          <p className="text-xs text-mute-light">{t('copyNoAvailableClasses')}</p>
        )}
      </div>

      {/* Week */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">{t('copyLabelWeek')}</label>
        <select
          className={selectClass}
          value={selectedWeekId}
          onChange={(e) => setSelectedWeekId(e.target.value)}
          disabled={!selectedClassId || weeksLoading}
        >
          <option value="">{weeksLoading ? t('qLoading') : t('copySelectWeek')}</option>
          {weeks.map((w) => (
            <option key={w.id} value={w.id}>{w.title}</option>
          ))}
        </select>
      </div>

      {/* Deadline */}
      <Input
        id="copy-deadline"
        type="datetime-local"
        label={t('copyLabelDeadline')}
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        required
      />

      {/* Time limit */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 rounded accent-primary"
            checked={isTimed}
            onChange={(e) => setIsTimed(e.target.checked)}
          />
          <span className="text-sm font-medium text-ink">{t('copyLabelTimeLimit')}</span>
        </label>
        {isTimed && (
          <Input
            id="copy-time-limit"
            type="number"
            min={1}
            label={t('copyLabelTimeLimitMinutes')}
            value={timeLimitMinutes}
            onChange={(e) => setTimeLimitMinutes(e.target.value)}
          />
        )}
      </div>

      {/* Max retakes */}
      <Input
        id="copy-max-retakes"
        type="number"
        min={0}
        label={t('copyLabelMaxRetakes')}
        value={String(maxRetakes)}
        onChange={(e) => setMaxRetakes(parseInt(e.target.value, 10) || 0)}
      />

      {/* Error */}
      {formError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-warning">{formError}</p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
          {t('cancelBtn')}
        </Button>
        <Button type="submit" size="sm" loading={submitting}>
          {submitting ? t('copySubmitting') : t('copySubmitBtn')}
        </Button>
      </div>
    </form>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignmentDetailClient({ assignment, instances, submissions, questions }: Props) {
  const t = useTranslations('teacher.assignments')
  const locale = useLocale()
  const dateLocale = locale === 'vi' ? 'vi-VN' : 'en-US'
  const questionCount = questions.length
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(instances[0]?.id ?? '')
  const [publishLoading, setPublishLoading] = useState<string | null>(null)
  const [deadlineEditInstanceId, setDeadlineEditInstanceId] = useState<string | null>(null)
  const [deadlineDraft, setDeadlineDraft] = useState('')
  const [deadlineLoading, setDeadlineLoading] = useState(false)
  const [deadlineError, setDeadlineError] = useState('')
  const [questionSearch, setQuestionSearch] = useState('')
  // selectedQuestion = the lightweight row; detailLoading/questionDetail = lazy fetch state
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionRow | null>(null)
  const [questionDetail, setQuestionDetail] = useState<QuestionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  // Copy-to-class modal
  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const assignedClassIds = useMemo(
    () => Array.from(new Set(instances.map((instance) => instance.class_id).filter(Boolean))),
    [instances]
  )

  async function openQuestion(aq: QuestionRow) {
    setSelectedQuestion(aq)
    setQuestionDetail(null)
    setDetailLoading(true)
    try {
      const res  = await fetch(`/api/questions/${aq.question.id}`)
      const json = await res.json()
      if (json.data) setQuestionDetail(json.data as QuestionDetail)
    } catch {
      // leave detailLoading=false, modal shows error state
    } finally {
      setDetailLoading(false)
    }
  }

  const filteredQuestions = useMemo(() => {
    const q = questionSearch.trim().toLowerCase()
    if (!q) return questions
    return questions.filter((aq) =>
      aq.question.content.toLowerCase().includes(q)
    )
  }, [questions, questionSearch])

  const selectedInstance = instances.find((i) => i.id === selectedInstanceId)

  const instanceSubmissions = submissions.filter((s) => s.instance_id === selectedInstanceId)
  const submittedCount = instanceSubmissions.filter((s) => s.status === 'submitted').length

  const now = new Date().toISOString()

  useEffect(() => {
    setDeadlineEditInstanceId(null)
    setDeadlineDraft('')
    setDeadlineError('')
  }, [selectedInstanceId])

  // Stats for selected instance
  const scores = instanceSubmissions
    .filter((s) => s.status === 'submitted' && s.raw_score !== null && s.total_questions)
    .map((s) => Math.round(((s.raw_score ?? 0) / (s.total_questions ?? 1)) * 100))

  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  const maxScore = scores.length > 0 ? Math.max(...scores) : null
  const minScore = scores.length > 0 ? Math.min(...scores) : null

  // Overview totals across every instance
  const totalSubmitted = submissions.filter((s) => s.status === 'submitted').length
  const overallScores = submissions
    .filter((s) => s.status === 'submitted' && s.raw_score !== null && s.total_questions)
    .map((s) => Math.round(((s.raw_score ?? 0) / (s.total_questions ?? 1)) * 100))
  const overallAvg = overallScores.length > 0
    ? Math.round(overallScores.reduce((a, b) => a + b, 0) / overallScores.length)
    : null

  const stats = [
    { label: t('statQuestions'), value: String(questionCount), Icon: IconQuestions, accent: false },
    { label: t('statInstances'), value: String(instances.length), Icon: IconClasses, accent: false },
    { label: t('statSubmitted'), value: String(totalSubmitted), Icon: IconSubmissions, accent: false },
    { label: t('avgScore'), value: overallAvg !== null ? `${overallAvg}%` : '—', Icon: IconAvg, accent: true },
  ]

  async function togglePublish(instance: InstanceRow) {
    setPublishLoading(instance.id)
    try {
      const newPublishedAt = instance.published_at ? null : new Date().toISOString()
      const res = await fetch(`/api/assignment-instances/${instance.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published_at: newPublishedAt }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        alert(t('errUpdate', { msg: json.error ?? '—' }))
        return
      }
      window.location.reload()
    } finally {
      setPublishLoading(null)
    }
  }

  function startDeadlineEdit(instance: InstanceRow) {
    setDeadlineEditInstanceId(instance.id)
    setDeadlineDraft(toDateTimeLocalValue(instance.deadline))
    setDeadlineError('')
  }

  async function updateDeadline(instance: InstanceRow) {
    setDeadlineError('')
    if (!deadlineDraft) {
      setDeadlineError(t('copyErrNoDeadline'))
      return
    }

    setDeadlineLoading(true)
    try {
      const res = await fetch(`/api/assignment-instances/${instance.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deadline: new Date(deadlineDraft).toISOString() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setDeadlineError(t('errUpdate', { msg: json.error ?? '—' }))
        return
      }
      window.location.reload()
    } finally {
      setDeadlineLoading(false)
    }
  }

  function formatDeadline(value: string) {
    return new Date(value).toLocaleDateString(dateLocale, {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-10">
      {/* ── Overview: single bordered strip, divider-grouped (no gradient boxes) ── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 overflow-hidden rounded-card border border-hairline-light bg-canvas-light shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={[
              'animate-fade-up p-5 sm:p-6',
              i % 2 === 1 ? 'border-l border-hairline-light' : '',
              i >= 2 ? 'border-t border-hairline-light lg:border-t-0 lg:border-l' : '',
              i === 2 ? 'lg:border-l' : '',
            ].join(' ')}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-mute-light">{s.label}</p>
              <s.Icon className={['h-4 w-4', s.accent ? 'text-primary' : 'text-ash-light'].join(' ')} />
            </div>
            <p className={['mt-2 font-display text-3xl font-bold tabular-nums', s.accent ? 'text-primary' : 'text-ink'].join(' ')}>
              {s.value}
            </p>
          </div>
        ))}
      </section>

      {/* ── Questions ────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-lg font-semibold text-ink">{t('questionList')}</h2>
            <span className="rounded-full bg-surface-soft px-2 py-0.5 text-xs font-semibold text-mute-light tabular-nums">
              {questionCount}
            </span>
          </div>
          <div className="w-full sm:w-72">
            <Input
              placeholder={t('searchQuestion')}
              value={questionSearch}
              onChange={(e) => setQuestionSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-card border border-hairline-light bg-canvas-light shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline-light bg-surface-soft/60">
                <th className="w-12 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-mute-light">{t('qColNum')}</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-mute-light">{t('qColContent')}</th>
                <th className="hidden w-32 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-mute-light md:table-cell">{t('qColType')}</th>
                <th className="w-28 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-mute-light">{t('qColDifficulty')}</th>
                <th className="hidden w-20 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-mute-light sm:table-cell">{t('qColScore')}</th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light">
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-mute-light">
                    {questionSearch ? t('qNotFound') : t('qNone')}
                  </td>
                </tr>
              ) : (
                filteredQuestions.map((aq, idx) => {
                  const diff = aq.question.difficulty ?? ''
                  const diffLabel: Record<string, string> = { easy: t('diffEasy'), medium: t('diffMedium'), hard: t('diffHard') }
                  const diffVariant: Record<string, 'success' | 'warning' | 'error'> = { easy: 'success', medium: 'warning', hard: 'error' }
                  const typeLabel = aq.question.type === 'multiple_choice' ? t('questionTypeMc') : t('questionTypeSa')

                  return (
                    <tr
                      key={aq.id}
                      onClick={() => openQuestion(aq)}
                      className="group cursor-pointer transition-colors hover:bg-surface-soft/60"
                    >
                      <td className="px-4 py-3.5 align-top font-display text-xs font-semibold tabular-nums text-mute-light">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="max-w-md px-4 py-3.5 align-top">
                        <p className="line-clamp-2 text-ink">{aq.question.content}</p>
                      </td>
                      <td className="hidden px-4 py-3.5 align-top text-xs text-mute-light md:table-cell">{typeLabel}</td>
                      <td className="px-4 py-3.5 align-top">
                        {diff ? (
                          <Badge variant={diffVariant[diff] ?? 'muted'}>{diffLabel[diff] ?? diff}</Badge>
                        ) : (
                          <span className="text-xs text-mute-light">—</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3.5 align-top text-xs tabular-nums text-ink sm:table-cell">{aq.score_weight}</td>
                      <td className="px-4 py-3.5 align-top text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                          {t('qView')}
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Instances + results: asymmetric master/detail ──────────────────────── */}
      {instances.length > 0 ? (
        <section className="grid gap-6 lg:grid-cols-12">
          {/* Master rail */}
          <div className="space-y-3 lg:col-span-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">{t('instanceListTitle')}</h2>
              <button
                onClick={() => setCopyModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-ash-light bg-canvas-light px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-soft active:scale-[0.98]"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {t('copyToClassBtn')}
              </button>
            </div>
            <div className="space-y-2">
              {instances.map((inst) => {
                const isExpired = inst.deadline < now
                const isPublished = !!inst.published_at
                const instSubs = submissions.filter((s) => s.instance_id === inst.id && s.status === 'submitted')
                const active = selectedInstanceId === inst.id

                return (
                  <button
                    key={inst.id}
                    onClick={() => setSelectedInstanceId(inst.id)}
                    className={[
                      'flex w-full items-start gap-3 rounded-card border px-4 py-3.5 text-left transition-all',
                      active
                        ? 'border-primary bg-blue-50/40 ring-1 ring-primary'
                        : 'border-hairline-light bg-canvas-light hover:border-ash-light hover:bg-surface-soft/50',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'mt-0.5 h-2 w-2 shrink-0 rounded-full',
                        isExpired ? 'bg-ash-light' : isPublished ? 'bg-emerald-500' : 'bg-amber-500',
                      ].join(' ')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {inst.classes?.title ?? '—'}
                        {inst.weeks ? ` · ${inst.weeks.title}` : ''}
                      </span>
                      <span className="mt-0.5 block text-xs text-mute-light">
                        {t('instanceSubmittedCount', { count: instSubs.length })}
                      </span>
                    </span>
                    {isExpired ? (
                      <Badge variant="muted">{t('instanceExpired')}</Badge>
                    ) : isPublished ? (
                      <Badge variant="success">{t('instanceOpen')}</Badge>
                    ) : (
                      <Badge variant="warning">{t('instanceDraft')}</Badge>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-8">
            {selectedInstance && (
              <div key={selectedInstance.id} className="animate-fade-in space-y-5">
                {/* Header + actions */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="font-display text-lg font-semibold text-ink">
                    {t('resultsTitle', { class: selectedInstance.classes?.title ?? '—' })}
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => startDeadlineEdit(selectedInstance)}>
                      {t('editDeadlineBtn')}
                    </Button>
                    <Button
                      size="sm"
                      variant={selectedInstance.published_at ? 'danger' : 'primary'}
                      loading={publishLoading === selectedInstance.id}
                      onClick={() => togglePublish(selectedInstance)}
                    >
                      {selectedInstance.published_at ? t('unpublishBtn') : t('publishBtn')}
                    </Button>
                  </div>
                </div>

                {/* Deadline + week meta */}
                <div className="rounded-card border border-hairline-light bg-canvas-light p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  {deadlineEditInstanceId === selectedInstance.id ? (
                    <div className="space-y-3">
                      <Input
                        id={`deadline-${selectedInstance.id}`}
                        type="datetime-local"
                        label={t('copyLabelDeadline')}
                        value={deadlineDraft}
                        onChange={(e) => setDeadlineDraft(e.target.value)}
                      />
                      {deadlineError && (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-warning">{deadlineError}</p>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={deadlineLoading}
                          onClick={() => {
                            setDeadlineEditInstanceId(null)
                            setDeadlineDraft('')
                            setDeadlineError('')
                          }}
                        >
                          {t('cancelBtn')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          loading={deadlineLoading}
                          onClick={() => updateDeadline(selectedInstance)}
                        >
                          {deadlineLoading ? t('savingDeadline') : t('saveDeadlineBtn')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-mute-light">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute-light">{t('copyLabelDeadline')}</p>
                          <p className="mt-0.5 text-sm font-semibold text-ink tabular-nums">
                            {formatDeadline(selectedInstance.deadline)}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-surface-soft px-3 py-1 text-xs font-medium text-mute-light">
                        {selectedInstance.weeks?.title ?? '—'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Class stats — divider-grouped strip */}
                {submittedCount > 0 && (
                  <div className="grid grid-cols-3 overflow-hidden rounded-card border border-hairline-light bg-canvas-light shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                    <div className="p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-mute-light">{t('avgScore')}</p>
                      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{avgScore !== null ? `${avgScore}%` : '—'}</p>
                    </div>
                    <div className="border-l border-hairline-light p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-mute-light">{t('maxScore')}</p>
                      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-emerald-600">{maxScore !== null ? `${maxScore}%` : '—'}</p>
                    </div>
                    <div className="border-l border-hairline-light p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-mute-light">{t('minScore')}</p>
                      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-rose-500">{minScore !== null ? `${minScore}%` : '—'}</p>
                    </div>
                  </div>
                )}

                {/* Submission progress — single accent */}
                <div className="rounded-card border border-hairline-light bg-canvas-light p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  <div className="mb-2.5 flex items-center justify-between">
                    <p className="text-sm font-medium text-ink">{t('progressTitle')}</p>
                    <p className="text-sm tabular-nums text-mute-light">{t('progressSubmitted', { count: submittedCount })}</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-soft">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: instanceSubmissions.length > 0 ? `${(submittedCount / instanceSubmissions.length) * 100}%` : '0%' }}
                    />
                  </div>
                </div>

                {/* Per-student results */}
                {instanceSubmissions.length === 0 ? (
                  <EmptyState
                    title={t('noStudents')}
                    description={t('noStudentsDesc')}
                    icon={
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    }
                  />
                ) : (
                  <div className="overflow-x-auto rounded-card border border-hairline-light bg-canvas-light shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                    <div className="min-w-[480px]">
                      <div className="grid grid-cols-[1fr_72px_72px_72px_96px] gap-4 border-b border-hairline-light bg-surface-soft/60 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-mute-light">
                        <span>{t('colStudent')}</span>
                        <span className="text-center">{t('colScore')}</span>
                        <span className="text-center">{t('colCorrect')}</span>
                        <span className="text-center">{t('colTime')}</span>
                        <span className="text-center">{t('colStatStatus')}</span>
                      </div>

                      <div className="divide-y divide-hairline-light">
                        {instanceSubmissions.map((sub) => {
                          const pct = scorePercent(sub.raw_score, sub.total_questions)
                          const isSubmitted = sub.status === 'submitted'
                          const name = sub.profiles?.full_name ?? t('unknownStudent')

                          return (
                            <div
                              key={sub.id}
                              className="grid grid-cols-[1fr_72px_72px_72px_96px] items-center gap-4 px-5 py-3 text-sm transition-colors hover:bg-surface-soft/50"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-soft text-[11px] font-semibold text-mute-light">
                                  {initials(name)}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-ink">{name}</p>
                                  <p className="truncate text-xs text-mute-light">{sub.profiles?.phone ?? '—'}</p>
                                </div>
                              </div>
                              <div className="text-center">
                                {pct !== null ? (
                                  <span className={['font-bold tabular-nums', scoreTone(pct)].join(' ')}>{pct}%</span>
                                ) : <span className="text-mute-light">—</span>}
                              </div>
                              <div className="text-center text-xs tabular-nums text-mute-light">
                                {isSubmitted ? `${sub.raw_score ?? 0}/${sub.total_questions ?? questionCount}` : '—'}
                              </div>
                              <div className="text-center text-xs tabular-nums text-mute-light">
                                {formatSeconds(sub.time_spent_seconds)}
                              </div>
                              <div className="flex justify-center">
                                {isSubmitted ? (
                                  <Badge variant="success">{t('statusSubmitted')}</Badge>
                                ) : sub.status === 'in_progress' ? (
                                  <Badge variant="warning">{t('statusInProgress')}</Badge>
                                ) : (
                                  <Badge variant="muted">{t('statusNotStarted')}</Badge>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        <EmptyState
          title={t('noInstances')}
          description={t('noInstancesDesc')}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
          action={
            <Button size="sm" onClick={() => setCopyModalOpen(true)}>
              {t('copyToClassBtn')}
            </Button>
          }
        />
      )}

      {/* Question detail modal — content fetched lazily on open */}
      {selectedQuestion && (
        <Modal
          open={!!selectedQuestion}
          onClose={() => { setSelectedQuestion(null); setQuestionDetail(null) }}
          title={t('qModalTitle', { n: questions.indexOf(selectedQuestion) + 1 })}
          size="xl"
        >
          {detailLoading ? (
            <LoadingBlock label={t('qLoading')} className="py-12" />
          ) : questionDetail ? (
            <QuestionDetailView detail={questionDetail} aq={selectedQuestion} />
          ) : (
            <div className="flex items-center justify-center py-12 text-mute-light text-sm">
              {t('qFetchError')}
            </div>
          )}
        </Modal>
      )}

      {/* Copy-to-class modal */}
      <Modal
        open={copyModalOpen}
        onClose={() => setCopyModalOpen(false)}
        title={t('copyModalTitle')}
        size="md"
      >
        <CopyToClassModal
          assignmentId={assignment.id}
          sourceInstance={selectedInstance ?? null}
          assignedClassIds={assignedClassIds}
          onClose={() => setCopyModalOpen(false)}
          onSuccess={() => {
            setCopyModalOpen(false)
            window.location.reload()
          }}
        />
      </Modal>
    </div>
  )
}
