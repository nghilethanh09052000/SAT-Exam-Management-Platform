import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { AppIcon } from '@/components/ui/app-icon'
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
    <div className="space-y-6 sm:space-y-8">
      <div className="relative mb-0 overflow-hidden rounded-2xl border border-[#332f24] bg-[#25231d] p-5 text-white shadow-[0_22px_54px_rgba(67,57,39,0.24)] sm:p-6 animate-fade-up">
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">{t('tagline')}</p>
            <h1 className="mt-2 text-2xl font-display font-bold md:text-3xl">{t('title')}</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
              {t('description')}
            </p>
          </div>
          <Link href="/teacher/assignments/new">
            <Button className="w-full bg-[#d8c28a] text-[#1d1b14] hover:bg-[#e1cf9e] sm:w-auto">
              <AppIcon name="plus" className="mr-2 h-4 w-4" />
              {t('createAssignment')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('activeCourses')}
          value={courseCount}
          color="blue"
          delay={0}
          icon={<AppIcon name="book" className="h-5 w-5" />}
        />
        <StatCard
          label={t('enrolledStudents')}
          value={studentCount}
          color="violet"
          delay={70}
          icon={<AppIcon name="users" className="h-5 w-5" />}
        />
        <StatCard
          label={t('openAssignments')}
          value={openCount}
          color="emerald"
          delay={140}
          icon={<AppIcon name="clipboard" className="h-5 w-5" />}
        />
        <StatCard
          label={t('questionBankCount')}
          value={questionCount}
          color="amber"
          delay={210}
          icon={<AppIcon name="help" className="h-5 w-5" />}
        />
      </div>

      {/* Recent assignments */}
      <div className="rounded-2xl border border-[#e7e0d2] bg-white/90 p-4 shadow-[0_14px_36px_rgba(67,57,39,0.08)] sm:p-5 animate-fade-up" style={{ animationDelay: '260ms' }}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-display font-semibold text-[#25231d]">{t('recentAssignments')}</h2>
          <Link href="/teacher/assignments">
            <Button variant="ghost" size="sm" className="w-full text-[#6f5b25] hover:bg-[#f1ead9] sm:w-auto">
              {t('viewAll')}
              <AppIcon name="chevron-right" className="ml-1 h-3.5 w-3.5" />
            </Button>
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
