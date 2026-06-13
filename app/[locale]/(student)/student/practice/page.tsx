import { getCachedUser } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { StudentTabBar, type StudentTab } from '@/components/student/student-tab-bar'
import { TopicBank, type TopicSubject } from '@/components/student/topic-bank'
import { StreakCard } from '@/components/student/streak-card'
import { EmptyState } from '@/components/ui/empty-state'
import { MockTestGrid, type MockTestItem } from '@/components/student/mock-test-grid'

export const dynamic = 'force-dynamic'

const VALID_TABS = ['topics', 'test'] as const
type Tab = (typeof VALID_TABS)[number]

type TagRow = { id: string; subject: 'reading_writing' | 'math'; name: string }

type StreakRow = { current_streak: number; longest_streak: number; last_activity_date: string | null; total_days_active: number }
type ActivityRow = { activity_date: string; exercises_completed: number }
type PracticeAssignmentRow = {
  id: string
  deadline: string
  practice_test_id: string
  exam_papers: { title: string; source: string | null; year: number | null } | null
}
type ModuleRow = { exam_paper_id: string; module_name: string | null; order_index: number }
type AttemptRow = { practice_test_assignment_id: string; status: string; raw_score: number | null; total_questions: number | null }

type CategoryResultRow = { tag_id: string; difficulty: string; raw_score: number; total_questions: number }

// ── Topic data: 14 SAT tags grouped by subject, with live question counts ─────
async function loadTopics(userId: string): Promise<TopicSubject[]> {
  const db = serviceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db as any

  const [{ data: tags }, { data: resultRows }] = await Promise.all([
    sb
      .from('tags')
      .select('id, subject, name')
      .order('name', { ascending: true }) as Promise<{ data: TagRow[] | null }>,
    sb
      .from('practice_category_results')
      .select('tag_id, difficulty, raw_score, total_questions')
      .eq('student_id', userId) as Promise<{ data: CategoryResultRow[] | null }>,
  ])

  // tag_id → { difficulty → {raw, total} } so the card can badge the last score
  // per difficulty group and link to its review.
  const resultsByTag = new Map<string, Record<string, { raw: number; total: number }>>()
  for (const r of resultRows ?? []) {
    const byDiff = resultsByTag.get(r.tag_id) ?? {}
    byDiff[r.difficulty] = { raw: r.raw_score, total: r.total_questions }
    resultsByTag.set(r.tag_id, byDiff)
  }

  const list = tags ?? []
  const counts = await Promise.all(
    list.map(async (tag) => {
      const { data: rows } = (await sb
        .from('question_tags')
        .select('question_id, questions!inner(archived_at, difficulty)')
        .eq('tag_id', tag.id)
        .is('questions.archived_at', null)) as {
        data: { questions: { difficulty: string | null } | null }[] | null
      }
      const byDifficulty = { easy: 0, medium: 0, hard: 0, all: 0 }
      for (const r of rows ?? []) {
        const d = r.questions?.difficulty
        // Questions with a NULL/unknown difficulty are grouped under "all" so
        // they stay reachable instead of vanishing from the drill list.
        if (d === 'easy' || d === 'medium' || d === 'hard') byDifficulty[d] += 1
        else byDifficulty.all += 1
      }
      const total = (rows ?? []).length
      return [tag.id, { total, byDifficulty }] as const
    })
  )
  const countMap = new Map(counts)

  const order: TopicSubject['key'][] = ['reading_writing', 'math']
  return order.map((key) => ({
    key,
    label: '',
    topics: list
      .filter((tag) => tag.subject === key)
      .map((tag) => {
        const c = countMap.get(tag.id)
        return {
          id: tag.id,
          name: tag.name,
          count: c?.total ?? 0,
          byDifficulty: c?.byDifficulty ?? { easy: 0, medium: 0, hard: 0, all: 0 },
          lastResults: resultsByTag.get(tag.id) ?? {},
        }
      }),
  }))
}

async function loadActivity(userId: string) {
  const db = serviceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db as any
  const since = new Date()
  since.setDate(since.getDate() - 371)

  const [{ data: streak }, { data: activity }] = await Promise.all([
    sb.from('student_streaks')
      .select('current_streak, longest_streak, last_activity_date, total_days_active')
      .eq('student_id', userId)
      .maybeSingle() as Promise<{ data: StreakRow | null }>,
    sb.from('daily_activity')
      .select('activity_date, exercises_completed')
      .eq('student_id', userId)
      .gte('activity_date', since.toISOString().slice(0, 10))
      .order('activity_date', { ascending: true }) as Promise<{ data: ActivityRow[] | null }>,
  ])

  return {
    streak: streak ?? { current_streak: 0, longest_streak: 0, last_activity_date: null, total_days_active: 0 },
    activity: activity ?? [],
  }
}

async function loadPracticeTests(userId: string): Promise<MockTestItem[]> {
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
    .eq('test_type', 'self_practice')
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
    if (!latestByAssignment.has(attempt.practice_test_assignment_id)) {
      latestByAssignment.set(attempt.practice_test_assignment_id, attempt)
    }
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
      title: assignment.exam_papers?.title ?? '-',
      meta: [assignment.exam_papers?.source, assignment.exam_papers?.year].filter(Boolean).join(' · ') || null,
      modules: modulesByPaper.get(assignment.practice_test_id) ?? [],
      questionCount: questionCountByPaper.get(assignment.practice_test_id) ?? 0,
      status,
      href: `/student/practice-tests/assigned/${assignment.id}?tab=test`,
      resultsHref: status === 'submitted' ? `/student/practice-tests/assigned/${assignment.id}/results?tab=test` : null,
      score: status === 'submitted' && latest?.total_questions
        ? { raw: latest.raw_score ?? 0, total: latest.total_questions }
        : null,
    }
  })
}

export default async function StudentPracticePage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { tab?: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.practice')
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const tab: Tab = VALID_TABS.includes(searchParams.tab as Tab) ? (searchParams.tab as Tab) : 'topics'
  const tabs: StudentTab[] = [
    {
      key: 'topics',
      label: t('tabTopics'),
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>,
    },
    {
      key: 'test',
      label: t('tabTest'),
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

      {/* Activity streak stays visible across both tabs */}
      <ActivityPanel userId={user.id} />

      <StudentTabBar basePath="/student/practice" tabs={tabs} activeKey={tab} />

      {tab === 'topics' && <TopicsPanel userId={user.id} />}
      {tab === 'test' && <PracticeTestPanel userId={user.id} />}
    </div>
  )
}

async function TopicsPanel({ userId }: { userId: string }) {
  const t = await getTranslations('student.practice')
  const subjects = await loadTopics(userId)
  const labelled = subjects.map((s) => ({
    ...s,
    label: s.key === 'math' ? t('subjectMath') : t('subjectReadingWriting'),
  }))
  const hasAny = labelled.some((s) => s.topics.length > 0)

  if (!hasAny) {
    return <EmptyState title={t('topicsEmptyTitle')} description={t('topicsEmptyDesc')} />
  }
  return <TopicBank subjects={labelled} tabKey="topics" />
}

async function ActivityPanel({ userId }: { userId: string }) {
  const { streak, activity } = await loadActivity(userId)
  return <StreakCard streak={streak} activity={activity} />
}

async function PracticeTestPanel({ userId }: { userId: string }) {
  const t = await getTranslations('student.practice')
  const items = await loadPracticeTests(userId)
  return <MockTestGrid items={items} emptyTitle={t('testEmptyTitle')} emptyDesc={t('testEmptyDesc')} />
}
