import { createServerClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ResultsClient } from './results-client'
import { canRevealReview } from '@/lib/utils/submission-rules'

interface PageProps {
  params: { instanceId: string }
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
  assignments: { title: string } | null
}

export default async function ResultsPage({ params }: PageProps) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get latest submitted submission
  const subResult = await supabase
    .from('submissions')
    .select('id, attempt_number, status, raw_score, total_questions, time_spent_seconds, submitted_at')
    .eq('instance_id', params.instanceId)
    .eq('student_id', user.id)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single()

  const submission = subResult.data as SubmissionRow | null
  if (!submission) {
    redirect(`/student/test/${params.instanceId}`)
  }

  // Get instance title and review settings
  const instanceResult = await supabase
    .from('assignment_instances')
    .select('id, assignment_id, deadline, show_results, assignments(title)')
    .eq('id', params.instanceId)
    .single()

  const instance = instanceResult.data as InstanceRow | null
  const assignmentTitle = instance?.assignments?.title ?? '—'
  const canReview = instance
    ? canRevealReview(instance.show_results, instance.deadline)
    : false

  const answersResult = canReview
    ? await supabase
        .from('submission_answers')
        .select(
          'id, question_id, selected_option_id, answer_text, is_correct, is_marked_for_review, time_spent_seconds, questions(id, type, content, teacher_explanation, ai_explanation, question_options(id, label, content, is_correct, order), question_accepted_answers(answer_text))'
        )
        .eq('submission_id', submission.id)
    : { data: [] as AnswerRow[] }

  const answers: AnswerRow[] = (answersResult.data as AnswerRow[] | null) ?? []
  const assignmentQuestionOrderResult = instance
    ? await supabase
        .from('assignment_questions')
        .select('question_id, order')
        .eq('assignment_id', instance.assignment_id)
    : { data: [] as { question_id: string; order: number }[] }
  const assignmentQuestionOrder = new Map(
    ((assignmentQuestionOrderResult.data as { question_id: string; order: number }[] | null) ?? [])
      .map((question) => [question.question_id, question.order])
  )
  const orderedAnswers = [...answers].sort(
    (a, b) =>
      (assignmentQuestionOrder.get(a.question_id) ?? Number.MAX_SAFE_INTEGER) -
      (assignmentQuestionOrder.get(b.question_id) ?? Number.MAX_SAFE_INTEGER)
  )

  const tagRowsResult = canReview && orderedAnswers.length > 0
    ? await supabase
        .from('question_tags')
        .select('question_id, tags(name)')
        .in('question_id', orderedAnswers.map((answer) => answer.question_id))
    : { data: [] as TagJoinRow[] }
  const tagRows: TagJoinRow[] = (tagRowsResult.data as TagJoinRow[] | null) ?? []
  const tagsByQuestion = new Map<string, string[]>()
  for (const row of tagRows) {
    const existing = tagsByQuestion.get(row.question_id) ?? []
    if (row.tags?.name) existing.push(row.tags.name)
    tagsByQuestion.set(row.question_id, existing)
  }

  const attemptsResult = await supabase
    .from('submissions')
    .select('id, attempt_number, status, raw_score, total_questions, time_spent_seconds, submitted_at')
    .eq('instance_id', params.instanceId)
    .eq('student_id', user.id)
    .order('attempt_number', { ascending: true })

  const attempts: SubmissionRow[] = (attemptsResult.data as SubmissionRow[] | null) ?? []

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
