'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

interface PageProps {
  params: { id: string }
}

interface CourseRow {
  id: string
  title: string
  start_date: string
  end_date: string
}

const WEEKDAY_VALUES = ['2', '3', '4', '5', '6', '7', 'CN']

type TextField = 'title' | 'start_time' | 'end_time'

function formatDate(date: string, locale: string) {
  return new Date(date).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')
}

export default function NewClassPage({ params }: PageProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('teacher.classes')
  const tNav = useTranslations('nav')
  const tCommon = useTranslations('common')

  const WEEKDAYS = WEEKDAY_VALUES.map((value) => ({
    value,
    label: value === 'CN' ? t('weekdayCN') : t(`weekday${value}` as Parameters<typeof t>[0]),
  }))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [course, setCourse] = useState<CourseRow | null>(null)
  const [courseLoading, setCourseLoading] = useState(true)
  const [form, setForm] = useState({
    title: '',
    weekdays: [] as string[],
    start_time: '',
    end_time: '',
  })

  function handleChange(field: TextField, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  function toggleWeekday(day: string) {
    setForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((item) => item !== day)
        : [...prev.weekdays, day],
    }))
    setError(null)
  }

  const scheduleText = useMemo(() => {
    if (form.weekdays.length === 0 || !form.start_time || !form.end_time) return ''
    const orderedDays = WEEKDAY_VALUES.filter((day) => form.weekdays.includes(day))
    const dayLabels = orderedDays.map((day) => {
      const found = WEEKDAYS.find((w) => w.value === day)
      return found?.label ?? day
    })
    return `${dayLabels.join(', ')} - ${form.start_time} ${t('scheduleTo')} ${form.end_time}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.end_time, form.start_time, form.weekdays, locale])

  useEffect(() => {
    let mounted = true

    async function loadCourse() {
      setCourseLoading(true)
      try {
        const res = await fetch(`/api/courses/${params.id}`)
        const json: { data?: CourseRow | null; error?: string | null } = await res.json()
        if (!mounted) return
        if (!res.ok || json.error || !json.data) {
          setError(json.error ?? t('errLoadCourse'))
          return
        }
        setCourse(json.data)
      } catch {
        if (mounted) setError(t('errLoadCourse'))
      } finally {
        if (mounted) setCourseLoading(false)
      }
    }

    loadCourse()
    return () => {
      mounted = false
    }
  }, [params.id])

  function validate(): string | null {
    if (!form.title.trim()) return t('errMissingTitle')
    if (form.weekdays.length === 0) return t('errMissingWeekdays')
    if (!form.start_time || !form.end_time) return t('errMissingTime')
    if (form.start_time >= form.end_time) return t('errTimeOrder')
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: params.id,
          title: form.title.trim(),
          schedule_text: scheduleText,
        }),
      })

      let json: { data?: { id: string; title: string } | null; error?: string | null }
      try {
        json = await res.json()
      } catch {
        setError(t('errInvalidResponse'))
        return
      }

      if (!res.ok || json.error) {
        setError(json.error ?? t('errGeneric'))
        return
      }

      if (!json.data?.id) {
        setError(t('errFailed'))
        return
      }

      router.push(`/${locale}/teacher/courses/${params.id}/classes/${json.data.id}`)
      router.refresh()
    } catch (err) {
      console.error('Create class error:', err)
      setError(t('errGeneric'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-3.5rem)] bg-slate-50 p-4 md:-m-8 md:min-h-screen md:p-8">
      <div className="max-w-2xl">
        <PageHeader
          title={t('addTitle')}
          breadcrumbs={[
            { label: tNav('courses'), href: '/teacher/courses' },
            { label: tNav('courses'), href: `/teacher/courses/${params.id}` },
            { label: t('breadcrumbAddClass') },
          ]}
        />

        <Card className="rounded-[8px] border border-slate-200 bg-white p-5 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && (
              <div className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-mute-light">{t('labelCourse')}</p>
                <p className="mt-0.5 text-sm font-medium text-ink">
                  {courseLoading ? t('loading') : course?.title ?? t('noCourseInfo')}
                </p>
              </div>
              <p className="text-sm text-mute-light">
                {course ? `${formatDate(course.start_date, locale)} - ${formatDate(course.end_date, locale)}` : ''}
              </p>
            </div>

            <Input
              label={t('labelTitle')}
              placeholder={t('placeholderTitle')}
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
            />

            <div className="space-y-2.5">
              <div>
                <p className="text-sm font-medium text-ink">{t('labelSchedule')}</p>
                <p className="mt-1 text-xs text-mute-light">
                  {t('scheduleHint')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => {
                  const selected = form.weekdays.includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleWeekday(day.value)}
                      className={[
                        'min-w-20 rounded-[6px] border px-3 py-2 text-sm font-medium transition-colors',
                        selected
                          ? 'border-primary bg-blue-50 text-primary'
                          : 'border-slate-200 bg-white text-ink hover:border-slate-300 hover:bg-slate-50',
                      ].join(' ')}
                      aria-pressed={selected}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('labelStartTime')}
                type="time"
                value={form.start_time}
                onChange={(e) => handleChange('start_time', e.target.value)}
              />
              <Input
                label={t('labelEndTime')}
                type="time"
                value={form.end_time}
                onChange={(e) => handleChange('end_time', e.target.value)}
              />
            </div>

            <div className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-mute-light">{t('schedulePreview')}</p>
              <p className="mt-1 text-sm text-ink">
                {scheduleText || t('scheduleEmpty')}
              </p>
            </div>

            <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
              <Button type="submit" size="sm" loading={loading}>
                {t('submitBtn')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => router.back()}>
                {tCommon('cancel')}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
