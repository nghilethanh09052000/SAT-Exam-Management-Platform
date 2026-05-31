import { getCachedProfile, getCachedUser } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { EmptyState } from '@/components/ui/empty-state'
import { TestInterface } from '../../../test/[instanceId]/test-interface'

export const dynamic = 'force-dynamic'

type TagRow = { id: string; name: string; subject: 'reading_writing' | 'math' }
type LinkRow = { question_id: string; questions: { id: string; difficulty: string | null; created_at: string } | null }
type FullQuestion = {
  id: string
  content: string
  stimulus: string | null
  prompt: string | null
  type: string
  subject: string | null
  question_options: { id: string; label: string; content: string; order: number; is_correct: boolean }[]
  question_accepted_answers: { answer_text: string }[]
}

const DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'all'])

function clampInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number.parseInt(raw ?? '', 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export default async function TopicPracticePage({
  params,
  searchParams,
}: {
  params: { locale: string; tagId: string }
  searchParams: { n?: string; offset?: string; difficulty?: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.practice')
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const limit = clampInt(searchParams.n, 12, 1, 30)
  const offset = clampInt(searchParams.offset, 0, 0, 5000)
  const difficulty = DIFFICULTIES.has(searchParams.difficulty ?? '') ? searchParams.difficulty! : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = serviceClient() as any

  const { data: tag } = (await sb
    .from('tags')
    .select('id, name, subject')
    .eq('id', params.tagId)
    .maybeSingle()) as { data: TagRow | null }
  if (!tag) notFound()

  // Resolve which questions belong to this drill (stable created_at + id order).
  let linkQuery = sb
    .from('question_tags')
    .select('question_id, questions!inner(id, difficulty, created_at)')
    .eq('tag_id', tag.id)
    .is('questions.archived_at', null)
  // Keep this bucketing identical to the topic list (practice/page.tsx):
  // "all" is the catch-all for questions with a NULL/unknown difficulty.
  if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') {
    linkQuery = linkQuery.eq('questions.difficulty', difficulty)
  } else if (difficulty === 'all') {
    linkQuery = linkQuery.is('questions.difficulty', null)
  }

  const { data: linkRows } = (await linkQuery) as { data: LinkRow[] | null }
  const ordered = (linkRows ?? [])
    .filter((r): r is LinkRow & { questions: NonNullable<LinkRow['questions']> } => Boolean(r.questions))
    .sort((a, b) => {
      const byDate = a.questions.created_at.localeCompare(b.questions.created_at)
      return byDate !== 0 ? byDate : a.questions.id.localeCompare(b.questions.id)
    })
  const slice = ordered.slice(offset, offset + limit)
  const ids = slice.map((r) => r.questions.id)

  // Reuse the real SAT exam runner (TestInterface). Drills run in an ephemeral
  // "practice mode": no attempt row, no per-answer persistence — grading happens
  // on the client and the streak is recorded via /api/student/practice/complete.
  const moduleLabel = tag.subject === 'math' ? 'Math' : 'Reading and Writing'

  let examQuestions: {
    assignmentQuestionId: string
    questionId: string
    type: string
    subject: string | null
    content: string
    stimulus: string | null
    prompt: string | null
    module: string
    options: { id: string; label: string; content: string; order: number }[]
  }[] = []
  const correctAnswers: Record<string, { correctOptionId?: string | null; acceptedAnswers?: string[] }> = {}

  if (ids.length > 0) {
    const { data: full } = (await sb
      .from('questions')
      .select(
        'id, content, stimulus, prompt, type, subject, question_options(id, label, content, order, is_correct), question_accepted_answers(answer_text)'
      )
      .in('id', ids)) as { data: FullQuestion[] | null }

    const byId = new Map((full ?? []).map((q) => [q.id, q]))
    examQuestions = ids
      .map((id) => byId.get(id))
      .filter((q): q is FullQuestion => Boolean(q))
      .map((q) => {
        correctAnswers[q.id] = {
          correctOptionId: q.question_options.find((o) => o.is_correct)?.id ?? null,
          acceptedAnswers: q.question_accepted_answers.map((a) => a.answer_text),
        }
        return {
          assignmentQuestionId: q.id,
          questionId: q.id,
          type: q.type,
          subject: q.subject ?? tag.subject,
          content: q.content,
          stimulus: q.stimulus,
          prompt: q.prompt,
          module: moduleLabel,
          options: [...q.question_options]
            .sort((a, b) => a.order - b.order)
            .map((o) => ({ id: o.id, label: o.label, content: o.content, order: o.order })),
        }
      })
  }

  // No questions → keep the friendly empty state (TestInterface needs at least one).
  if (examQuestions.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          href="/student/practice?tab=topics"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6d7cff] hover:text-[#4f7cff]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('backToTopics')}
        </Link>
        <EmptyState title={t('drillEmptyTitle')} description={t('drillEmptyDesc')} />
      </div>
    )
  }

  const profile = await getCachedProfile()
  const exitHref = `/${params.locale}/student/practice?tab=topics`

  return (
    <TestInterface
      submissionId=""
      instanceId={tag.id}
      assignmentTitle={tag.name}
      questions={examQuestions}
      isTimed={false}
      timeLimitSeconds={null}
      deadline={new Date(Date.now() + 86_400_000).toISOString()}
      startedAt={new Date().toISOString()}
      studentName={profile?.full_name ?? ''}
      initialAnswers={{}}
      initialCurrentQuestionId={null}
      initialCurrentModule={null}
      practiceMode
      correctAnswers={correctAnswers}
      completeUrl="/api/student/practice/complete"
      exitHref={exitHref}
    />
  )
}
