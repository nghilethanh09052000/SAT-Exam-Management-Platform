import { getCachedUser } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { EmptyState } from '@/components/ui/empty-state'
import { ResultsClient } from '../../test/[instanceId]/results/results-client'

export const dynamic = 'force-dynamic'

// Stored per-question answer snapshot (practice_category_results.answers /
// self_test_results.answers JSONB).
type StoredAnswer = {
  questionId: string
  selectedOptionId?: string | null
  answerText?: string | null
  isCorrect: boolean
}

type ResultRow = {
  id: string
  raw_score: number
  total_questions: number
  time_spent_seconds: number
  submitted_at: string
  answers: StoredAnswer[]
}

type OptionRow = { id: string; label: string; content: string; is_correct: boolean; order: number }
type QuestionRow = {
  id: string
  type: string
  content: string
  teacher_explanation: string | null
  ai_explanation: string | null
  question_options: OptionRow[]
  question_accepted_answers: { answer_text: string }[]
}

export default async function PracticeResultPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { kind?: string; ref?: string; difficulty?: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.results')
  const tp = await getTranslations('student.practice')
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const kind = searchParams.kind === 'test' ? 'test' : 'category'
  const ref = searchParams.ref ?? ''
  const difficulty = searchParams.difficulty ?? 'all'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = serviceClient() as any

  const backHref = '/student/practice?tab=topics'

  if (!ref) {
    return <ResultEmpty backHref={backHref} backLabel={tp('backToTopics')} title={tp('drillEmptyTitle')} desc={tp('drillEmptyDesc')} />
  }

  // ── Load the single result row + a friendly title in parallel ──────────────
  let row: ResultRow | null = null
  let title = ''
  let retryHref = backHref

  if (kind === 'category') {
    const [{ data: result }, { data: tag }] = await Promise.all([
      sb
        .from('practice_category_results')
        .select('id, raw_score, total_questions, time_spent_seconds, submitted_at, answers')
        .eq('student_id', user.id)
        .eq('tag_id', ref)
        .eq('difficulty', difficulty)
        .maybeSingle() as Promise<{ data: ResultRow | null }>,
      sb.from('tags').select('name').eq('id', ref).maybeSingle() as Promise<{ data: { name: string } | null }>,
    ])
    row = result
    title = tag?.name ?? '—'
    retryHref = `/student/practice/topic/${ref}?difficulty=${difficulty}&n=12&offset=0&tab=topics`
  } else {
    const [{ data: result }, { data: paper }] = await Promise.all([
      sb
        .from('self_test_results')
        .select('id, raw_score, total_questions, time_spent_seconds, submitted_at, answers')
        .eq('student_id', user.id)
        .eq('exam_paper_id', ref)
        .maybeSingle() as Promise<{ data: ResultRow | null }>,
      sb.from('exam_papers').select('title').eq('id', ref).maybeSingle() as Promise<{ data: { title: string } | null }>,
    ])
    row = result
    title = paper?.title ?? '—'
  }

  if (!row) {
    return <ResultEmpty backHref={backHref} backLabel={tp('backToTopics')} title={tp('drillEmptyTitle')} desc={tp('drillEmptyDesc')} />
  }

  // ── Load the questions referenced by the stored answers (read-only review) ──
  const storedAnswers = Array.isArray(row.answers) ? row.answers : []
  const questionIds = storedAnswers.map((a) => a.questionId)

  const { data: questionData } = (await sb
    .from('questions')
    .select(
      'id, type, content, teacher_explanation, ai_explanation, question_options(id, label, content, is_correct, order), question_accepted_answers(answer_text)'
    )
    .in('id', questionIds.length > 0 ? questionIds : ['00000000-0000-0000-0000-000000000000'])) as {
    data: QuestionRow[] | null
  }
  const questionById = new Map((questionData ?? []).map((q) => [q.id, q]))

  // Preserve the order the questions were presented in (the stored answers array).
  const answers = storedAnswers.map((a, i) => {
    const q = questionById.get(a.questionId)
    return {
      index: i + 1,
      questionId: a.questionId,
      isCorrect: a.isCorrect,
      isMarkedForReview: false,
      timeSpent: null,
      selectedOptionId: a.selectedOptionId ?? null,
      answerText: a.answerText ?? null,
      question: q
        ? {
            content: q.content,
            type: q.type,
            options: [...q.question_options].sort((x, y) => x.order - y.order),
            acceptedAnswers: q.question_accepted_answers.map((aa) => aa.answer_text),
            teacherExplanation: q.teacher_explanation,
            aiExplanation: q.ai_explanation,
          }
        : null,
    }
  })

  return (
    <div className="space-y-6">
      <ResultsClient
        submission={{
          id: row.id,
          attemptNumber: 1,
          rawScore: row.raw_score,
          totalQuestions: row.total_questions,
          timeSpentSeconds: row.time_spent_seconds,
          submittedAt: row.submitted_at,
        }}
        assignmentTitle={title}
        instanceId={ref}
        homeHref={backHref}
        homeLabel={tp('backToTopics')}
        canReview
        retryAvailable
        testHref={retryHref}
        attemptsUsed={1}
        maxAttempts={1}
        showAttemptsChip={false}
        attempts={[]}
        answers={answers}
        skillBreakdown={[]}
      />
    </div>
  )
}

function ResultEmpty({
  backHref,
  backLabel,
  title,
  desc,
}: {
  backHref: string
  backLabel: string
  title: string
  desc: string
}) {
  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6d7cff] hover:text-[#4f7cff]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {backLabel}
      </Link>
      <EmptyState title={title} description={desc} />
    </div>
  )
}
