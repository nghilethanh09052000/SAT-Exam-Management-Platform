'use client'

import { useMemo, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

interface CourseRow {
  id: string
  title: string
  start_date: string
  end_date: string
  archived_at: string | null
  created_at: string
  teacher_id: string
  profiles: { full_name: string } | null
  student_count: number
  class_count: number
  week_count: number
  assignment_count: number
  revenue_text: string
}

interface Teacher {
  id: string
  full_name: string
}

interface Props {
  courses: CourseRow[]
  teachers: Teacher[]
}

type CourseKind = 'practice' | 'regular'
type CourseStatus = 'active' | 'ended' | 'archived'
type ViewMode = 'grid' | 'list'

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')
}

function getCourseStatus(course: CourseRow): CourseStatus {
  if (course.archived_at) return 'archived'
  if (new Date(course.end_date) < new Date()) return 'ended'
  return 'active'
}

function inferCourseKind(course: CourseRow): CourseKind {
  const title = course.title.toLowerCase()
  if (
    title.includes('luyện') ||
    title.includes('practice') ||
    title.includes('diagnostic') ||
    title.includes('ôn độc') ||
    title.includes('ôn đề')
  ) {
    return 'practice'
  }
  return 'regular'
}

function Icon({
  name,
  className = 'h-5 w-5',
}: {
  name: 'users' | 'teacher' | 'calendar' | 'money' | 'book' | 'layers' | 'clipboard' | 'grid' | 'list' | 'search' | 'arrow' | 'plus'
  className?: string
}) {
  const common = {
    className,
    fill: 'none',
    viewBox: '0 0 24 24',
    stroke: 'currentColor',
    strokeWidth: 2,
  }

  switch (name) {
    case 'users':
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m8-4a4 4 0 10-8 0 4 4 0 008 0zm-8 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
    case 'teacher':
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0118 13.5c0 2.48-2.69 4.5-6 4.5s-6-2.02-6-4.5c0-.98.13-1.96.38-2.922L12 14z" /></svg>
    case 'calendar':
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M5 11h14M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    case 'money':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7v10m3-7.5A2.5 2.5 0 0012.5 7H11a2 2 0 000 4h2a2 2 0 010 4h-1.5A2.5 2.5 0 019 12.5" /></svg>
    case 'book':
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5A7.5 7.5 0 006 4H4v15h2a7.5 7.5 0 016 2.5M12 6.5A7.5 7.5 0 0118 4h2v15h-2a7.5 7.5 0 00-6 2.5M12 6.5v15" /></svg>
    case 'layers':
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 5-9 5-9-5 9-5zm-7 9l7 4 7-4M5 16l7 4 7-4" /></svg>
    case 'clipboard':
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5h6m-7 4h8m-8 4h8m-8 4h5M9 3h6a2 2 0 012 2h1a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h1a2 2 0 012-2z" /></svg>
    case 'grid':
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z" /></svg>
    case 'list':
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
    case 'search':
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" /></svg>
    case 'arrow':
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6l6 6-6 6" /></svg>
    case 'plus':
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" /></svg>
  }
}

function Metric({ icon, children }: { icon: Parameters<typeof Icon>[0]['name']; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] font-medium text-[#2f3137]">
      <span className="text-[#4c7dff]"><Icon name={icon} className="h-[18px] w-[18px]" /></span>
      <span>{children}</span>
    </div>
  )
}

function TeacherLine({ name, teacherLabel, noTeacher }: { name: string | null | undefined; teacherLabel: string; noTeacher: string }) {
  return (
    <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-xl border border-[#e8eefc] bg-[#f7faff] px-3 py-1.5 text-xs font-bold text-[#4d607a]">
      <span className="shrink-0 text-[#4d7cff]">
        <Icon name="teacher" className="h-4 w-4" />
      </span>
      <span className="shrink-0 text-[#8a93a5]">{teacherLabel}</span>
      <span className="truncate text-[#303238]">{name || noTeacher}</span>
    </div>
  )
}

export function AdminCoursesClient({ courses: initial, teachers }: Props) {
  const t = useTranslations('admin.courses')
  const locale = useLocale()
  const router = useRouter()
  const [courses, setCourses] = useState(initial)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'ended' | 'archived'>('active')
  const [kindFilter, setKindFilter] = useState<'all' | CourseKind>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [menuCourseId, setMenuCourseId] = useState<string | null>(null)
  const [archiving, setArchiving] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({
    title: '', start_date: '', end_date: '', expires_at: '',
    teacher_id: teachers[0]?.id ?? '',
  })

  const filtered = useMemo(() => {
    return courses.filter((course) => {
      const normalized = search.trim().toLowerCase()
      const matchSearch =
        !normalized ||
        course.title.toLowerCase().includes(normalized) ||
        course.profiles?.full_name?.toLowerCase().includes(normalized)
      const status = getCourseStatus(course)
      const kind = inferCourseKind(course)
      const matchStatus = statusFilter === 'all' || status === statusFilter
      const matchKind = kindFilter === 'all' || kindFilter === kind
      return matchSearch && matchStatus && matchKind
    })
  }, [courses, kindFilter, search, statusFilter])

  function handleCreateChange(field: keyof typeof createForm, value: string) {
    setCreateForm((prev) => ({ ...prev, [field]: value }))
    setCreateError(null)
  }

  function validateCreate(): string | null {
    if (!createForm.title.trim()) return t('errorName')
    if (!createForm.start_date) return t('errorStartDate')
    if (!createForm.end_date) return t('errorEndDate')
    if (createForm.start_date >= createForm.end_date) return t('errorDateOrder')
    if (!createForm.teacher_id) return t('errorTeacher')
    return null
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    const err = validateCreate()
    if (err) {
      setCreateError(err)
      return
    }
    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        title: createForm.title.trim(),
        start_date: createForm.start_date,
        end_date: createForm.end_date,
        teacher_id: createForm.teacher_id,
      }
      if (createForm.expires_at) body.expires_at = new Date(createForm.expires_at).toISOString()

      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json: { data?: Partial<CourseRow> | null; error?: string | null } = await res.json()
      if (!res.ok || json.error || !json.data) {
        setCreateError(json.error ?? t('errorCreate', { status: res.status }))
        return
      }

      const teacher = teachers.find((teacher) => teacher.id === createForm.teacher_id)
      const newCourse: CourseRow = {
        id: json.data.id!,
        title: json.data.title!,
        start_date: json.data.start_date!,
        end_date: json.data.end_date!,
        archived_at: json.data.archived_at ?? null,
        created_at: json.data.created_at ?? new Date().toISOString(),
        teacher_id: json.data.teacher_id ?? createForm.teacher_id,
        profiles: teacher ? { full_name: teacher.full_name } : null,
        student_count: 0,
        class_count: 0,
        week_count: 0,
        assignment_count: 0,
        revenue_text: '-',
      }
      setCourses((prev) => [newCourse, ...prev])
      setShowCreate(false)
      setCreateForm({ title: '', start_date: '', end_date: '', expires_at: '', teacher_id: teachers[0]?.id ?? '' })
      router.refresh()
    } catch {
      setCreateError(t('errorNetwork'))
    } finally {
      setCreating(false)
    }
  }

  async function toggleArchive(course: CourseRow) {
    setArchiving(course.id)
    setMenuCourseId(null)
    const newArchive = course.archived_at ? null : new Date().toISOString()
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived_at: newArchive }),
      })
      if (res.ok) {
        setCourses((prev) => prev.map((item) => item.id === course.id ? { ...item, archived_at: newArchive } : item))
        router.refresh()
      }
    } finally {
      setArchiving(null)
    }
  }

  function renderCourseCard(course: CourseRow) {
    const status = getCourseStatus(course)
    const kind = inferCourseKind(course)

    const statusBadge = {
      active:   { cls: 'bg-[#eafaf2] text-[#27ae60]', label: t('typeActive') },
      ended:    { cls: 'bg-amber-50 text-amber-600',   label: t('typeEnded') },
      archived: { cls: 'bg-gray-100 text-gray-500',    label: t('typeArchived') },
    }[status]

    return (
      <article
        key={course.id}
        className="group rounded-[18px] border border-[#eff1f5] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.10)]"
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className={['rounded-full px-3.5 py-1.5 text-xs font-bold', statusBadge.cls].join(' ')}>
            {statusBadge.label}
          </span>
          <span className="rounded-full bg-[#edf3ff] px-3.5 py-1.5 text-xs font-bold text-[#4d7cff]">
            {kind === 'practice' ? t('typePractice') : t('typeRegular')}
          </span>
        </div>

        <h2 className="mb-4 min-h-[48px] text-[19px] font-black uppercase leading-tight tracking-[-0.02em] text-[#303238]">
          {course.title}
        </h2>

        <TeacherLine name={course.profiles?.full_name} teacherLabel={t('teacherLabel')} noTeacher={t('noTeacher')} />

        <div className="mb-5 grid grid-cols-[1fr_1fr_0.9fr] gap-x-4 gap-y-3">
          <Metric icon="users">{t('students', { count: course.student_count })}</Metric>
          <Metric icon="calendar">{formatDate(course.start_date, locale)}</Metric>
          <Metric icon="money">{course.revenue_text}</Metric>
          <Metric icon="book">{t('classes', { count: course.class_count })}</Metric>
          <Metric icon="layers">{t('weeks', { count: course.week_count })}</Metric>
          <Metric icon="clipboard">{t('assignments', { count: course.assignment_count })}</Metric>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href={`/teacher/courses/${course.id}`}
            className="flex h-11 flex-1 items-center justify-center gap-3 rounded-xl bg-[#4d7cff] text-[15px] font-extrabold text-white shadow-[0_7px_14px_rgba(77,124,255,0.24)] transition hover:bg-[#3f6df0]"
          >
            {t('viewDetails')}
            <Icon name="arrow" className="h-5 w-5" />
          </Link>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuCourseId((current) => current === course.id ? null : course.id)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#f0f1f4] bg-white text-xl font-black text-[#989ca5] shadow-[0_5px_12px_rgba(15,23,42,0.05)] transition hover:bg-[#f7f8fb]"
              aria-label={t('courseOptions')}
            >
              ···
            </button>
            {menuCourseId === course.id && (
              <div className="absolute right-0 top-12 z-20 w-40 rounded-2xl border border-[#eef0f4] bg-white p-2 shadow-xl">
                <button
                  type="button"
                  disabled={archiving === course.id}
                  onClick={() => toggleArchive(course)}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#303238] hover:bg-[#f6f8ff] disabled:opacity-50"
                >
                  {course.archived_at ? t('restore') : t('archive')}
                </button>
              </div>
            )}
          </div>
        </div>
      </article>
    )
  }

  return (
    <>
      <div className="space-y-8">
        <header className="border-b border-[#e5e7eb] pb-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-[36px] font-black leading-none tracking-[-0.04em] text-[#15161a] md:text-[44px]">
                {t('title')}
              </h1>
              <p className="mt-2 text-sm font-medium text-mute-light">
                {t('description')}
              </p>
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-3 xl:justify-end">
              <div className="relative min-w-[240px] flex-1 xl:max-w-[420px]">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a1a6b0]">
                  <Icon name="search" className="h-5 w-5" />
                </span>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="h-11 rounded-xl border-[#dfe3ea] bg-white pl-11 text-sm shadow-sm"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="h-11 min-w-[140px] rounded-xl border border-[#dfe3ea] bg-white px-4 text-sm font-semibold text-[#303238] shadow-sm outline-none"
              >
                <option value="all">{t('filterAll')}</option>
                <option value="active">{t('filterActive')}</option>
                <option value="ended">{t('filterEnded')}</option>
                <option value="archived">{t('filterArchived')}</option>
              </select>

              <select
                value={kindFilter}
                onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}
                className="h-11 min-w-[170px] rounded-xl border border-[#dfe3ea] bg-white px-4 text-sm font-semibold text-[#303238] shadow-sm outline-none"
              >
                <option value="all">{t('filterAllTypes')}</option>
                <option value="regular">{t('filterRegular')}</option>
                <option value="practice">{t('filterPractice')}</option>
              </select>

              <div className="flex h-11 overflow-hidden rounded-xl border border-[#dfe3ea] bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={['flex h-9 w-9 items-center justify-center rounded-lg', viewMode === 'grid' ? 'bg-[#eff4ff] text-[#4d7cff]' : 'text-[#9aa0aa]'].join(' ')}
                  aria-label={t('gridView')}
                >
                  <Icon name="grid" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={['flex h-9 w-9 items-center justify-center rounded-lg', viewMode === 'list' ? 'bg-[#eff4ff] text-[#4d7cff]' : 'text-[#9aa0aa]'].join(' ')}
                  aria-label={t('listView')}
                >
                  <Icon name="list" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex h-11 items-center gap-2 rounded-xl bg-[#4d7cff] px-4 text-sm font-extrabold text-white shadow-[0_7px_14px_rgba(77,124,255,0.22)] transition hover:bg-[#3f6df0]"
              >
                <Icon name="plus" className="h-5 w-5" />
                {t('createCourse')}
              </button>
            </div>
          </div>
        </header>

        {filtered.length === 0 ? (
          <div className="rounded-[22px] border border-[#eff1f5] bg-white py-20 text-center shadow-sm">
            <p className="text-lg font-bold text-[#303238]">{t('noCoursesTitle')}</p>
            <p className="mt-2 text-sm text-mute-light">{t('noCoursesDesc')}</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-6 rounded-[12px] bg-[#4d7cff] px-5 py-3 font-bold text-white"
            >
              {t('createCourse')}
            </button>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3' : 'grid grid-cols-1 gap-4'}>
            {filtered.map(renderCourseCard)}
          </div>
        )}
      </div>

      <Modal open={showCreate} title={t('createTitle')} onClose={() => { setShowCreate(false); setCreateError(null) }}>
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          {createError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{createError}</p>
            </div>
          )}
          <Input label={t('fieldName')} placeholder={t('fieldNamePlaceholder')} value={createForm.title} onChange={(event) => handleCreateChange('title', event.target.value)} />
          {teachers.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-ink">{t('fieldTeacher')}</label>
              <select
                value={createForm.teacher_id}
                onChange={(event) => handleCreateChange('teacher_id', event.target.value)}
                className="h-10 w-full rounded-xl border border-ash-light bg-canvas-light px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('fieldStartDate')} type="date" value={createForm.start_date} onChange={(event) => handleCreateChange('start_date', event.target.value)} />
            <Input label={t('fieldEndDate')} type="date" value={createForm.end_date} onChange={(event) => handleCreateChange('end_date', event.target.value)} />
          </div>
          <div>
            <Input label={t('fieldExpiry')} type="datetime-local" value={createForm.expires_at} onChange={(event) => handleCreateChange('expires_at', event.target.value)} />
            <p className="mt-1 text-xs text-mute-light">{t('expiryNote')}</p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" loading={creating}>{t('create')}</Button>
            <Button type="button" variant="ghost" onClick={() => { setShowCreate(false); setCreateError(null) }}>{t('cancel')}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
