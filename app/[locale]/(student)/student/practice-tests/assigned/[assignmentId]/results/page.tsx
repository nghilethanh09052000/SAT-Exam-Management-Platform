import { getCachedUser } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { canCreateAttempt, canRevealReview, getMaxAttempts } from '@/lib/utils/submission-rules'
import { redirect } from 'next/navigation'
import { ResultsClient } from '../../../../test/[instanceId]/results/results-client'

type AttemptRow = {
  id: string
  attempt_number: number
  status: string
  raw_score: number | null
  total_questions: number | null
  time_spent_seconds: number | null
  submitted_at: string | null
}
type AssignmentRow = {
  id: string
  practice_test_id: string
  class_id: string
  deadline: string
  show_results: 'immediately' | 'after_deadline'
  max_retakes: number
  exam_papers: { title: string } | null
}
type AnswerRow = {
  id: string
  attempt_id: string
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
    question_tags: { tags: { name: string } | null }[]
  } | null
}

function buildAttemptView(rows: AnswerRow[], orderMap: Map<string, number>) {
  const ordered = [...rows].sort(
    (a, b) => (orderMap.get(a.question_id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.question_id) ?? Number.MAX_SAFE_INTEGER)
  )

  const answers = ordered.map((answer, index) => {
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
  })

  const skillBreakdown = Array.from(
    ordered.reduce((map, answer) => {
      for (const tag of answer.questions?.question_tags?.map((row) => row.tags?.name).filter(Boolean) as string[] ?? []) {
        const current = map.get(tag) ?? { correct: 0, total: 0 }
        current.total += 1
        if (answer.is_correct === true) current.correct += 1
        map.set(tag, current)
      }
      return map
    }, new Map<string, { correct: number; total: number }>())
  ).map(([name, stats]) => ({ name, ...stats }))

  return { answers, skillBreakdown }
}

export default async function AssignedPracticeTestResultsPage({
  params,
}: {
  params: { locale: string; assignmentId: string }
}) {
  const user = await getCachedUser()
  if (!user) redirect(`/${params.locale}/login`)
  const db = serviceClient()

  const [assignmentResult, attemptsResult] = await Promise.all([
    db
      .from('practice_test_assignments')
      .select('id, practice_test_id, class_id, deadline, show_results, max_retakes, exam_papers(title)')
      .eq('id', params.assignmentId)
      .maybeSingle(),
    db
      .from('practice_test_attempts')
      .select('id, attempt_number, status, raw_score, total_questions, time_spent_seconds, submitted_at')
      .eq('practice_test_assignment_id', params.assignmentId)
      .eq('student_id', user.id)
      .order('attempt_number', { ascending: true }),
  ])

  const assignment = assignmentResult.data as AssignmentRow | null
  if (!assignment) redirect(`/${params.locale}/student/coursework?tab=mock`)

  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('student_id', user.id)
    .eq('class_id', assignment.class_id)
    .maybeSingle()
  if (!enrollment) redirect(`/${params.locale}/student/coursework?tab=mock`)

  const attempts = (attemptsResult.data as AttemptRow[] | null) ?? []
  const submission = [...attempts].reverse().find((attempt) => attempt.status === 'submitted') ?? null
  if (!submission) redirect(`/${params.locale}/student/practice-tests/assigned/${params.assignmentId}`)

  const canReview = canRevealReview(assignment.show_results, assignment.deadline)
  const submittedAttempts = attempts.filter((attempt) => attempt.status === 'submitted')
  const submittedIds = submittedAttempts.map((attempt) => attempt.id)

  const [answersResult, orderResult] = await Promise.all([
    canReview && submittedIds.length > 0
      ? db
          .from('practice_test_answers')
          .select('id, attempt_id, question_id, selected_option_id, answer_text, is_correct, is_marked_for_review, time_spent_seconds, questions(id, type, content, teacher_explanation, ai_explanation, question_options(id, label, content, is_correct, order), question_accepted_answers(answer_text), question_tags(tags(name)))')
          .in('attempt_id', submittedIds)
      : Promise.resolve({ data: [] as AnswerRow[] }),
    db
      .from('exam_paper_questions')
      .select('question_id, order_index')
      .eq('exam_paper_id', assignment.practice_test_id),
  ])

  const orderMap = new Map(
    ((orderResult.data as { question_id: string; order_index: number }[] | null) ?? [])
      .map((row) => [row.question_id, row.order_index])
  )
  const answersByAttempt = new Map<string, AnswerRow[]>()
  for (const answer of ((answersResult.data as AnswerRow[] | null) ?? [])) {
    const list = answersByAttempt.get(answer.attempt_id) ?? []
    list.push(answer)
    answersByAttempt.set(answer.attempt_id, list)
  }

  const attemptResults = [...submittedAttempts]
    .sort((a, b) => b.attempt_number - a.attempt_number)
    .map((attempt) => {
      const view = buildAttemptView(answersByAttempt.get(attempt.id) ?? [], orderMap)
      return {
        id: attempt.id,
        attemptNumber: attempt.attempt_number,
        rawScore: attempt.raw_score ?? 0,
        totalQuestions: attempt.total_questions ?? 0,
        timeSpentSeconds: attempt.time_spent_seconds ?? 0,
        submittedAt: attempt.submitted_at ?? '',
        answers: view.answers,
        skillBreakdown: view.skillBreakdown,
      }
    })

  const latestView = buildAttemptView(answersByAttempt.get(submission.id) ?? [], orderMap)
  const usedAttempts = attempts.filter((attempt) => attempt.status === 'submitted' || attempt.status === 'grading').length
  const hasInProgressAttempt = attempts.some((attempt) => attempt.status === 'in_progress')
  const deadlineHasPassed = new Date(assignment.deadline).getTime() <= Date.now()
  const retryAvailable = !deadlineHasPassed && (hasInProgressAttempt || canCreateAttempt(usedAttempts, assignment.max_retakes))

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
      assignmentTitle={assignment.exam_papers?.title ?? 'Practice Test'}
      instanceId={params.assignmentId}
      homeHref="/student/coursework?tab=mock"
      canReview={canReview}
      retryAvailable={retryAvailable}
      attemptsUsed={usedAttempts}
      maxAttempts={getMaxAttempts(assignment.max_retakes)}
      attempts={attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attempt_number,
        status: attempt.status,
        rawScore: attempt.raw_score,
        totalQuestions: attempt.total_questions,
        timeSpentSeconds: attempt.time_spent_seconds,
        submittedAt: attempt.submitted_at,
      }))}
      answers={latestView.answers}
      skillBreakdown={latestView.skillBreakdown}
      attemptResults={attemptResults}
      testHref={`/student/practice-tests/assigned/${params.assignmentId}`}
    />
  )
}
