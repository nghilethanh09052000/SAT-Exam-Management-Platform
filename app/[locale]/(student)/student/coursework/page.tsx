import { getCachedUser } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { StudentTabBar, type StudentTab } from '@/components/student/student-tab-bar'
import { CourseAssignments } from '@/components/student/course-assignments'
import { MockTestGrid, type MockTestItem } from '@/components/student/mock-test-grid'

export const dynamic = 'force-dynamic'

const VALID_TABS = ['current', 'mock'] as const
type Tab = (typeof VALID_TABS)[number]

type PracticeAssignmentRow = {
  id: string
  deadline: string
  practice_test_id: string
  exam_papers: { title: string; source: string | null; year: number | null } | null
}
type ModuleRow = { exam_paper_id: string; module_name: string | null; order_index: number }
type AttemptRow = { practice_test_assignment_id: string; status: string; raw_score: number | null; total_questions: number | null }

// In-course mock tests now come from dedicated practice test assignments.
async function loadCourseMockTests(userId: string): Promise<MockTestItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = serviceClient() as any
  const now = new Date()

  const { data: enrollments } = await sb
    .from('enrollments')
    .select('class_id')
    .eq('student_id', userId)
  const classIds = (enrollments ?? []).map((e: { class_id: string }) => e.class_id)
  if (classIds.length === 0) return []

  const { data: assignedData } = await sb
    .from('practice_test_assignments')
    .select('id, deadline, practice_test_id, exam_papers(title, source, year)')
    .in('class_id', classIds)
    .eq('test_type', 'coursework')
    .not('published_at', 'is', null)
    .order('deadline', { ascending: false })
  const assignments = (assignedData as PracticeAssignmentRow[] | null) ?? []
  if (assignments.length === 0) return []

  const paperIds = Array.from(new Set(assignments.map((assignment) => assignment.practice_test_id)))
  const assignmentIds = assignments.map((assignment) => assignment.id)
  const [{ data: moduleData }, { data: attemptData }] = await Promise.all([
    sb
      .from('exam_paper_questions')
      .select('exam_paper_id, module_name, order_index')
      .in('exam_paper_id', paperIds)
      .order('order_index', { ascending: true }) as Promise<{ data: ModuleRow[] | null }>,
    sb
      .from('practice_test_attempts')
      .select('practice_test_assignment_id, status, raw_score, total_questions')
      .eq('student_id', userId)
      .in('practice_test_assignment_id', assignmentIds)
      .order('started_at', { ascending: false }) as Promise<{ data: AttemptRow[] | null }>,
  ])

  const modulesByPaper = new Map<string, string[]>()
  const questionCountByPaper = new Map<string, number>()
  for (const row of moduleData ?? []) {
    questionCountByPaper.set(row.exam_paper_id, (questionCountByPaper.get(row.exam_paper_id) ?? 0) + 1)
    const name = (row.module_name ?? '').trim()
    if (!name) continue
    const list = modulesByPaper.get(row.exam_paper_id) ?? []
    if (!list.includes(name)) list.push(name)
    modulesByPaper.set(row.exam_paper_id, list)
  }

  const latestByAssignment = new Map<string, AttemptRow>()
  for (const attempt of attemptData ?? []) {
    const existing = latestByAssignment.get(attempt.practice_test_assignment_id)
    if (existing) continue
    latestByAssignment.set(attempt.practice_test_assignment_id, attempt)
  }

  return assignments.map((assignment) => {
    const latest = latestByAssignment.get(assignment.id)
    const overdue = new Date(assignment.deadline) < now
    let status: MockTestItem['status']
    if (latest?.status === 'submitted' || latest?.status === 'grading') status = 'submitted'
    else if (latest?.status === 'in_progress') status = 'in_progress'
    else status = overdue ? 'expired' : 'available'

    return {
      id: assignment.id,
      title: assignment.exam_papers?.title ?? '—',
      meta: [assignment.exam_papers?.source, assignment.exam_papers?.year].filter(Boolean).join(' · ') || null,
      modules: modulesByPaper.get(assignment.practice_test_id) ?? [],
      questionCount: questionCountByPaper.get(assignment.practice_test_id) ?? 0,
      status,
      href: `/student/practice-tests/assigned/${assignment.id}`,
      resultsHref: status === 'submitted' ? `/student/practice-tests/assigned/${assignment.id}/results` : null,
      score: status === 'submitted' && latest?.total_questions
        ? { raw: latest.raw_score ?? 0, total: latest.total_questions }
        : null,
    }
  })
}

export default async function CourseworkPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { tab?: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.coursework')
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const tab: Tab = VALID_TABS.includes(searchParams.tab as Tab) ? (searchParams.tab as Tab) : 'current'

  const tabs: StudentTab[] = [
    {
      key: 'current',
      label: t('tabCurrent'),
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 3h10l3 3v15H4V3h3z" /><path strokeLinecap="round" d="M8 11h8M8 15h5" /></svg>,
    },
    {
      key: 'mock',
      label: t('tabMock'),
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6d7cff]">{t('sectionLabel')}</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-ink md:text-5xl">{t('title')}</h1>
        <p className="mt-2 text-base font-medium text-[#778095]">{t('subtitle')}</p>
      </div>

      <StudentTabBar basePath="/student/coursework" tabs={tabs} activeKey={tab} />

      {tab === 'current' && <CourseAssignments userId={user.id} />}
      {tab === 'mock' && <CourseMockPanel userId={user.id} />}
    </div>
  )
}

async function CourseMockPanel({ userId }: { userId: string }) {
  const t = await getTranslations('student.coursework')
  const items = await loadCourseMockTests(userId)
  return <MockTestGrid items={items} emptyTitle={t('mockEmptyTitle')} emptyDesc={t('mockEmptyDesc')} />
}
