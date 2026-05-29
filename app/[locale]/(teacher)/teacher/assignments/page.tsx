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
    <div className="animate-fade-in">
      <PageHeader
        title={t('title')}
        description={activeStatus === 'all' ? t('descriptionAll', { count: assignments.length }) : activeStatus === 'draft' ? t('descriptionDraft', { count: assignments.length }) : t('descriptionAssigned', { count: assignments.length })}
        action={<CreateAssignmentButton />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
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
                'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-all backdrop-blur-sm shadow-sm hover:shadow-md',
                active
                  ? 'border-primary bg-primary text-white shadow-primary/20'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-primary/45 hover:text-primary',
              ].join(' ')}
            >
              <span>{filter.label}</span>
              <span className={[
                'rounded-full px-2 py-0.5 text-xs font-medium',
                active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500',
              ].join(' ')}>
                {filterCounts[filter.value]}
              </span>
            </Link>
          )
        })}
      </div>

      <form action={`/${params.locale}/teacher/assignments`} className="mb-6 grid gap-4 rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm md:grid-cols-[minmax(260px,1fr)_minmax(220px,320px)_auto] backdrop-blur-sm transition-all duration-300 hover:shadow-md">
        {activeStatus !== 'all' && <input type="hidden" name="status" value={activeStatus} />}
        <label className="space-y-1.5 flex flex-col">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('searchByName')}</span>
          <input
            name="q"
            defaultValue={query}
            placeholder={t('searchPlaceholder')}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white/70 px-4 text-sm font-medium text-ink outline-none transition-all duration-200 focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
          />
        </label>
        <label className="space-y-1.5 flex flex-col">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('course')}</span>
          <select
            name="course"
            defaultValue={activeCourse}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white/70 px-4 text-sm font-medium text-ink outline-none transition-all duration-200 focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
          >
            <option value="all">{t('allCourses')}</option>
            {courses.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" className="h-11 shadow-sm px-6">{t('filterBtn')}</Button>
          {(query || activeCourse !== 'all') && (
            <Link href={buildAssignmentsHref({ status: activeStatus })} className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-bold text-slate-500 hover:text-primary transition-colors">
              {t('clearFilter')}
            </Link>
          )}
        </div>
      </form>

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
        <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/95 backdrop-blur-sm shadow-sm transition-all duration-300 hover:shadow-md">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left">
              <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-4">{t('colAssignmentName')}</th>
                  <th className="px-5 py-4">{t('colStatus')}</th>
                  <th className="px-5 py-4">{t('colLatestDeadline')}</th>
                  <th className="px-5 py-4">{t('course')}</th>
                  <th className="px-5 py-4">{t('colClass')}</th>
                  <th className="px-5 py-4 text-center">{t('colInstances')}</th>
                  <th className="px-5 py-4">{t('colCreated')}</th>
                  <th className="px-5 py-4 text-right">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70">
                {assignments.map((a) => (
                  <tr key={a.id} className="transition-all duration-150 hover:bg-indigo-50/10">
                    <td className="max-w-[260px] px-5 py-4">
                      <Link href={`/teacher/assignments/${a.id}`} className="font-bold text-slate-900 hover:text-primary hover:underline transition-colors line-clamp-2">
                        {a.title}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <span className={[
                        'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                        a.published_count > 0
                          ? 'border-blue-200 bg-blue-50/60 text-blue-700'
                          : 'border-slate-200 bg-slate-50/60 text-slate-600',
                      ].join(' ')}>
                        {a.published_count > 0 ? t('statusLabelAssigned') : t('statusLabelDraft')}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-600">
                      {new Date(a.latest_deadline).toLocaleDateString(dateLocale)}
                    </td>
                    <td className="max-w-[220px] px-5 py-4 text-sm text-slate-500">
                      <span className="line-clamp-2">{a.courses.map((course) => course.title).join(', ') || t('noCourse')}</span>
                    </td>
                    <td className="max-w-[220px] px-5 py-4 text-sm text-slate-500">
                      <span className="line-clamp-2">{a.class_names.join(', ') || t('noClass')}</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-slate-100 border border-slate-200/40 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        {a.instance_count}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-400">
                      {new Date(a.created_at).toLocaleDateString(dateLocale)}
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <Link href={`/teacher/assignments/${a.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:text-primary-pressed transition-colors">
                        {t('viewDetail')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
