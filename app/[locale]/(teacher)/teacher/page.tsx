import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { getTranslations, setRequestLocale } from 'next-intl/server'

function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

interface AssignmentRow {
  id: string
  deadline: string
  published_at: string | null
  assignment_id: string
  assignments: { title: string } | null
  classes: { title: string } | null
}

export default async function TeacherDashboard({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.dashboard')
  const supabase = createServerClient()
  const raw = rawClient()
  const { data: { user } } = await supabase.auth.getUser()

  const teacherId = user?.id ?? ''
  const now = new Date().toISOString()

  // Load all course IDs for this teacher to get class IDs
  const coursesRes = await supabase
    .from('courses')
    .select('id')
    .eq('teacher_id', teacherId)
    .is('archived_at', null)

  const courseIds = ((coursesRes.data as { id: string }[] | null) ?? []).map((c) => c.id)

  const classesRes = courseIds.length > 0
    ? await supabase
        .from('classes')
        .select('id')
        .in('course_id', courseIds)
        .is('archived_at', null)
    : { data: [] as { id: string }[] }

  const classIds = ((classesRes.data as { id: string }[] | null) ?? []).map((c) => c.id)

  const [
    courseCountRes,
    questionCountRes,
    studentCountRes,
    instancesResult,
  ] = await Promise.all([
    supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .is('archived_at', null)
      .eq('teacher_id', teacherId),
    supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .is('archived_at', null)
      .eq('created_by', teacherId),
    // Count unique students enrolled in teacher's classes
    classIds.length > 0
      ? raw
          .from('enrollments')
          .select('student_id', { count: 'exact', head: true })
          .in('class_id', classIds)
      : Promise.resolve({ count: 0 }),
    // Recent assignment instances across teacher's classes
    classIds.length > 0
      ? supabase
          .from('assignment_instances')
          .select('id, deadline, published_at, assignment_id, class_id, assignments(title), classes(title)')
          .in('class_id', classIds)
          .order('deadline', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as AssignmentRow[] }),
  ])

  const courseCount = courseCountRes.count ?? 0
  const questionCount = questionCountRes.count ?? 0
  const studentCount = studentCountRes.count ?? 0
  const assignments: AssignmentRow[] = (instancesResult.data as AssignmentRow[] | null) ?? []

  // Count open (published + not expired)
  const openCount = assignments.filter(
    (a) => a.published_at && a.deadline > now
  ).length

  const tableData: Record<string, unknown>[] = assignments.map((a) => ({
    id: a.id,
    title: a.assignments?.title ?? '—',
    class_name: a.classes?.title ?? '—',
    deadline: a.deadline,
    published_at: a.published_at,
  }))

  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'

  return (
    <div>
      <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-violet-700 to-sky-600 p-6 text-white shadow-2xl shadow-indigo-500/20 animate-fade-up">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 left-1/3 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">{t('tagline')}</p>
            <h1 className="mt-2 text-2xl font-display font-bold md:text-3xl">{t('title')}</h1>
            <p className="mt-2 max-w-xl text-sm text-white/75">
              {t('description')}
            </p>
          </div>
          <Link href="/teacher/assignments/new">
            <Button className="bg-white text-indigo-700 hover:bg-white/90">
              {t('createAssignment')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard
          label={t('activeCourses')}
          value={courseCount}
          color="blue"
          delay={0}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
        <StatCard
          label={t('enrolledStudents')}
          value={studentCount}
          color="violet"
          delay={70}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label={t('openAssignments')}
          value={openCount}
          color="emerald"
          delay={140}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          label={t('questionBankCount')}
          value={questionCount}
          color="amber"
          delay={210}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Recent assignments */}
      <div className="teacher-surface p-5 animate-fade-up" style={{ animationDelay: '260ms' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display font-semibold text-ink">{t('recentAssignments')}</h2>
          <Link href="/teacher/assignments">
            <Button variant="ghost" size="sm">{t('viewAll')}</Button>
          </Link>
        </div>
        <DataTable
          columns={[
            {
              key: 'title',
              header: t('assignmentName'),
              render: (row) => (
                <Link href={`/teacher/assignments/${row.id}`} className="text-primary hover:underline font-medium text-sm">
                  {String(row.title)}
                </Link>
              ),
            },
            { key: 'class_name', header: t('class') },
            {
              key: 'deadline',
              header: t('deadline'),
              render: (row) =>
                new Date(String(row.deadline)).toLocaleDateString(dateLocale, {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                }),
            },
            {
              key: 'published_at',
              header: t('deadline'),
              render: (row) => {
                const deadline = String(row.deadline)
                const isExpired = deadline < now
                if (isExpired) return <Badge variant="muted">{t('statusExpired')}</Badge>
                if (!row.published_at) return <Badge variant="warning">{t('statusDraft')}</Badge>
                return <Badge variant="success">{t('statusOpen')}</Badge>
              },
            },
          ]}
          data={tableData}
          keyField="id"
          emptyMessage={t('emptyAssignments')}
        />
      </div>
    </div>
  )
}
