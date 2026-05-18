import { createServerClient } from '@/lib/supabase/server'
import { AssignmentCard } from '@/components/dashboard/assignment-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Card } from '@/components/ui/card'
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
  startDate: string
  endDate: string
  expiresAt: string | null
  classId: string
  classTitle: string
  scheduleText: string | null
  mode: 'active' | 'review'
  assignments: StudentAssignment[]
}

function formatCourseDateRange(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return `${formatter.format(new Date(startDate))} – ${formatter.format(new Date(endDate))}`
}

function AssignmentEmptyState() {
  return (
    <EmptyState
      title="Chưa có bài tập"
      description="Giáo viên chưa giao bài cho lớp này. Bạn hãy quay lại kiểm tra sau nhé."
      icon={
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
        </svg>
      }
    />
  )
}

function CourseSection({ course }: { course: StudentCourse }) {
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

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-hairline-light bg-canvas-light px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-lg font-display font-semibold text-ink">{course.title}</h2>
              {course.mode === 'review' && (
                <span className="rounded-full bg-surface-soft px-2.5 py-1 text-xs font-medium text-mute-light">
                  Chỉ xem lại
                </span>
              )}
            </div>
            <p className="text-sm text-mute-light">
              {course.classTitle}
              {course.scheduleText ? ` · ${course.scheduleText}` : ''}
            </p>
          </div>
          <p className="text-sm text-mute-light">
            {formatCourseDateRange(course.startDate, course.endDate)}
          </p>
        </div>
      </div>

      <div className="p-5">
        {weeks.length === 0 ? (
          <AssignmentEmptyState />
        ) : (
          <div className="space-y-6">
            {weeks.map((week) => (
              <section key={`${course.id}-${week.title}`} className="space-y-3">
                <h3 className="text-sm font-semibold text-ink">{week.title}</h3>
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
    </Card>
  )
}

export default async function StudentHomePage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

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
  const latestSubmissionByInstance = new Map<string, { id: string; status: SubmissionStatus }>()
  for (const submission of submissions) {
    if (!latestSubmissionByInstance.has(submission.instance_id)) {
      latestSubmissionByInstance.set(submission.instance_id, {
        id: submission.id,
        status: submission.status as SubmissionStatus,
      })
    }
  }

  const assignmentsByClass = new Map<string, StudentAssignment[]>()
  for (const instance of instances) {
    const latestSubmission = latestSubmissionByInstance.get(instance.id)
    let status: SubmissionStatus | 'not_started'
    if (!latestSubmission) {
      status = new Date(instance.deadline) < now ? 'expired' : 'not_started'
    } else {
      status = latestSubmission.status
    }

    const assignment: StudentAssignment = {
      instanceId: instance.id,
      title: instance.assignments?.title ?? '—',
      deadline: instance.deadline,
      status,
      submissionId: latestSubmission?.id,
      weekId: instance.week_id,
      weekTitle: instance.weeks?.title ?? 'Chưa phân tuần',
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
        startDate: course.start_date,
        endDate: course.end_date,
        expiresAt: course.expires_at,
        classId: klass.id,
        classTitle: klass.title,
        scheduleText: klass.schedule_text,
        mode: course.end_date >= today ? 'active' : 'review',
        assignments: assignmentsByClass.get(klass.id) ?? [],
      } satisfies StudentCourse
    })
    .filter((course): course is StudentCourse => Boolean(course))
    .sort((a, b) => b.endDate.localeCompare(a.endDate))

  const activeCourses = courses.filter((course) => course.mode === 'active')
  const pastCourses = courses.filter((course) => course.mode === 'review')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold text-ink mb-1">Trang chủ học sinh</h1>
        <p className="text-sm text-mute-light">
          Theo dõi khóa học hiện tại và xem lại các khóa học trước đây của bạn
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-display font-semibold text-ink">Khóa học hiện tại</h2>
          <p className="text-sm text-mute-light">Các bài tập đang thuộc khóa học bạn đang theo học</p>
        </div>

        {activeCourses.length === 0 ? (
          <EmptyState
            title="Chưa có khóa học đang hoạt động"
            description="Khi giáo viên ghi danh bạn vào khóa học mới, thông tin sẽ xuất hiện tại đây."
          />
        ) : (
          <div className="space-y-4">
            {activeCourses.map((course) => (
              <CourseSection key={`${course.id}-${course.classId}`} course={course} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-display font-semibold text-ink">Khóa học trước đây</h2>
          <p className="text-sm text-mute-light">Bạn có thể xem lại kết quả cho đến khi khóa học hết hạn</p>
        </div>

        {pastCourses.length === 0 ? (
          <EmptyState
            title="Chưa có khóa học trước đây"
            description="Các khóa học đã kết thúc nhưng còn hiệu lực xem lại sẽ hiển thị tại đây."
          />
        ) : (
          <div className="space-y-4">
            {pastCourses.map((course) => (
              <CourseSection key={`${course.id}-${course.classId}`} course={course} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
