import { getCachedUser, createServerClient } from '@/lib/supabase/server'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { AssignmentCard } from '@/components/dashboard/assignment-card'
import { EmptyState } from '@/components/ui/empty-state'
import { redirect } from 'next/navigation'
import type { SubmissionStatus } from '@/types'

type EnrollmentRow = {
  class_id: string
  classes: {
    id: string
    title: string
    schedule_text: string | null
    course_id: string
    courses: {
      id: string
      title: string
      start_date: string
      end_date: string
      expires_at: string | null
      archived_at: string | null
    } | null
  } | null
}

type InstanceRow = {
  id: string
  deadline: string
  published_at: string | null
  class_id: string
  week_id: string
  assignments: { title: string } | null
  weeks: { title: string; order: number } | null
}

type SubmissionRow = {
  id: string
  instance_id: string
  status: string
}

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
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}

function CourseAssignmentSection({ course, labels }: { course: StudentCourse; labels: { reviewOnly: string; completionPct: (p: number) => string; submittedCount: (s: number, t: number) => string; noAssignments: string; noAssignmentsDesc: string } }) {
  const weekMap = new Map<string, { title: string; order: number; assignments: StudentAssignment[] }>()
  for (const assignment of course.assignments) {
    const existing = weekMap.get(assignment.weekId)
    if (existing) {
      existing.assignments.push(assignment)
    } else {
      weekMap.set(assignment.weekId, {
        title: assignment.weekTitle,
        order: assignment.weekOrder,
        assignments: [assignment],
      })
    }
  }

  const weeks = Array.from(weekMap.values()).sort((a, b) => a.order - b.order)
  const submitted = course.assignments.filter((assignment) => assignment.status === 'submitted').length
  const completion = percent(submitted, course.assignments.length)

  return (
    <div className="overflow-hidden rounded-[30px] border border-white/80 bg-white/[0.92] shadow-sm shadow-blue-100/60 backdrop-blur">
      <div className="bg-gradient-to-r from-white via-[#f7fbff] to-[#fff8e7] px-6 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-xl font-black text-[#252837]">{course.title}</h2>
              {course.mode === 'review' && (
                <span className="rounded-full bg-[#eef3ff] px-2.5 py-1 text-xs font-black text-[#5572f6]">
                  {labels.reviewOnly}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-[#7b8295]">
              {course.classTitle}
              {course.scheduleText ? ` · ${course.scheduleText}` : ''}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-black text-[#22a06b]">{labels.completionPct(completion)}</p>
            <p className="mt-1 text-xs font-semibold text-[#8a91a3]">
              {labels.submittedCount(submitted, course.assignments.length)}
            </p>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#edf0f7]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#4f7cff] via-[#22c55e] to-[#ffd15c] transition-all duration-700" style={{ width: `${completion}%` }} />
        </div>
      </div>

      <div className="p-6">
        {weeks.length === 0 ? (
          <EmptyState
            title={labels.noAssignments}
            description={labels.noAssignmentsDesc}
          />
        ) : (
          <div className="space-y-6">
            {weeks.map((week) => (
              <section key={`${course.id}-${week.title}`} className="space-y-3">
                <h3 className="text-sm font-black uppercase tracking-[0.16em] text-[#8c94a8]">{week.title}</h3>
                <div className="space-y-2">
                  {week.assignments.map((assignment) => (
                    <AssignmentCard
                      key={assignment.instanceId}
                      {...assignment}
                      readOnly={course.mode === 'review'}
                    />
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

export default async function StudentAssignmentsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.assignments')
  const courseLabels = {
    reviewOnly: t('reviewOnly'),
    completionPct: (pct: number) => t('completion', { pct }),
    submittedCount: (submitted: number, total: number) => t('submittedCount', { submitted, total }),
    noAssignments: t('noAssignments'),
    noAssignmentsDesc: t('noAssignmentsDesc'),
  }
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = createServerClient()

  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  const enrollmentsResult = await supabase
    .from('enrollments')
    .select('class_id, classes(id, title, schedule_text, course_id, courses(id, title, start_date, end_date, expires_at, archived_at))')
    .eq('student_id', user.id)

  const enrollments: EnrollmentRow[] = (enrollmentsResult.data as EnrollmentRow[] | null) ?? []
  const visibleEnrollments = enrollments.filter((enrollment) => {
    const course = enrollment.classes?.courses
    if (!course) return false
    return !course.expires_at || new Date(course.expires_at) > now
  })

  const classIds = visibleEnrollments
    .map((enrollment) => enrollment.classes?.id)
    .filter((id): id is string => Boolean(id))

  const instancesResult = classIds.length > 0
    ? await supabase
        .from('assignment_instances')
        .select('id, deadline, published_at, class_id, week_id, assignments(title), weeks(title, order)')
        .in('class_id', classIds)
        .not('published_at', 'is', null)
        .order('deadline', { ascending: true })
    : { data: [] as InstanceRow[] }

  const instances: InstanceRow[] = (instancesResult.data as InstanceRow[] | null) ?? []
  const instanceIds = instances.map((instance) => instance.id)

  const submissionsResult = instanceIds.length > 0
    ? await supabase
        .from('submissions')
        .select('id, instance_id, status')
        .eq('student_id', user.id)
        .in('instance_id', instanceIds)
        .order('started_at', { ascending: false })
    : { data: [] as SubmissionRow[] }

  const submissions: SubmissionRow[] = (submissionsResult.data as SubmissionRow[] | null) ?? []
  // Pick the most "complete" submission per instance, not merely the newest by
  // started_at. A student who finished a test (submitted, or grading after a
  // submit) must never be shown "In Progress" just because a later, non-finished
  // attempt row exists. Rows arrive ordered by started_at DESC, so ties resolve
  // to the newest attempt automatically.
  const statusRank: Record<string, number> = {
    submitted: 3,
    grading: 2,
    in_progress: 1,
  }
  const latestSubmissionByInstance = new Map<string, { id: string; status: SubmissionStatus }>()
  for (const submission of submissions) {
    const existing = latestSubmissionByInstance.get(submission.instance_id)
    const incomingRank = statusRank[submission.status] ?? 0
    const existingRank = existing ? statusRank[existing.status] ?? 0 : -1
    if (!existing || incomingRank > existingRank) {
      latestSubmissionByInstance.set(submission.instance_id, {
        id: submission.id,
        status: submission.status as SubmissionStatus,
      })
    }
  }

  const assignmentsByClass = new Map<string, StudentAssignment[]>()
  for (const instance of instances) {
    const latestSubmission = latestSubmissionByInstance.get(instance.id)
    const status: SubmissionStatus | 'not_started' = !latestSubmission
      ? (new Date(instance.deadline) < now ? 'expired' : 'not_started')
      : latestSubmission.status

    const assignment: StudentAssignment = {
      instanceId: instance.id,
      title: instance.assignments?.title ?? '—',
      deadline: instance.deadline,
      status,
      submissionId: latestSubmission?.id,
      weekId: instance.week_id,
      weekTitle: instance.weeks?.title ?? t('unassignedWeek'),
      weekOrder: instance.weeks?.order ?? Number.MAX_SAFE_INTEGER,
    }

    const existing = assignmentsByClass.get(instance.class_id) ?? []
    existing.push(assignment)
    assignmentsByClass.set(instance.class_id, existing)
  }

  const courses: StudentCourse[] = visibleEnrollments
    .map((enrollment) => {
      const klass = enrollment.classes
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
    .filter((course): course is StudentCourse => Boolean(course))
    .sort((a, b) => (a.mode === b.mode ? a.title.localeCompare(b.title) : a.mode === 'active' ? -1 : 1))

  const totalAssignments = courses.reduce((sum, course) => sum + course.assignments.length, 0)

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6d7cff]">Student</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-[#232635] md:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-2 text-base font-medium text-[#778095]">
          {totalAssignments > 0
            ? t('assignmentCountDesc', { count: totalAssignments })
            : t('noPendingDesc')}
        </p>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          title={t('noCourses')}
          description={t('noCoursesDesc')}
        />
      ) : (
        <div className="space-y-5">
          {courses.map((course) => (
            <CourseAssignmentSection key={`${course.id}-${course.classId}`} course={course} labels={courseLabels} />
          ))}
        </div>
      )}
    </div>
  )
}
