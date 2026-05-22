import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ResultsClient } from '../../../../(student)/student/test/[instanceId]/results/results-client'

type AttemptRow = {
  id: string
  attempt_number: number
  status: string
  raw_score: number | null
  total_questions: number | null
  time_spent_seconds: number | null
  submitted_at: string | null
}

type AnswerRow = {
  id: string
  question_id: string
  selected_option_id: string | null
  answer_text: string | null
  is_correct: boolean | null
  is_marked_for_review: boolean
  time_spent_seconds: number | null
  questions: {
    id: string
    type: string
    content: string
    teacher_explanation: string | null
    ai_explanation: string | null
    question_options: { id: string; label: string; content: string; is_correct: boolean; order: number }[]
    question_accepted_answers: { answer_text: string }[]
  } | null
}

type TagJoinRow = {
  question_id: string
  tags: { name: string } | null
}

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export default async function FreeTestResultsPage({
  params,
}: {
  params: { locale: string; paperId: string }
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${params.locale}/free-test`)

  const raw = serviceRole()
  const { data: paper } = await raw
    .from('exam_papers')
    .select('id, title')
    .eq('id', params.paperId)
    .eq('is_public', true)
    .is('archived_at', null)
    .single()

  if (!paper) redirect(`/${params.locale}/free-test`)

  const { data: latest } = await raw
    .from('public_exam_attempts')
    .select('id, attempt_number, status, raw_score, total_questions, time_spent_seconds, submitted_at')
    .eq('exam_paper_id', params.paperId)
    .eq('student_id', user.id)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const submission = latest as AttemptRow | null
  if (!submission) redirect(`/${params.locale}/free-test/test/${params.paperId}`)

  const { data: answersData } = await raw
    .from('public_exam_answers')
    .select('id, question_id, selected_option_id, answer_text, is_correct, is_marked_for_review, time_spent_seconds, questions(id, type, content, teacher_explanation, ai_explanation, question_options(id, label, content, is_correct, order), question_accepted_answers(answer_text))')
    .eq('attempt_id', submission.id)

  const answers = (answersData as AnswerRow[] | null) ?? []
  const { data: orderData } = await raw
    .from('exam_paper_questions')
    .select('question_id, order_index')
    .eq('exam_paper_id', params.paperId)

  const orderMap = new Map(
    ((orderData as { question_id: string; order_index: number }[] | null) ?? [])
      .map((row) => [row.question_id, row.order_index])
  )

  const orderedAnswers = [...answers].sort(
    (a, b) => (orderMap.get(a.question_id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.question_id) ?? Number.MAX_SAFE_INTEGER)
  )

  const { data: tagRowsData } = orderedAnswers.length > 0
    ? await raw
        .from('question_tags')
        .select('question_id, tags(name)')
        .in('question_id', orderedAnswers.map((answer) => answer.question_id))
    : { data: [] as TagJoinRow[] }

  const tagsByQuestion = new Map<string, string[]>()
  for (const row of ((tagRowsData as TagJoinRow[] | null) ?? [])) {
    const existing = tagsByQuestion.get(row.question_id) ?? []
    if (row.tags?.name) existing.push(row.tags.name)
    tagsByQuestion.set(row.question_id, existing)
  }

  const { data: attemptsData } = await raw
    .from('public_exam_attempts')
    .select('id, attempt_number, status, raw_score, total_questions, time_spent_seconds, submitted_at')
    .eq('exam_paper_id', params.paperId)
    .eq('student_id', user.id)
    .order('attempt_number', { ascending: true })

  const attempts = (attemptsData as AttemptRow[] | null) ?? []
  const hasInProgressAttempt = attempts.some((attempt) => attempt.status === 'in_progress')

  return (
    <main className="min-h-screen bg-[#f5f7ff] px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <ResultsClient
          submission={{
            id: submission.id,
            attemptNumber: submission.attempt_number,
            rawScore: submission.raw_score ?? 0,
            totalQuestions: submission.total_questions ?? 0,
            timeSpentSeconds: submission.time_spent_seconds ?? 0,
            submittedAt: submission.submitted_at ?? '',
          }}
          assignmentTitle={(paper as { title: string }).title}
          instanceId={params.paperId}
          canReview
          retryAvailable={hasInProgressAttempt || true}
          attemptsUsed={attempts.length}
          maxAttempts={999}
          attempts={attempts.map((attempt) => ({
            id: attempt.id,
            attemptNumber: attempt.attempt_number,
            status: attempt.status,
            rawScore: attempt.raw_score,
            totalQuestions: attempt.total_questions,
            timeSpentSeconds: attempt.time_spent_seconds,
            submittedAt: attempt.submitted_at,
          }))}
          testHref={`/free-test/test/${params.paperId}`}
          homeHref="/free-test"
          answers={orderedAnswers.map((answer, index) => {
            const question = answer.questions
            return {
              index: index + 1,
              questionId: answer.question_id,
              isCorrect: answer.is_correct,
              isMarkedForReview: answer.is_marked_for_review,
              timeSpent: answer.time_spent_seconds,
              selectedOptionId: answer.selected_option_id,
              answerText: answer.answer_text,
              question: question
                ? {
                    content: question.content,
                    type: question.type,
                    options: [...question.question_options].sort((a, b) => a.order - b.order),
                    acceptedAnswers: question.question_accepted_answers.map((row) => row.answer_text),
                    teacherExplanation: question.teacher_explanation,
                    aiExplanation: question.ai_explanation,
                  }
                : null,
            }
          })}
          skillBreakdown={Array.from(
            orderedAnswers.reduce((map, answer) => {
              for (const tag of tagsByQuestion.get(answer.question_id) ?? []) {
                const current = map.get(tag) ?? { correct: 0, total: 0 }
                current.total += 1
                if (answer.is_correct === true) current.correct += 1
                map.set(tag, current)
              }
              return map
            }, new Map<string, { correct: number; total: number }>())
          ).map(([name, stats]) => ({ name, ...stats }))}
        />
      </div>
    </main>
  )
}
