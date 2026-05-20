import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'

interface AssignmentRow {
  id: string
  title: string
  latest_deadline: string
  course_names: string[]
  class_names: string[]
  instance_count: number
  published_count: number
}

interface AssignmentInstanceRow {
  id: string
  assignment_id: string
  deadline: string
  published_at: string | null
  assignments: { id: string; title: string } | null
  classes: { title: string; courses: { title: string } | null } | null
}

const ASSIGNMENT_THEMES = [
  { icon: 'from-sky-500 to-blue-600', chip: 'bg-sky-50 text-sky-700', glow: 'hover:shadow-sky-100' },
  { icon: 'from-violet-500 to-purple-600', chip: 'bg-violet-50 text-violet-700', glow: 'hover:shadow-violet-100' },
  { icon: 'from-emerald-400 to-teal-500', chip: 'bg-emerald-50 text-emerald-700', glow: 'hover:shadow-emerald-100' },
  { icon: 'from-amber-400 to-orange-500', chip: 'bg-amber-50 text-amber-700', glow: 'hover:shadow-amber-100' },
]

export default async function AssignmentsPage() {
  const supabase = createServerClient()

  const { data } = await supabase
    .from('assignment_instances')
    .select('id, assignment_id, deadline, published_at, assignments(id, title), classes(title, courses(title))')
    .order('deadline', { ascending: false })

  const assignmentInstances: AssignmentInstanceRow[] = (data as AssignmentInstanceRow[] | null) ?? []
  const assignmentMap = new Map<string, AssignmentRow>()

  for (const instance of assignmentInstances) {
    if (!instance.assignments) continue

    const existing = assignmentMap.get(instance.assignment_id)
    if (existing) {
      if (instance.classes?.courses?.title && !existing.course_names.includes(instance.classes.courses.title)) {
        existing.course_names.push(instance.classes.courses.title)
      }
      if (instance.classes?.title && !existing.class_names.includes(instance.classes.title)) {
        existing.class_names.push(instance.classes.title)
      }
      existing.instance_count += 1
      if (instance.published_at) existing.published_count += 1
      continue
    }

    assignmentMap.set(instance.assignment_id, {
      id: instance.assignment_id,
      title: instance.assignments.title,
      latest_deadline: instance.deadline,
      course_names: instance.classes?.courses?.title ? [instance.classes.courses.title] : [],
      class_names: instance.classes?.title ? [instance.classes.title] : [],
      instance_count: 1,
      published_count: instance.published_at ? 1 : 0,
    })
  }

  const assignments = Array.from(assignmentMap.values())

  return (
    <div>
      <PageHeader
        title="Bài tập"
        description={`${assignments.length} bài tập đã giao`}
        action={
          <Link href="/teacher/assignments/new">
            <Button>Tạo bài tập</Button>
          </Link>
        }
      />

      {assignments.length === 0 ? (
        <EmptyState
          title="Chưa có bài tập nào"
          description="Tạo bài tập đầu tiên để giao cho học sinh"
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assignments.map((a, i) => {
            const theme = ASSIGNMENT_THEMES[i % ASSIGNMENT_THEMES.length]
            return (
            <Link
              key={a.id}
              href={`/teacher/assignments/${a.id}`}
              className={`group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${theme.glow} animate-fade-up`}
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${theme.icon} text-white shadow-sm`}>
                  <span className="text-base font-bold">✓</span>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${theme.chip}`}>
                  {a.published_count > 0 ? 'Đã giao' : 'Bản nháp'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink truncate group-hover:text-primary transition-colors">{a.title}</p>
                <p className="text-xs text-mute-light mt-2">
                  Hạn: {new Date(a.latest_deadline).toLocaleDateString('vi-VN')}
                </p>
                <p className="mt-2 truncate text-xs text-mute-light">
                  Khóa: {a.course_names.join(', ') || 'Chưa có khóa'}
                </p>
                <p className="mt-1 truncate text-xs text-mute-light">
                  Lớp: {a.class_names.join(', ') || 'Chưa có lớp'} · {a.instance_count} lượt giao
                </p>
              </div>
              <div className="mt-4 h-px bg-gradient-to-r from-gray-100 via-gray-100 to-transparent" />
              <p className="mt-3 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Xem chi tiết →
              </p>
            </Link>
          )})}
        </div>
      )}
    </div>
  )
}
