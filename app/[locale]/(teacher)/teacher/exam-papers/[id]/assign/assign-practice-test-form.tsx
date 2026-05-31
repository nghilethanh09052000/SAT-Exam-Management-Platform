'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Course = { id: string; title: string }
type ClassRow = { id: string; title: string; course_id: string }
type Week = { id: string; title: string; class_id: string }

export function AssignPracticeTestForm({
  practiceTestId,
  courses,
  classes,
  weeks,
}: {
  practiceTestId: string
  courses: Course[]
  classes: ClassRow[]
  weeks: Week[]
}) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('teacher.examPapers')
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const availableClasses = useMemo(() => classes.filter((cls) => cls.course_id === courseId), [classes, courseId])
  const [classId, setClassId] = useState(availableClasses[0]?.id ?? '')
  const availableWeeks = useMemo(() => weeks.filter((week) => week.class_id === classId), [weeks, classId])
  const [weekId, setWeekId] = useState('')
  const [deadline, setDeadline] = useState('')
  const [publishNow, setPublishNow] = useState(true)
  const [isTimed, setIsTimed] = useState(true)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState('134')
  const [maxRetakes, setMaxRetakes] = useState('0')
  const [showResults, setShowResults] = useState<'immediately' | 'after_deadline'>('immediately')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (!classId || !deadline) {
      setError(t('assignErrRequired'))
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/practice-tests/${practiceTestId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: [{ class_id: classId, week_id: weekId || null }],
          deadline: new Date(deadline).toISOString(),
          is_timed: isTimed,
          time_limit_seconds: isTimed ? Math.max(1, Number(timeLimitMinutes) || 134) * 60 : null,
          show_results: showResults,
          max_retakes: Math.max(0, Number(maxRetakes) || 0),
          published_at: publishNow ? new Date().toISOString() : null,
        }),
      })
      const json = await response.json()
      if (!response.ok || json.error) {
        setError(json.error ?? t('errGeneric'))
        return
      }
      router.push(`/${locale}/teacher/exam-papers/${practiceTestId}`)
      router.refresh()
    } catch {
      setError(t('errGeneric'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-2xl space-y-4 p-5">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-warning">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-semibold text-ink">
          <span>{t('assignCourse')}</span>
          <select
            value={courseId}
            onChange={(event) => {
              const nextCourse = event.target.value
              const nextClass = classes.find((cls) => cls.course_id === nextCourse)?.id ?? ''
              setCourseId(nextCourse)
              setClassId(nextClass)
              setWeekId('')
            }}
            className="h-10 w-full rounded-lg border border-ash-light bg-white px-3 text-sm"
          >
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-semibold text-ink">
          <span>{t('assignClass')}</span>
          <select
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value)
              setWeekId('')
            }}
            className="h-10 w-full rounded-lg border border-ash-light bg-white px-3 text-sm"
          >
            {availableClasses.map((cls) => <option key={cls.id} value={cls.id}>{cls.title}</option>)}
          </select>
        </label>
      </div>
      <label className="space-y-1.5 text-sm font-semibold text-ink">
        <span>{t('assignWeek')}</span>
        <select
          value={weekId}
          onChange={(event) => setWeekId(event.target.value)}
          className="h-10 w-full rounded-lg border border-ash-light bg-white px-3 text-sm"
        >
          <option value="">{t('assignNoWeek')}</option>
          {availableWeeks.map((week) => <option key={week.id} value={week.id}>{week.title}</option>)}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('assignDeadline')} type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
        <Input label={t('assignRetakes')} type="number" min={0} value={maxRetakes} onChange={(event) => setMaxRetakes(event.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-xl border border-ash-light p-3 text-sm font-semibold text-ink">
          <input type="checkbox" checked={isTimed} onChange={(event) => setIsTimed(event.target.checked)} />
          {t('assignTimed')}
        </label>
        <Input label={t('assignTimeLimit')} type="number" min={1} disabled={!isTimed} value={timeLimitMinutes} onChange={(event) => setTimeLimitMinutes(event.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-semibold text-ink">
          <span>{t('assignShowResults')}</span>
          <select value={showResults} onChange={(event) => setShowResults(event.target.value as 'immediately' | 'after_deadline')} className="h-10 w-full rounded-lg border border-ash-light bg-white px-3 text-sm">
            <option value="immediately">{t('assignShowImmediately')}</option>
            <option value="after_deadline">{t('assignShowAfterDeadline')}</option>
          </select>
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-ash-light p-3 text-sm font-semibold text-ink">
          <input type="checkbox" checked={publishNow} onChange={(event) => setPublishNow(event.target.checked)} />
          {t('assignPublishNow')}
        </label>
      </div>
      <div className="flex gap-3 pt-2">
        <Button onClick={submit} loading={loading}>{t('assignSave')}</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>{t('cancelBtn')}</Button>
      </div>
    </Card>
  )
}
