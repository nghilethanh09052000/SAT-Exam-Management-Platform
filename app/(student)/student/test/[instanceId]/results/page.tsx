import { createServerClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ResultsClient } from './results-client'
import { canRevealReview } from '@/lib/utils/submission-rules'

interface PageProps {
  params: { instanceId: string }
}

interface SubmissionRow {
  id: string
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

interface InstanceRow {
  id: string
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
    .select('id, status, raw_score, total_questions, time_spent_seconds, submitted_at')
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
    .select('id, deadline, show_results, assignments(title)')
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
        .order('answered_at', { ascending: true })
    : { data: [] as AnswerRow[] }

  const answers: AnswerRow[] = (answersResult.data as AnswerRow[] | null) ?? []

  return (
    <ResultsClient
      submission={{
        id: submission.id,
        rawScore: submission.raw_score ?? 0,
        totalQuestions: submission.total_questions ?? 0,
        timeSpentSeconds: submission.time_spent_seconds ?? 0,
        submittedAt: submission.submitted_at ?? '',
      }}
      assignmentTitle={assignmentTitle}
      instanceId={params.instanceId}
      canReview={canReview}
      answers={answers.map((a, i) => {
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
                explanation: q.teacher_explanation ?? q.ai_explanation,
              }
            : null,
        }
      })}
    />
  )
}
