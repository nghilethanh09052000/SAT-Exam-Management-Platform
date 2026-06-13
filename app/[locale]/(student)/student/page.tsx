import { getCachedUser, getCachedProfile, createServerClient } from '@/lib/supabase/server'
import { AssignmentCard } from '@/components/dashboard/assignment-card'
import { EmptyState } from '@/components/ui/empty-state'
import { getTranslations, setRequestLocale } from 'next-intl/server'
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

function formatCourseDateRange(startDate: string, endDate: string, locale: string) {
  const formatter = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return `${formatter.format(new Date(startDate))} – ${formatter.format(new Date(endDate))}`
}

function daysUntil(date: string) {
  const end = new Date(date).getTime()
  const now = Date.now()
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)))
}

function percent(value: number, total: number) {
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}

function StatTile({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string
  value: string | number
  detail: string
  tone: string
  icon: React.ReactNode
}) {
  return (
    <div className="group relative overflow-hidden rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-sm shadow-blue-100/70 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-100">
      <div className={`absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-20 blur-2xl ${tone}`} />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-[#81899d]">{label}</p>
          <p className="mt-3 text-4xl font-black tracking-tight text-ink">{value}</p>
          <p className="mt-1 text-xs font-semibold text-[#9aa2b6]">{detail}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110 ${tone}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function SunCard({ pendingCount, schedule, hasPending, noPending, checkCourse, keepPace }: { pendingCount: number; schedule: string; hasPending: string; noPending: string; checkCourse: string; keepPace: string }) {
  return (
    <div className="relative min-h-[230px] overflow-hidden rounded-[28px] bg-[#eaf2ff] p-7 shadow-sm">
      <div className="relative z-10 max-w-[58%]">
        <p className="text-2xl font-black text-[#2b3143]">{schedule}</p>
        <p className="mt-8 text-sm font-semibold text-[#667085]">
          {pendingCount > 0 ? hasPending : noPending}
        </p>
        <p className="mt-3 text-lg font-black leading-snug text-ink">
          {pendingCount > 0 ? keepPace : checkCourse}
        </p>
      </div>
      <div className="absolute bottom-5 right-8 h-32 w-32 animate-[popIn_0.7s_ease-out_both] rounded-full bg-[#ffd15c] shadow-[0_0_0_18px_rgba(255,209,92,0.28),0_0_0_38px_rgba(255,209,92,0.14)]">
        <div className="absolute left-8 top-11 h-3 w-3 rounded-full bg-[#2f3a4d]" />
        <div className="absolute right-8 top-11 h-3 w-3 rounded-full bg-[#2f3a4d]" />
        <div className="absolute left-1/2 top-[68px] h-5 w-10 -translate-x-1/2 rounded-b-full border-b-4 border-[#2f3a4d]" />
      </div>
      <div className="absolute bottom-8 right-0 h-12 w-40 rounded-full bg-white/80" />
      <div className="absolute right-24 top-8 h-10 w-32 rounded-full bg-white/90" />
      <div className="absolute right-48 top-16 text-2xl text-[#ffc83d]">✦</div>
      <div className="absolute bottom-10 right-4 text-3xl text-[#ffc83d]">✦</div>
    </div>
  )
}

function ResultsGauge({ submitted, total, resultsOverview, resultsSubtitle, submittedLabel, pendingLabel, totalLabel }: { submitted: number; total: number; resultsOverview: string; resultsSubtitle: string; submittedLabel: string; pendingLabel: string; totalLabel: string }) {
  const donePercent = percent(submitted, total)

  return (
    <div className="rounded-[28px] border border-white/80 bg-white/[0.92] p-7 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-black text-[#2b3143]">{resultsOverview}</p>
          <p className="mt-1 text-sm font-semibold text-[#8a91a3]">{resultsSubtitle}</p>
        </div>
        <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-xs font-black text-[#5572f6]">{donePercent}%</span>
      </div>

      <div className="relative mx-auto mt-8 h-36 w-72 overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 h-36 rounded-t-full bg-[#edf0f6]" />
        <div
          className="absolute bottom-0 left-0 h-36 rounded-tl-full bg-gradient-to-r from-[#4f7cff] via-[#22c55e] to-[#ffd15c] transition-all duration-700"
          style={{ width: `${donePercent}%` }}
        />
        <div className="absolute bottom-0 left-1/2 h-24 w-48 -translate-x-1/2 rounded-t-full bg-white" />
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center">
          <p className="text-xs font-bold text-[#8a91a3]">{submittedLabel}</p>
          <p className="text-4xl font-black text-ink">{submitted}</p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {[
          [submittedLabel, submitted, 'bg-[#4f7cff]'],
          [pendingLabel, Math.max(0, total - submitted), 'bg-[#ffd15c]'],
          [totalLabel, total, 'bg-[#8a91a3]'],
        ].map(([label, value, color]) => (
          <div key={label as string} className="flex items-center gap-3 text-sm font-bold text-[#4d5568]">
            <span className={`h-3 w-3 rounded-full ${color}`} />
            <span className="flex-1">{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CourseSection({ course, labels, locale }: { course: StudentCourse; labels: { reviewOnly: string; completion: (pct: number) => string; noAssignment: string; noAssignmentDesc: string }; locale: string }) {
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
              <h2 className="text-xl font-black text-ink">{course.title}</h2>
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
            <p className="text-sm font-bold text-[#6a7286]">{formatCourseDateRange(course.startDate, course.endDate, locale)}</p>
            <p className="mt-1 text-xs font-black text-[#22a06b]">{labels.completion(completion)}</p>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#edf0f7]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#4f7cff] via-[#22c55e] to-[#ffd15c] transition-all duration-700" style={{ width: `${completion}%` }} />
        </div>
      </div>

      <div className="p-6">
        {weeks.length === 0 ? (
          <EmptyState title={labels.noAssignment} description={labels.noAssignmentDesc} icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" /></svg>} />
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

export default async function StudentHomePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.dashboard')
  const [user, profile] = await Promise.all([getCachedUser(), getCachedProfile()])
  if (!user) return null

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
  const allAssignments = courses.flatMap((course) => course.assignments)
  const submittedCount = allAssignments.filter((assignment) => assignment.status === 'submitted').length
  const inProgressCount = allAssignments.filter((assignment) => assignment.status === 'in_progress').length
  const pendingCount = allAssignments.filter((assignment) => assignment.status === 'not_started' || assignment.status === 'in_progress').length
  const nextAssignment = allAssignments
    .filter((assignment) => assignment.status === 'not_started' || assignment.status === 'in_progress')
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())[0]
  const activeCourse = activeCourses[0]
  const activeCourseSubmitted = activeCourse?.assignments.filter((assignment) => assignment.status === 'submitted').length ?? 0
  const activeCourseProgress = percent(activeCourseSubmitted, activeCourse?.assignments.length ?? 0)
  const studentName = profile?.full_name ?? user.email?.split('@')[0] ?? 'bạn'
  const courseLabels = {
    reviewOnly: t('reviewOnly'),
    completion: (pct: number) => t('completion', { percent: pct }),
    noAssignment: t('noAssignment'),
    noAssignmentDesc: t('noAssignmentDesc'),
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6d7cff]">{t('subtitle')}</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-ink md:text-5xl">
            {t('title')}
          </h1>
          <p className="mt-2 text-base font-medium text-[#778095]">
            {t('description')}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-4 py-2 text-sm font-bold text-[#697083] shadow-sm backdrop-blur">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
          {t('currentlyStudying')}
        </div>
      </div>

      <section className="relative overflow-hidden rounded-[34px] border border-white/80 bg-white/90 p-7 shadow-sm shadow-blue-100/70 backdrop-blur md:p-8">
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-[#ffd15c]/25 blur-3xl" />
        <div className="absolute bottom-0 right-40 h-52 w-52 rounded-full bg-[#65d6c4]/20 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-[#4f68f5] md:text-4xl">
              {t('greeting', { name: studentName })}
            </h2>
            <p className="mt-3 max-w-2xl text-lg font-semibold text-[#363b4d]">
              {nextAssignment
                ? t('nextAssignment', { title: nextAssignment.title, days: daysUntil(nextAssignment.deadline) })
                : t('noPendingAssignments')}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                <span
                  key={day}
                  className={[
                    'rounded-full px-4 py-2 text-sm font-black transition-transform duration-300 hover:-translate-y-1',
                    index === new Date().getDay()
                      ? 'bg-gradient-to-r from-[#4f7cff] to-[#7c4dff] text-white shadow-lg shadow-indigo-500/20'
                      : 'bg-[#eef3ff] text-[#5b72f6]',
                  ].join(' ')}
                >
                  {day}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-5 rounded-[28px] bg-gradient-to-br from-[#f5f8ff] to-[#fff8e7] p-5">
            <div>
              <p className="text-4xl font-black text-ink">{activeCourse ? daysUntil(activeCourse.endDate) : 0}</p>
              <p className="text-sm font-bold text-[#697083]">{t('daysRemaining')}</p>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f7cff] to-[#7c4dff] text-white shadow-xl shadow-indigo-500/25">
              <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3s6 5 6 11a6 6 0 1 1-12 0c0-3 2-5 4-7 0 3 2 4 2 4 1-3 0-5 0-8z" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      <section id="thanh-tich" className="scroll-mt-24 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t('statCourses')}
          value={activeCourses.length}
          detail={t('statReviewCourses', { count: pastCourses.length })}
          tone="bg-gradient-to-br from-[#4f7cff] to-[#7c4dff]"
          icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h10" /></svg>}
        />
        <StatTile
          label={t('statSubmitted')}
          value={submittedCount}
          detail={t('statTotalAssignments', { count: allAssignments.length })}
          tone="bg-gradient-to-br from-[#22c55e] to-[#14b8a6]"
          icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="m5 13 4 4L19 7" /></svg>}
        />
        <StatTile
          label={t('statInProgress')}
          value={inProgressCount}
          detail={t('statNeedAttention', { count: pendingCount })}
          tone="bg-gradient-to-br from-[#ffb84d] to-[#f97316]"
          icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="9" /></svg>}
        />
        <StatTile
          label={t('statCourseProgress')}
          value={`${activeCourseProgress}%`}
          detail={activeCourse?.title ?? t('statNoCourse')}
          tone="bg-gradient-to-br from-[#f472b6] to-[#8b5cf6]"
          icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M6 20V10M12 20V4M18 20v-7" /></svg>}
        />
      </section>

      <section id="lich-hoc" className="scroll-mt-24 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <SunCard
          pendingCount={pendingCount}
          schedule={t('schedule')}
          hasPending={t('hasPending', { count: pendingCount })}
          noPending={t('noPending')}
          checkCourse={t('checkCourse')}
          keepPace={t('keepPace')}
        />
        <ResultsGauge
          submitted={submittedCount}
          total={allAssignments.length}
          resultsOverview={t('resultsOverview')}
          resultsSubtitle={t('resultsSubtitle')}
          submittedLabel={t('submitted')}
          pendingLabel={t('pending')}
          totalLabel={t('total')}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-ink">{t('activeCourses')}</h2>
          <p className="mt-1 text-sm font-semibold text-[#7b8295]">{t('activeCoursesDesc')}</p>
        </div>

        {activeCourses.length === 0 ? (
          <EmptyState
            title={t('noActiveCourse')}
            description={t('noActiveCourseDesc')}
          />
        ) : (
          <div className="space-y-4">
            {activeCourses.map((course) => (
              <CourseSection key={`${course.id}-${course.classId}`} course={course} labels={courseLabels} locale={params.locale} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-ink">{t('pastCourses')}</h2>
          <p className="mt-1 text-sm font-semibold text-[#7b8295]">{t('pastCoursesDesc')}</p>
        </div>

        {pastCourses.length === 0 ? (
          <EmptyState
            title={t('noPastCourse')}
            description={t('noPastCourseDesc')}
          />
        ) : (
          <div className="space-y-4">
            {pastCourses.map((course) => (
              <CourseSection key={`${course.id}-${course.classId}`} course={course} labels={courseLabels} locale={params.locale} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
