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

type InstanceRow = {
  id: string
  deadline: string
  assignment_id: string
  assignments: { title: string } | null
}
type AqRow = { assignment_id: string; module: string | null }
type SubmissionRow = { instance_id: string; status: string; raw_score: number | null; total_questions: number | null }

const STATUS_RANK: Record<string, number> = { submitted: 3, grading: 2, in_progress: 1 }

// In-course mock tests = assigned exams that span the full 2-module structure
// (at least two distinct modules, e.g. Reading & Writing + Math).
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

  const { data: instData } = await sb
    .from('assignment_instances')
    .select('id, deadline, assignment_id, assignments(title)')
    .in('class_id', classIds)
    .not('published_at', 'is', null)
    .order('deadline', { ascending: false })
  const instances = (instData as InstanceRow[] | null) ?? []
  if (instances.length === 0) return []

  const assignmentIds = Array.from(new Set(instances.map((i) => i.assignment_id)))
  const { data: aqData } = await sb
    .from('assignment_questions')
    .select('assignment_id, module')
    .in('assignment_id', assignmentIds)
  const aqRows = (aqData as AqRow[] | null) ?? []

  const modulesByAssignment = new Map<string, string[]>()
  const questionCountByAssignment = new Map<string, number>()
  for (const row of aqRows) {
    questionCountByAssignment.set(row.assignment_id, (questionCountByAssignment.get(row.assignment_id) ?? 0) + 1)
    const name = (row.module ?? '').trim()
    if (!name) continue
    const list = modulesByAssignment.get(row.assignment_id) ?? []
    if (!list.includes(name)) list.push(name)
    modulesByAssignment.set(row.assignment_id, list)
  }

  // Keep only instances whose assignment is a full multi-module exam.
  const mockInstances = instances.filter((i) => (modulesByAssignment.get(i.assignment_id)?.length ?? 0) >= 2)
  if (mockInstances.length === 0) return []

  const instanceIds = mockInstances.map((i) => i.id)
  const { data: subData } = await sb
    .from('submissions')
    .select('instance_id, status, raw_score, total_questions')
    .eq('student_id', userId)
    .in('instance_id', instanceIds)
    .order('started_at', { ascending: false })
  const submissions = (subData as SubmissionRow[] | null) ?? []
  const latestByInstance = new Map<string, SubmissionRow>()
  for (const s of submissions) {
    const existing = latestByInstance.get(s.instance_id)
    const incoming = STATUS_RANK[s.status] ?? 0
    const prev = existing ? STATUS_RANK[existing.status] ?? 0 : -1
    if (!existing || incoming > prev) latestByInstance.set(s.instance_id, s)
  }

  return mockInstances.map((inst) => {
    const latest = latestByInstance.get(inst.id)
    const overdue = new Date(inst.deadline) < now
    let status: MockTestItem['status']
    if (latest?.status === 'submitted' || latest?.status === 'grading') status = 'submitted'
    else if (latest?.status === 'in_progress') status = 'in_progress'
    else status = overdue ? 'expired' : 'available'

    return {
      id: inst.id,
      title: inst.assignments?.title ?? '—',
      meta: null,
      modules: modulesByAssignment.get(inst.assignment_id) ?? [],
      questionCount: questionCountByAssignment.get(inst.assignment_id) ?? 0,
      status,
      href: `/student/test/${inst.id}`,
      resultsHref: status === 'submitted' ? `/student/test/${inst.id}/results` : null,
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
        <h1 className="mt-2 text-4xl font-black tracking-tight text-[#232635] md:text-5xl">{t('title')}</h1>
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
