import { getCachedUser } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { TopicBank, type TopicSubject } from '@/components/student/topic-bank'
import { StreakCard } from '@/components/student/streak-card'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

type TagRow = { id: string; subject: 'reading_writing' | 'math'; name: string }

type StreakRow = { current_streak: number; longest_streak: number; last_activity_date: string | null; total_days_active: number }
type ActivityRow = { activity_date: string; exercises_completed: number }

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
}: {
  params: { locale: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.practice')
  const user = await getCachedUser()
  if (!user) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6d7cff]">{t('sectionLabel')}</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-[#232635] md:text-5xl">{t('title')}</h1>
        <p className="mt-2 text-base font-medium text-[#778095]">{t('subtitle')}</p>
      </div>

      {/* Activity streak stays visible across both tabs */}
      <ActivityPanel userId={user.id} />

      <TopicsPanel locale={params.locale} />
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

async function ActivityPanel({ userId }: { userId: string }) {
  const { streak, activity } = await loadActivity(userId)
  return <StreakCard streak={streak} activity={activity} />
}
