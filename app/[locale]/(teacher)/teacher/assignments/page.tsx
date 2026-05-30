import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Link } from '@/i18n/navigation'
import { CreateAssignmentButton } from './create-assignment-button'
import { getTranslations, setRequestLocale } from 'next-intl/server'

interface AssignmentRow {
  id: string
  title: string
  created_at: string
  latest_deadline: string
  courses: { id: string; title: string; archived_at: string | null }[]
  class_names: string[]
  instance_count: number
  published_count: number
}

interface AssignmentInstanceRow {
  id: string
  assignment_id: string
  deadline: string
  published_at: string | null
  assignments: { id: string; title: string; created_at: string } | null
  classes: { title: string; courses: { id: string; title: string; archived_at: string | null } | null } | null
}

type AssignmentStatusFilter = 'all' | 'draft' | 'assigned'

function buildAssignmentsHref(params: {
  status?: AssignmentStatusFilter
  q?: string
  course?: string
}) {
  const search = new URLSearchParams()
  if (params.status && params.status !== 'all') search.set('status', params.status)
  if (params.q) search.set('q', params.q)
  if (params.course && params.course !== 'all') search.set('course', params.course)
  const query = search.toString()
  return query ? `/teacher/assignments?${query}` : '/teacher/assignments'
}

export default async function AssignmentsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams?: { status?: string; q?: string; course?: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.assignments')
  const supabase = createServerClient()

  const STATUS_FILTERS: { value: AssignmentStatusFilter; label: string }[] = [
    { value: 'all', label: t('statusAll') },
    { value: 'draft', label: t('statusDraft') },
    { value: 'assigned', label: t('statusAssigned') },
  ]
  const activeStatus: AssignmentStatusFilter = STATUS_FILTERS.some((filter) => filter.value === searchParams?.status)
    ? searchParams?.status as AssignmentStatusFilter
    : 'all'
  const query = (searchParams?.q ?? '').trim()
  const activeCourse = searchParams?.course ?? 'all'

  const { data } = await supabase
    .from('assignment_instances')
    .select('id, assignment_id, deadline, published_at, assignments(id, title, created_at), classes(title, courses(id, title, archived_at))')

  const assignmentInstances: AssignmentInstanceRow[] = (data as AssignmentInstanceRow[] | null) ?? []
  const assignmentMap = new Map<string, AssignmentRow>()

  for (const instance of assignmentInstances) {
    if (!instance.assignments) continue

    const existing = assignmentMap.get(instance.assignment_id)
    if (existing) {
      const course = instance.classes?.courses
      if (course && !existing.courses.some((existingCourse) => existingCourse.id === course.id)) {
        existing.courses.push(course)
      }
      if (instance.classes?.title && !existing.class_names.includes(instance.classes.title)) {
        existing.class_names.push(instance.classes.title)
      }
      existing.instance_count += 1
      if (instance.published_at) existing.published_count += 1
      if (new Date(instance.deadline).getTime() > new Date(existing.latest_deadline).getTime()) {
        existing.latest_deadline = instance.deadline
      }
      continue
    }

    assignmentMap.set(instance.assignment_id, {
      id: instance.assignment_id,
      title: instance.assignments.title,
      created_at: instance.assignments.created_at,
      latest_deadline: instance.deadline,
      courses: instance.classes?.courses ? [instance.classes.courses] : [],
      class_names: instance.classes?.title ? [instance.classes.title] : [],
      instance_count: 1,
      published_count: instance.published_at ? 1 : 0,
    })
  }

  const allAssignments = Array.from(assignmentMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const courses = Array.from(
    new Map(
      allAssignments.flatMap((assignment) =>
        assignment.courses
          .filter((course) => course.archived_at === null)
          .map((course) => [course.id, course.title] as const)
      )
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]))
  const assignments = allAssignments.filter((assignment) => {
    if (activeStatus === 'draft') return assignment.published_count === 0
    if (activeStatus === 'assigned') return assignment.published_count > 0
    return true
  }).filter((assignment) => {
    const matchesQuery = !query || assignment.title.toLowerCase().includes(query.toLowerCase())
    const matchesCourse = activeCourse === 'all' || assignment.courses.some((course) => course.id === activeCourse)
    return matchesQuery && matchesCourse
  })

  const draftCount = allAssignments.filter((assignment) => assignment.published_count === 0).length
  const assignedCount = allAssignments.filter((assignment) => assignment.published_count > 0).length
  const filterCounts: Record<AssignmentStatusFilter, number> = {
    all: allAssignments.length,
    draft: draftCount,
    assigned: assignedCount,
  }

  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={activeStatus === 'all' ? t('descriptionAll', { count: assignments.length }) : activeStatus === 'draft' ? t('descriptionDraft', { count: assignments.length }) : t('descriptionAssigned', { count: assignments.length })}
        action={<CreateAssignmentButton />}
      />

      {/* ── Status filter tabs ─────────────────────────────────────────── */}
      <nav className="mb-6 flex flex-wrap items-center gap-2 animate-fade-up" style={{ animationDelay: '60ms' }}>
        {STATUS_FILTERS.map((filter) => {
          const active = activeStatus === filter.value
          const href = buildAssignmentsHref({
            status: filter.value,
            q: query,
            course: activeCourse,
          })
          return (
            <Link
              key={filter.value}
              href={href}
              className={[
                'inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-ink text-white shadow-sm'
                  : 'bg-white/80 text-mute-light border border-white/70 hover:bg-white hover:text-ink hover:shadow-sm',
              ].join(' ')}
            >
              <span>{filter.label}</span>
              <span className={[
                'min-w-[20px] rounded-full px-1.5 py-px text-center text-[11px] font-semibold tabular-nums',
                active ? 'bg-white/20 text-white/90' : 'bg-surface-soft text-mute-light',
              ].join(' ')}>
                {filterCounts[filter.value]}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* ── Search + course filter bar ─────────────────────────────────── */}
      <form
        action={`/${params.locale}/teacher/assignments`}
        className="mb-8 animate-fade-up"
        style={{ animationDelay: '120ms' }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {activeStatus !== 'all' && <input type="hidden" name="status" value={activeStatus} />}

          {/* Search input */}
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-semibold tracking-wide text-mute-light mb-1.5">{t('searchByName')}</label>
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ash-light"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                name="q"
                defaultValue={query}
                placeholder={t('searchPlaceholder')}
                className="h-10 w-full rounded-lg border border-white/70 bg-white/80 pl-9 pr-4 text-sm text-ink placeholder:text-ash-light outline-none transition-all focus:bg-white focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
            </div>
          </div>

          {/* Course select */}
          <div className="w-full sm:w-64 shrink-0">
            <label className="block text-[11px] font-semibold tracking-wide text-mute-light mb-1.5">{t('course')}</label>
            <select
              name="course"
              defaultValue={activeCourse}
              className="h-10 w-full rounded-lg border border-white/70 bg-white/80 px-3 text-sm text-ink outline-none transition-all focus:bg-white focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            >
              <option value="all">{t('allCourses')}</option>
              {courses.map(([id, title]) => (
                <option key={id} value={id}>{title}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button type="submit" size="sm" className="h-10 px-5">{t('filterBtn')}</Button>
            {(query || activeCourse !== 'all') && (
              <Link
                href={buildAssignmentsHref({ status: activeStatus })}
                className="h-10 inline-flex items-center text-sm font-medium text-mute-light hover:text-ink transition-colors"
              >
                {t('clearFilter')}
              </Link>
            )}
          </div>
        </div>
      </form>

      {/* ── Assignment list ────────────────────────────────────────────── */}
      {assignments.length === 0 ? (
        <EmptyState
          title={activeStatus === 'all' ? t('empty') : t('emptyFiltered')}
          description={activeStatus === 'all' ? t('emptyAllDesc') : t('emptyFilteredDesc')}
          action={<CreateAssignmentButton />}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-2">
          {assignments.map((a, i) => {
            const isAssigned = a.published_count > 0
            const deadlineDate = new Date(a.latest_deadline)
            const isOverdue = deadlineDate < new Date() && isAssigned

            return (
              <Link
                key={a.id}
                href={`/teacher/assignments/${a.id}`}
                className="group relative block overflow-hidden rounded-xl border border-white/70 bg-white/90 backdrop-blur-sm transition-all duration-200 hover:bg-white hover:shadow-md hover:-translate-y-px animate-fade-up"
                style={{ animationDelay: `${160 + i * 40}ms` }}
              >
                {/* Left colour rail */}
                <div className={[
                  'absolute inset-y-0 left-0 w-1 transition-all duration-200',
                  isAssigned
                    ? 'bg-gradient-to-b from-blue-500 to-indigo-600 group-hover:w-1.5'
                    : 'bg-gradient-to-b from-slate-300 to-slate-400 group-hover:w-1.5',
                ].join(' ')} />

                <div className="flex items-center gap-5 py-4 pl-5 pr-4">
                  {/* Title + meta — primary column */}
                  <div className="flex-1 min-w-0 pl-2">
                    <p className="text-sm font-semibold text-ink group-hover:text-primary transition-colors truncate">
                      {a.title}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute-light">
                      {/* Course */}
                      <span className="inline-flex items-center gap-1 max-w-[200px] truncate" title={a.courses.map((c) => c.title).join(', ')}>
                        <svg className="h-3.5 w-3.5 shrink-0 text-ash-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        {a.courses.map((c) => c.title).join(', ') || t('noCourse')}
                      </span>

                      {/* Classes */}
                      <span className="inline-flex items-center gap-1 max-w-[200px] truncate" title={a.class_names.join(', ')}>
                        <svg className="h-3.5 w-3.5 shrink-0 text-ash-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                        {a.class_names.join(', ') || t('noClass')}
                      </span>

                      {/* Created */}
                      <span className="tabular-nums">
                        {new Date(a.created_at).toLocaleDateString(dateLocale)}
                      </span>
                    </div>
                  </div>

                  {/* Deadline + instances — secondary column */}
                  <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0 text-right min-w-[120px]">
                    <span className={[
                      'text-xs font-medium tabular-nums',
                      isOverdue ? 'text-warning' : 'text-mute-light',
                    ].join(' ')}>
                      {deadlineDate.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="text-[11px] text-ash-light tabular-nums">
                      {a.instance_count} {a.instance_count === 1 ? 'instance' : 'instances'}
                    </span>
                  </div>

                  {/* Status badge */}
                  <div className="shrink-0">
                    {isAssigned ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        {t('statusLabelAssigned')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-mute-light">
                        <span className="h-1.5 w-1.5 rounded-full bg-ash-light" />
                        {t('statusLabelDraft')}
                      </span>
                    )}
                  </div>

                  {/* Arrow indicator */}
                  <svg
                    className="h-4 w-4 shrink-0 text-ash-light transition-all duration-200 group-hover:text-primary group-hover:translate-x-0.5"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
