'use client'

import { useState, useMemo, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'

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
  module: string
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

function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
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
        {aq.module && (
          <span className="px-2.5 py-1 rounded-full bg-surface-soft text-mute-light font-medium">{aq.module}</span>
        )}
        <span className="px-2.5 py-1 rounded-full bg-surface-soft text-mute-light font-medium">{aq.score_weight}</span>
      </div>

      {/* Question content */}
      <div>
        <p className="text-xs font-semibold text-mute-light uppercase tracking-wide mb-1.5">{t('qContent')}</p>
        <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{detail.content}</p>
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
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-surface-soft text-ink',
                ].join(' ')}
              >
                <span className="shrink-0 font-bold w-5">{opt.label}.</span>
                <span className="flex-1">{opt.content}</span>
                {opt.is_correct && (
                  <svg className="shrink-0 w-4 h-4 text-green-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
              <span key={a.id} className="px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-800 text-sm font-medium">
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
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Course */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-ink">{t('copyLabelCourse')}</label>
        <select
          className="h-10 w-full rounded-[6px] border border-ash-light bg-canvas-light px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50"
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
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-ink">{t('copyLabelClass')}</label>
        <select
          className="h-10 w-full rounded-[6px] border border-ash-light bg-canvas-light px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50"
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
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-ink">{t('copyLabelWeek')}</label>
        <select
          className="h-10 w-full rounded-[6px] border border-ash-light bg-canvas-light px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50"
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
        <p className="text-sm text-warning">{formError}</p>
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
      aq.question.content.toLowerCase().includes(q) ||
      aq.module.toLowerCase().includes(q)
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="relative overflow-hidden border border-white/70 bg-white p-5 shadow-sm animate-fade-up">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
          <p className="text-xs text-mute-light mb-1">{t('statQuestions')}</p>
          <p className="text-2xl font-display font-bold text-ink">{questionCount}</p>
        </Card>
        <Card className="relative overflow-hidden border border-white/70 bg-white p-5 shadow-sm animate-fade-up" style={{ animationDelay: '60ms' }}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
          <p className="text-xs text-mute-light mb-1">{t('statInstances')}</p>
          <p className="text-2xl font-display font-bold text-ink">{instances.length}</p>
        </Card>
        <Card className="relative overflow-hidden border border-white/70 bg-white p-5 shadow-sm animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
          <p className="text-xs text-mute-light mb-1">{t('statSubmitted')}</p>
          <p className="text-2xl font-display font-bold text-ink">{submissions.filter((s) => s.status === 'submitted').length}</p>
        </Card>
      </div>

      {/* Questions table */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-4">
          <h2 className="font-display font-semibold text-ink shrink-0">{t('questionList')}</h2>
          <div className="w-72">
            <Input
              placeholder={t('searchQuestion')}
              value={questionSearch}
              onChange={(e) => setQuestionSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-card border border-hairline-light">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline-light bg-surface-soft">
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase tracking-wide w-10">{t('qColNum')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase tracking-wide">{t('qColContent')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase tracking-wide w-32">{t('qColType')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase tracking-wide w-28">{t('qColDifficulty')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase tracking-wide w-24">{t('qColScore')}</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="bg-canvas-light divide-y divide-hairline-light">
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-mute-light">
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
                    <tr key={aq.id} className="hover:bg-surface-soft transition-colors">
                      <td className="px-4 py-3 text-mute-light text-xs">{idx + 1}</td>
                      <td className="px-4 py-3 text-ink max-w-xs">
                        <p className="line-clamp-2">{aq.question.content}</p>
                        {aq.module && <p className="text-xs text-mute-light mt-0.5">{aq.module}</p>}
                      </td>
                      <td className="px-4 py-3 text-mute-light text-xs">{typeLabel}</td>
                      <td className="px-4 py-3">
                        {diff ? (
                          <Badge variant={diffVariant[diff] ?? 'muted'}>{diffLabel[diff] ?? diff}</Badge>
                        ) : (
                          <span className="text-mute-light text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink text-xs">{aq.score_weight}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openQuestion(aq)}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          {t('qView')}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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

      {/* Instance tabs (if multiple classes/weeks) */}
      {instances.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-ink">{t('instanceListTitle')}</h2>
            <Button size="sm" variant="secondary" onClick={() => setCopyModalOpen(true)}>
              <svg className="w-4 h-4 mr-1.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t('copyToClassBtn')}
            </Button>
          </div>
          <div className="space-y-2">
            {instances.map((inst) => {
              const isExpired = inst.deadline < now
              const isPublished = !!inst.published_at
              const instSubs = submissions.filter((s) => s.instance_id === inst.id && s.status === 'submitted')

              return (
                <button
                  key={inst.id}
                  onClick={() => setSelectedInstanceId(inst.id)}
                  className={[
                    'w-full flex items-center gap-4 px-5 py-4 rounded-card text-left transition-colors border-2',
                    selectedInstanceId === inst.id
                      ? 'border-primary bg-white shadow-lg shadow-blue-100'
                      : 'border-transparent bg-white/80 hover:bg-white',
                  ].join(' ')}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-ink">
                      {inst.classes?.title ?? '—'}
                      {inst.weeks ? ` · ${inst.weeks.title}` : ''}
                    </p>
                    <p className="text-xs text-mute-light mt-0.5">
                      {t('instanceDeadline', { date: new Date(inst.deadline).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-mute-light">{t('instanceSubmittedCount', { count: instSubs.length })}</span>
                    {isExpired ? (
                      <Badge variant="muted">{t('instanceExpired')}</Badge>
                    ) : isPublished ? (
                      <Badge variant="success">{t('instanceOpen')}</Badge>
                    ) : (
                      <Badge variant="warning">{t('instanceDraft')}</Badge>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected instance detail */}
      {selectedInstance && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-ink">
              {t('resultsTitle', { class: selectedInstance.classes?.title ?? '—' })}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => startDeadlineEdit(selectedInstance)}
              >
                {t('editDeadlineBtn')}
              </Button>
              <Button
                size="sm"
                variant={selectedInstance.published_at ? 'danger' : 'secondary'}
                loading={publishLoading === selectedInstance.id}
                onClick={() => togglePublish(selectedInstance)}
              >
                {selectedInstance.published_at ? t('unpublishBtn') : t('publishBtn')}
              </Button>
            </div>
          </div>

          <Card className="border border-white/70 bg-white p-4 shadow-sm">
            {deadlineEditInstanceId === selectedInstance.id ? (
              <div className="space-y-3">
                <Input
                  id={`deadline-${selectedInstance.id}`}
                  type="datetime-local"
                  label={t('copyLabelDeadline')}
                  value={deadlineDraft}
                  onChange={(e) => setDeadlineDraft(e.target.value)}
                />
                {deadlineError && <p className="text-sm text-warning">{deadlineError}</p>}
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-mute-light">{t('copyLabelDeadline')}</p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {new Date(selectedInstance.deadline).toLocaleDateString(dateLocale, {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Ho_Chi_Minh',
                    })}
                  </p>
                </div>
                <p className="text-xs text-mute-light">
                  {selectedInstance.weeks?.title ?? '—'}
                </p>
              </div>
            )}
          </Card>

          {/* Class stats */}
          {submittedCount > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <Card className="border border-white/70 bg-white p-4 text-center shadow-sm">
                <p className="text-xs text-mute-light mb-1">{t('avgScore')}</p>
                <p className="text-xl font-bold text-ink">{avgScore !== null ? `${avgScore}%` : '—'}</p>
              </Card>
              <Card className="border border-white/70 bg-white p-4 text-center shadow-sm">
                <p className="text-xs text-mute-light mb-1">{t('maxScore')}</p>
                <p className="text-xl font-bold text-primary">{maxScore !== null ? `${maxScore}%` : '—'}</p>
              </Card>
              <Card className="border border-white/70 bg-white p-4 text-center shadow-sm">
                <p className="text-xs text-mute-light mb-1">{t('minScore')}</p>
                <p className="text-xl font-bold text-warning">{minScore !== null ? `${minScore}%` : '—'}</p>
              </Card>
            </div>
          )}

          {/* Submission progress bar */}
          <Card className="border border-white/70 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-ink">{t('progressTitle')}</p>
              <p className="text-sm text-mute-light">{t('progressSubmitted', { count: submittedCount })}</p>
            </div>
            <div className="h-2 bg-surface-soft rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400 transition-all"
                style={{ width: instanceSubmissions.length > 0 ? `${(submittedCount / instanceSubmissions.length) * 100}%` : '0%' }}
              />
            </div>
          </Card>

          {/* Per-student table */}
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
            /* Scrollable on small screens */
            <div className="overflow-x-auto rounded-card">
              <div className="min-w-[480px] space-y-1">
                {/* Header */}
                <div className="grid grid-cols-[1fr_80px_80px_80px_100px] gap-4 px-5 py-2 text-xs font-medium text-mute-light uppercase tracking-wide">
                  <span>{t('colStudent')}</span>
                  <span className="text-center">{t('colScore')}</span>
                  <span className="text-center">{t('colCorrect')}</span>
                  <span className="text-center">{t('colTime')}</span>
                  <span className="text-center">{t('colStatStatus')}</span>
                </div>

                {instanceSubmissions.map((sub) => {
                  const pct = scorePercent(sub.raw_score, sub.total_questions)
                  const isSubmitted = sub.status === 'submitted'

                  return (
                    <div
                      key={sub.id}
                      className="grid grid-cols-[1fr_80px_80px_80px_100px] gap-4 items-center rounded-2xl border border-white/70 bg-white px-5 py-3.5 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">
                          {sub.profiles?.full_name ?? t('unknownStudent')}
                        </p>
                        <p className="text-xs text-mute-light">{sub.profiles?.phone ?? '—'}</p>
                      </div>
                      <div className="text-center">
                        {pct !== null ? (
                          <span className={['font-bold', pct >= 70 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'].join(' ')}>
                            {pct}%
                          </span>
                        ) : '—'}
                      </div>
                      <div className="text-center text-mute-light">
                        {isSubmitted ? `${sub.raw_score ?? 0}/${sub.total_questions ?? questionCount}` : '—'}
                      </div>
                      <div className="text-center text-mute-light text-xs">
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
          )}
        </div>
      )}

      {instances.length === 0 && (
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
