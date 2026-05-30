import { createServerClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { AssignmentCard } from '@/components/dashboard/assignment-card'
import { EmptyState } from '@/components/ui/empty-state'
import type { SubmissionStatus } from '@/types'

type EnrollmentRow = {
  classes: {
    id: string
    title: string
    schedule_text: string | null
    courses: { id: string; title: string; start_date: string; end_date: string; expires_at: string | null } | null
  } | null
}

type InstanceRow = {
  id: string
  deadline: string
  class_id: string
  week_id: string
  assignments: { title: string } | null
  weeks: { title: string; order: number } | null
}

type SubmissionRow = { id: string; instance_id: string; status: string }

type StudentAssignment = {
  instanceId: string
  title: string
  deadline: string
  status: SubmissionStatus | 'not_started'
  submissionId?: string
  weekId: string
  weekTitle: string
  weekOrder: number
}

type StudentCourse = {
  id: string
  title: string
  classId: string
  classTitle: string
  scheduleText: string | null
  mode: 'active' | 'review'
  assignments: StudentAssignment[]
}

function percent(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100)
}

const STATUS_RANK: Record<string, number> = { submitted: 3, grading: 2, in_progress: 1 }

function CourseAssignmentSection({ course, labels }: {
  course: StudentCourse
  labels: { reviewOnly: string; completionPct: (p: number) => string; submittedCount: (s: number, t: number) => string; noAssignments: string; noAssignmentsDesc: string }
}) {
  const weekMap = new Map<string, { title: string; order: number; assignments: StudentAssignment[] }>()
  for (const assignment of course.assignments) {
    const existing = weekMap.get(assignment.weekId)
    if (existing) existing.assignments.push(assignment)
    else weekMap.set(assignment.weekId, { title: assignment.weekTitle, order: assignment.weekOrder, assignments: [assignment] })
  }
  const weeks = Array.from(weekMap.values()).sort((a, b) => a.order - b.order)
  const submitted = course.assignments.filter((a) => a.status === 'submitted').length
  const completion = percent(submitted, course.assignments.length)

  return (
    <div className="overflow-hidden rounded-[30px] border border-white/80 bg-white/[0.92] shadow-sm shadow-blue-100/60 backdrop-blur">
      <div className="bg-gradient-to-r from-white via-[#f7fbff] to-[#fff8e7] px-6 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-xl font-black text-[#252837]">{course.title}</h2>
              {course.mode === 'review' && (
                <span className="rounded-full bg-[#eef3ff] px-2.5 py-1 text-xs font-black text-[#5572f6]">{labels.reviewOnly}</span>
              )}
            </div>
            <p className="text-sm font-semibold text-[#7b8295]">
              {course.classTitle}{course.scheduleText ? ` · ${course.scheduleText}` : ''}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-black text-[#22a06b]">{labels.completionPct(completion)}</p>
            <p className="mt-1 text-xs font-semibold text-[#8a91a3]">{labels.submittedCount(submitted, course.assignments.length)}</p>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#edf0f7]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#4f7cff] via-[#22c55e] to-[#ffd15c] transition-all duration-700" style={{ width: `${completion}%` }} />
        </div>
      </div>
      <div className="p-6">
        {weeks.length === 0 ? (
          <EmptyState title={labels.noAssignments} description={labels.noAssignmentsDesc} />
        ) : (
          <div className="space-y-6">
            {weeks.map((week) => (
              <section key={`${course.id}-${week.title}`} className="space-y-3">
                <h3 className="text-sm font-black uppercase tracking-[0.16em] text-[#8c94a8]">{week.title}</h3>
                <div className="space-y-2">
                  {week.assignments.map((assignment) => (
                    <AssignmentCard key={assignment.instanceId} {...assignment} readOnly={course.mode === 'review'} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export async function CourseAssignments({ userId }: { userId: string }) {
  const t = await getTranslations('student.assignments')
  const supabase = createServerClient()
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  const { data: enrollmentsData } = await supabase
    .from('enrollments')
    .select('classes(id, title, schedule_text, courses(id, title, start_date, end_date, expires_at))')
    .eq('student_id', userId)

  const enrollments = (enrollmentsData as EnrollmentRow[] | null) ?? []
  const visible = enrollments.filter((e) => {
    const course = e.classes?.courses
    return course && (!course.expires_at || new Date(course.expires_at) > now)
  })
  const classIds = visible.map((e) => e.classes?.id).filter((id): id is string => Boolean(id))

  const { data: instancesData } = classIds.length > 0
    ? await supabase
        .from('assignment_instances')
        .select('id, deadline, class_id, week_id, assignments(title), weeks(title, order)')
        .in('class_id', classIds)
        .not('published_at', 'is', null)
        .order('deadline', { ascending: true })
    : { data: [] as InstanceRow[] }

  const instances = (instancesData as InstanceRow[] | null) ?? []
  const instanceIds = instances.map((i) => i.id)

  const { data: submissionsData } = instanceIds.length > 0
    ? await supabase
        .from('submissions')
        .select('id, instance_id, status')
        .eq('student_id', userId)
        .in('instance_id', instanceIds)
        .order('started_at', { ascending: false })
    : { data: [] as SubmissionRow[] }

  const submissions = (submissionsData as SubmissionRow[] | null) ?? []
  const latestByInstance = new Map<string, { id: string; status: SubmissionStatus }>()
  for (const s of submissions) {
    const existing = latestByInstance.get(s.instance_id)
    const incomingRank = STATUS_RANK[s.status] ?? 0
    const existingRank = existing ? STATUS_RANK[existing.status] ?? 0 : -1
    if (!existing || incomingRank > existingRank) {
      latestByInstance.set(s.instance_id, { id: s.id, status: s.status as SubmissionStatus })
    }
  }

  const assignmentsByClass = new Map<string, StudentAssignment[]>()
  for (const instance of instances) {
    const latest = latestByInstance.get(instance.id)
    const status: SubmissionStatus | 'not_started' = !latest
      ? (new Date(instance.deadline) < now ? 'expired' : 'not_started')
      : latest.status
    const assignment: StudentAssignment = {
      instanceId: instance.id,
      title: instance.assignments?.title ?? '—',
      deadline: instance.deadline,
      status,
      submissionId: latest?.id,
      weekId: instance.week_id,
      weekTitle: instance.weeks?.title ?? t('unassignedWeek'),
      weekOrder: instance.weeks?.order ?? Number.MAX_SAFE_INTEGER,
    }
    const existing = assignmentsByClass.get(instance.class_id) ?? []
    existing.push(assignment)
    assignmentsByClass.set(instance.class_id, existing)
  }

  const courses: StudentCourse[] = visible
    .map((e) => {
      const klass = e.classes
      const course = klass?.courses
      if (!klass || !course) return null
      return {
        id: course.id,
        title: course.title,
        classId: klass.id,
        classTitle: klass.title,
        scheduleText: klass.schedule_text,
        mode: course.end_date >= today ? 'active' : 'review',
        assignments: assignmentsByClass.get(klass.id) ?? [],
      } satisfies StudentCourse
    })
    .filter((c): c is StudentCourse => Boolean(c))
    .sort((a, b) => (a.mode === b.mode ? a.title.localeCompare(b.title) : a.mode === 'active' ? -1 : 1))

  const labels = {
    reviewOnly: t('reviewOnly'),
    completionPct: (pct: number) => t('completion', { pct }),
    submittedCount: (submitted: number, total: number) => t('submittedCount', { submitted, total }),
    noAssignments: t('noAssignments'),
    noAssignmentsDesc: t('noAssignmentsDesc'),
  }

  if (courses.length === 0) {
    return <EmptyState title={t('noCourses')} description={t('noCoursesDesc')} />
  }

  return (
    <div className="space-y-5">
      {courses.map((course) => (
        <CourseAssignmentSection key={`${course.id}-${course.classId}`} course={course} labels={labels} />
      ))}
    </div>
  )
}
