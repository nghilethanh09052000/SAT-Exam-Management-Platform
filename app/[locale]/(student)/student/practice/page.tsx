import { getCachedUser } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { StudentTabBar, type StudentTab } from '@/components/student/student-tab-bar'
import { TopicBank, type TopicSubject } from '@/components/student/topic-bank'
import { MockTestGrid, type MockTestItem } from '@/components/student/mock-test-grid'
import { StreakCard } from '@/components/student/streak-card'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

type TagRow = { id: string; subject: 'reading_writing' | 'math'; name: string }

type ExamPaperRow = {
  id: string
  title: string
  source: string | null
  year: number | null
  exam_paper_questions: { count: number }[]
}

type ModuleRow = { exam_paper_id: string; module_name: string | null; order_index: number }
type AttemptRow = { exam_paper_id: string; status: string; raw_score: number | null; total_questions: number | null }
type StreakRow = { current_streak: number; longest_streak: number; last_activity_date: string | null; total_days_active: number }
type ActivityRow = { activity_date: string; exercises_completed: number }

const VALID_TABS = ['topics', 'mock'] as const
type Tab = (typeof VALID_TABS)[number]

// ── Topic data: 14 SAT tags grouped by subject, with live question counts ─────
async function loadTopics(): Promise<TopicSubject[]> {
  const db = serviceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db as any

  const { data: tags } = (await sb
    .from('tags')
    .select('id, subject, name')
    .order('name', { ascending: true })) as { data: TagRow[] | null }

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
        }
      }),
  }))
}

// ── Mock tests: the public exam-paper bank ────────────────────────────────────
async function loadMockTests(userId: string): Promise<MockTestItem[]> {
  const db = serviceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db as any

  const { data } = (await sb
    .from('exam_papers')
    .select('id, title, source, year, exam_paper_questions(count)')
    .eq('is_public', true)
    .is('archived_at', null)
    .order('created_at', { ascending: false })) as { data: ExamPaperRow[] | null }

  const papers = data ?? []
  if (papers.length === 0) return []
  const ids = papers.map((p) => p.id)

  const [{ data: moduleRows }, { data: attemptRows }] = await Promise.all([
    sb.from('exam_paper_questions')
      .select('exam_paper_id, module_name, order_index')
      .in('exam_paper_id', ids)
      .order('order_index', { ascending: true }) as Promise<{ data: ModuleRow[] | null }>,
    sb.from('public_exam_attempts')
      .select('exam_paper_id, status, raw_score, total_questions')
      .eq('student_id', userId)
      .in('exam_paper_id', ids)
      .order('started_at', { ascending: false }) as Promise<{ data: AttemptRow[] | null }>,
  ])

  const modulesByPaper = new Map<string, string[]>()
  for (const row of moduleRows ?? []) {
    if (!row.module_name) continue
    const list = modulesByPaper.get(row.exam_paper_id) ?? []
    if (!list.includes(row.module_name)) list.push(row.module_name)
    modulesByPaper.set(row.exam_paper_id, list)
  }
  const latestByPaper = new Map<string, AttemptRow>()
  for (const a of attemptRows ?? []) {
    if (!latestByPaper.has(a.exam_paper_id)) latestByPaper.set(a.exam_paper_id, a)
  }

  return papers.map((paper) => {
    const latest = latestByPaper.get(paper.id)
    const status: MockTestItem['status'] =
      latest?.status === 'submitted' ? 'submitted' : latest?.status === 'in_progress' ? 'in_progress' : 'available'
    return {
      id: paper.id,
      title: paper.title,
      meta: [paper.source, paper.year].filter(Boolean).join(' · ') || null,
      modules: modulesByPaper.get(paper.id) ?? [],
      questionCount: paper.exam_paper_questions?.reduce((s, r) => s + (r.count ?? 0), 0) ?? 0,
      status,
      href: `/free-test/test/${paper.id}`,
      resultsHref: status === 'submitted' ? `/free-test/test/${paper.id}/results` : null,
      score: status === 'submitted' && latest?.total_questions
        ? { raw: latest.raw_score ?? 0, total: latest.total_questions }
        : null,
    }
  })
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
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" /></svg>,
    },
    {
      key: 'mock',
      label: t('tabMock'),
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 3h10l3 3v15H4V3h3z" /><path strokeLinecap="round" d="M8 11h8M8 15h5" /></svg>,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6d7cff]">{t('sectionLabel')}</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-[#232635] md:text-5xl">{t('title')}</h1>
        <p className="mt-2 text-base font-medium text-[#778095]">{t('subtitle')}</p>
      </div>

      {/* Activity streak stays visible across both tabs */}
      <ActivityPanel userId={user.id} />

      <StudentTabBar basePath="/student/practice" tabs={tabs} activeKey={tab} />

      {tab === 'topics' && <TopicsPanel locale={params.locale} />}
      {tab === 'mock' && <MockPanel userId={user.id} />}
    </div>
  )
}

async function TopicsPanel({ locale }: { locale: string }) {
  const t = await getTranslations('student.practice')
  const subjects = await loadTopics()
  const labelled = subjects.map((s) => ({
    ...s,
    label: s.key === 'math' ? t('subjectMath') : t('subjectReadingWriting'),
  }))
  const hasAny = labelled.some((s) => s.topics.length > 0)

  void locale
  if (!hasAny) {
    return <EmptyState title={t('topicsEmptyTitle')} description={t('topicsEmptyDesc')} />
  }
  return <TopicBank subjects={labelled} />
}

async function MockPanel({ userId }: { userId: string }) {
  const t = await getTranslations('student.practice')
  const items = await loadMockTests(userId)
  return <MockTestGrid items={items} emptyTitle={t('mockEmptyTitle')} emptyDesc={t('mockEmptyDesc')} />
}

async function ActivityPanel({ userId }: { userId: string }) {
  const { streak, activity } = await loadActivity(userId)
  return <StreakCard streak={streak} activity={activity} />
}
