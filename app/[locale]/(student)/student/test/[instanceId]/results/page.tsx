import { getCachedUser, createServerClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ResultsClient } from './results-client'
import { GradingScreen } from './grading-screen'
import { canCreateAttempt, canRevealReview, getMaxAttempts } from '@/lib/utils/submission-rules'

interface PageProps {
  params: { locale: string; instanceId: string }
}

interface SubmissionRow {
  id: string
  attempt_number: number
  status: string
  raw_score: number | null
  total_questions: number | null
  time_spent_seconds: number | null
  submitted_at: string | null
}

interface OptionRow {
  id: string
  label: string
  content: string
  is_correct: boolean
  order: number
}

interface QuestionRow {
  id: string
  type: string
  content: string
  teacher_explanation: string | null
  ai_explanation: string | null
  question_options: OptionRow[]
  question_accepted_answers: { answer_text: string }[]
}

interface AnswerRow {
  id: string
  question_id: string
  selected_option_id: string | null
  answer_text: string | null
  is_correct: boolean | null
  is_marked_for_review: boolean
  time_spent_seconds: number | null
  questions: QuestionRow | null
}

interface TagJoinRow {
  question_id: string
  tags: { name: string } | null
}

interface InstanceRow {
  id: string
  assignment_id: string
  deadline: string
  show_results: 'immediately' | 'after_deadline'
  max_retakes: number
  assignments: { title: string } | null
}

export default async function ResultsPage({ params }: PageProps) {
  const user = await getCachedUser()
  if (!user) redirect(`/${params.locale}/login`)
  const supabase = createServerClient()

  // ── Round 1 (parallel): submission + instance metadata + all attempts ──────
  // Include 'grading' so we can show a loading screen instead of looping:
  //   results → redirect test → redirect results (infinite loop)
  const [subResult, instanceResult, attemptsResult] = await Promise.all([
    supabase
      .from('submissions')
      .select('id, attempt_number, status, raw_score, total_questions, time_spent_seconds, submitted_at')
      .eq('instance_id', params.instanceId)
      .eq('student_id', user!.id)
      .in('status', ['submitted', 'grading'])
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('assignment_instances')
      .select('id, assignment_id, deadline, show_results, max_retakes, assignments(title)')
      .eq('id', params.instanceId)
      .single(),
    supabase
      .from('submissions')
      .select('id, attempt_number, status, raw_score, total_questions, time_spent_seconds, submitted_at')
      .eq('instance_id', params.instanceId)
      .eq('student_id', user!.id)
      .order('attempt_number', { ascending: true }),
  ])

  const submission = subResult.data as SubmissionRow | null
  if (!submission) {
    redirect(`/${params.locale}/student/test/${params.instanceId}`)
  }

  // Still being graded — show a polling loading screen instead of crashing
  // or creating a redirect loop back to the test page.
  if (submission!.status === 'grading') {
    return <GradingScreen submissionId={submission!.id} instanceId={params.instanceId} />
  }

  const instance = instanceResult.data as InstanceRow | null
  const assignmentTitle = instance?.assignments?.title ?? '—'
  const canReview = instance
    ? canRevealReview(instance.show_results, instance.deadline)
    : false

  // ── Round 2 (parallel): answers + question order (both depend on round 1) ──
  const [answersResult, assignmentQuestionOrderResult] = await Promise.all([
    canReview
      ? supabase
          .from('submission_answers')
          .select(
            'id, question_id, selected_option_id, answer_text, is_correct, is_marked_for_review, time_spent_seconds, questions(id, type, content, teacher_explanation, ai_explanation, question_options(id, label, content, is_correct, order), question_accepted_answers(answer_text))'
          )
          .eq('submission_id', submission!.id)
      : Promise.resolve({ data: [] as AnswerRow[] }),
    instance
      ? supabase
          .from('assignment_questions')
          .select('question_id, order')
          .eq('assignment_id', instance.assignment_id)
      : Promise.resolve({ data: [] as { question_id: string; order: number }[] }),
  ])

  const answers: AnswerRow[] = (answersResult.data as AnswerRow[] | null) ?? []
  const assignmentQuestionOrder = new Map(
    ((assignmentQuestionOrderResult.data as { question_id: string; order: number }[] | null) ?? [])
      .map((q) => [q.question_id, q.order])
  )
  const orderedAnswers = [...answers].sort(
    (a, b) =>
      (assignmentQuestionOrder.get(a.question_id) ?? Number.MAX_SAFE_INTEGER) -
      (assignmentQuestionOrder.get(b.question_id) ?? Number.MAX_SAFE_INTEGER)
  )

  // ── Round 3: question tags (depends on ordered answers) ───────────────────
  const tagRowsResult = canReview && orderedAnswers.length > 0
    ? await supabase
        .from('question_tags')
        .select('question_id, tags(name)')
        .in('question_id', orderedAnswers.map((a) => a.question_id))
    : { data: [] as TagJoinRow[] }
  const tagRows: TagJoinRow[] = (tagRowsResult.data as TagJoinRow[] | null) ?? []
  const tagsByQuestion = new Map<string, string[]>()
  for (const row of tagRows) {
    const existing = tagsByQuestion.get(row.question_id) ?? []
    if (row.tags?.name) existing.push(row.tags.name)
    tagsByQuestion.set(row.question_id, existing)
  }

  const attempts: SubmissionRow[] = (attemptsResult.data as SubmissionRow[] | null) ?? []
  const hasInProgressAttempt = attempts.some((a) => a.status === 'in_progress')
  const deadlineHasPassed = instance ? new Date(instance.deadline).getTime() <= Date.now() : true
  const retryAvailable = Boolean(
    instance &&
    !deadlineHasPassed &&
    (hasInProgressAttempt || canCreateAttempt(attempts.length, instance.max_retakes))
  )

  return (
    <ResultsClient
      submission={{
        id: submission.id,
        attemptNumber: submission.attempt_number,
        rawScore: submission.raw_score ?? 0,
        totalQuestions: submission.total_questions ?? 0,
        timeSpentSeconds: submission.time_spent_seconds ?? 0,
        submittedAt: submission.submitted_at ?? '',
      }}
      assignmentTitle={assignmentTitle}
      instanceId={params.instanceId}
      canReview={canReview}
      retryAvailable={retryAvailable}
      attemptsUsed={attempts.length}
      maxAttempts={instance ? getMaxAttempts(instance.max_retakes) : attempts.length}
      attempts={attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attempt_number,
        status: attempt.status,
        rawScore: attempt.raw_score,
        totalQuestions: attempt.total_questions,
        timeSpentSeconds: attempt.time_spent_seconds,
        submittedAt: attempt.submitted_at,
      }))}
      answers={orderedAnswers.map((a, i) => {
        const q = a.questions

        return {
          index: i + 1,
          questionId: a.question_id,
          isCorrect: a.is_correct,
          isMarkedForReview: a.is_marked_for_review,
          timeSpent: a.time_spent_seconds,
          selectedOptionId: a.selected_option_id,
          answerText: a.answer_text,
          question: q
            ? {
                content: q.content,
                type: q.type,
                options: [...q.question_options].sort((a, b) => a.order - b.order),
                acceptedAnswers: q.question_accepted_answers.map((aa) => aa.answer_text),
                teacherExplanation: q.teacher_explanation,
                aiExplanation: q.ai_explanation,
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
      )
        .map(([name, stats]) => ({
          name,
          correct: stats.correct,
          total: stats.total,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))}
    />
  )
}
