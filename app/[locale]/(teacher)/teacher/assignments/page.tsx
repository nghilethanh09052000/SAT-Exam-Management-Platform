import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'

interface AssignmentRow {
  id: string
  title: string
  created_at: string
  latest_deadline: string
  courses: { id: string; title: string }[]
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
  classes: { title: string; courses: { id: string; title: string } | null } | null
}

type AssignmentStatusFilter = 'all' | 'draft' | 'assigned'

const STATUS_FILTERS: { value: AssignmentStatusFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'draft', label: 'Bản nháp' },
  { value: 'assigned', label: 'Đã giao' },
]

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

function statusLabel(assignment: AssignmentRow) {
  return assignment.published_count > 0 ? 'Đã giao' : 'Bản nháp'
}

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams?: { status?: string; q?: string; course?: string }
}) {
  const supabase = createServerClient()
  const activeStatus: AssignmentStatusFilter = STATUS_FILTERS.some((filter) => filter.value === searchParams?.status)
    ? searchParams?.status as AssignmentStatusFilter
    : 'all'
  const query = (searchParams?.q ?? '').trim()
  const activeCourse = searchParams?.course ?? 'all'

  const { data } = await supabase
    .from('assignment_instances')
    .select('id, assignment_id, deadline, published_at, assignments(id, title, created_at), classes(title, courses(id, title))')

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
        assignment.courses.map((course) => [course.id, course.title] as const)
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

  return (
    <div>
      <PageHeader
        title="Bài tập"
        description={`${assignments.length} bài tập${activeStatus === 'all' ? '' : activeStatus === 'draft' ? ' bản nháp' : ' đã giao'}`}
        action={
          <Link href="/teacher/assignments/new">
            <Button>Tạo bài tập</Button>
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
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
                'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-all',
                active
                  ? 'border-primary bg-primary text-white shadow-sm shadow-primary/20'
                  : 'border-gray-200 bg-white text-mute hover:border-primary/40 hover:text-primary',
              ].join(' ')}
            >
              <span>{filter.label}</span>
              <span className={[
                'rounded-full px-2 py-0.5 text-xs',
                active ? 'bg-white/20 text-white' : 'bg-gray-100 text-mute-light',
              ].join(' ')}>
                {filterCounts[filter.value]}
              </span>
            </Link>
          )
        })}
      </div>

      <form action="/teacher/assignments" className="mb-5 grid gap-3 rounded-[18px] border border-white/80 bg-white/90 p-4 shadow-sm md:grid-cols-[minmax(260px,1fr)_minmax(220px,320px)_auto]">
        {activeStatus !== 'all' && <input type="hidden" name="status" value={activeStatus} />}
        <label className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-mute-light">Tìm theo tên</span>
          <input
            name="q"
            defaultValue={query}
            placeholder="Nhập tên bài tập..."
            className="h-11 w-full rounded-[12px] border border-gray-200 bg-white px-4 text-sm font-medium text-ink outline-none transition-shadow focus:ring-4 focus:ring-primary/10"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-mute-light">Khóa học</span>
          <select
            name="course"
            defaultValue={activeCourse}
            className="h-11 w-full rounded-[12px] border border-gray-200 bg-white px-4 text-sm font-medium text-ink outline-none transition-shadow focus:ring-4 focus:ring-primary/10"
          >
            <option value="all">Tất cả khóa học</option>
            {courses.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" className="h-11">Lọc</Button>
          {(query || activeCourse !== 'all') && (
            <Link href={buildAssignmentsHref({ status: activeStatus })} className="inline-flex h-11 items-center rounded-[12px] px-3 text-sm font-bold text-mute hover:text-primary">
              Xóa lọc
            </Link>
          )}
        </div>
      </form>

      {assignments.length === 0 ? (
        <EmptyState
          title={activeStatus === 'all' ? 'Chưa có bài tập nào' : 'Không có bài tập phù hợp'}
          description={activeStatus === 'all' ? 'Tạo bài tập đầu tiên để giao cho học sinh' : 'Thử đổi bộ lọc để xem các bài tập khác'}
          action={
            <Link href="/teacher/assignments/new">
              <Button>Tạo bài tập</Button>
            </Link>
          }
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[18px] border border-white/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left">
              <thead className="bg-[#f7f9ff] text-xs font-black uppercase tracking-[0.12em] text-[#7a8398]">
                <tr>
                  <th className="px-5 py-4">Tên bài tập</th>
                  <th className="px-5 py-4">Trạng thái</th>
                  <th className="px-5 py-4">Hạn gần nhất</th>
                  <th className="px-5 py-4">Khóa học</th>
                  <th className="px-5 py-4">Lớp</th>
                  <th className="px-5 py-4 text-center">Lượt giao</th>
                  <th className="px-5 py-4">Ngày tạo</th>
                  <th className="px-5 py-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assignments.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-[#f8fbff]">
                    <td className="max-w-[260px] px-5 py-4">
                      <Link href={`/teacher/assignments/${a.id}`} className="font-bold text-ink hover:text-primary hover:underline">
                        {a.title}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <span className={[
                        'inline-flex rounded-full px-2.5 py-1 text-xs font-bold',
                        a.published_count > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600',
                      ].join(' ')}>
                        {statusLabel(a)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-[#5f687a]">
                      {new Date(a.latest_deadline).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="max-w-[220px] px-5 py-4 text-sm text-[#5f687a]">
                      <span className="line-clamp-2">{a.courses.map((course) => course.title).join(', ') || 'Chưa có khóa'}</span>
                    </td>
                    <td className="max-w-[220px] px-5 py-4 text-sm text-[#5f687a]">
                      <span className="line-clamp-2">{a.class_names.join(', ') || 'Chưa có lớp'}</span>
                    </td>
                    <td className="px-5 py-4 text-center text-sm font-bold text-[#5f687a]">
                      {a.instance_count}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#8a92a6]">
                      {new Date(a.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/teacher/assignments/${a.id}`} className="text-sm font-bold text-primary hover:underline">
                        Xem chi tiết →
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
