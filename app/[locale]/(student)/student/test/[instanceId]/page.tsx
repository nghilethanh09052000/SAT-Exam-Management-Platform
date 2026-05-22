import { createServerClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { TestInterface } from './test-interface'
import Link from 'next/link'

interface PageProps {
  params: { instanceId: string }
}

interface QuestionOption {
  id: string
  label: string
  content: string
  order: number
}

interface QuestionData {
  id: string
  type: string
  content: string
  question_options: QuestionOption[]
}

interface AssignmentQuestion {
  id: string
  question_id: string
  order: number
  module: string
  questions: QuestionData
}

interface AssignmentData {
  title: string
  assignment_questions: AssignmentQuestion[]
}

interface InstanceData {
  id: string
  deadline: string
  is_timed: boolean
  time_limit_seconds: number | null
  shuffle_questions: boolean
  shuffle_options: boolean
  max_retakes: number
  assignment_id: string
  assignments: AssignmentData | null
}

function TestUnavailable({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md rounded-card bg-surface-card p-6 text-center space-y-4">
        <div>
          <h1 className="text-xl font-display font-bold text-ink">{title}</h1>
          <p className="mt-2 text-sm text-mute-light">{description}</p>
        </div>
        <Link
          href="/student"
          className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-white hover:bg-primary-pressed"
        >
          Về trang chủ
        </Link>
      </div>
    </div>
  )
}

export default async function TestPage({ params }: PageProps) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get instance
  const instanceResult = await supabase
    .from('assignment_instances')
    .select(
      'id, deadline, is_timed, time_limit_seconds, shuffle_questions, shuffle_options, max_retakes, assignment_id, assignments(title, assignment_questions(id, question_id, order, module, questions(id, type, content, question_options(id, label, content, order))))'
    )
    .eq('id', params.instanceId)
    .not('published_at', 'is', null)
    .single()

  const instance = instanceResult.data as InstanceData | null
  if (!instance) notFound()

  // Check if deadline passed
  const now = new Date().toISOString()
  if (instance.deadline < now) {
    return (
      <TestUnavailable
        title="Bài thi đã hết hạn"
        description="Hạn nộp bài đã qua. Vui lòng liên hệ giáo viên nếu bạn cần được gia hạn."
      />
    )
  }

  // Get or create submission
  type SubRow = {
    id: string
    status: string
    started_at: string
    current_question_id: string | null
    current_module: string | null
  }
  let submission: SubRow | null = null

  const existingResult = await supabase
    .from('submissions')
    .select('id, status, started_at, current_question_id, current_module')
    .eq('instance_id', params.instanceId)
    .eq('student_id', user.id)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  const existingData = existingResult.data as SubRow | null
  if (existingData) {
    submission = existingData
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newSubResult = await (supabase as any)
      .rpc('create_submission_attempt', { p_instance_id: params.instanceId })
      .single()

    if (newSubResult.error?.message.includes('Retake limit')) {
      redirect(`/student/test/${params.instanceId}/results`)
    }
    if (newSubResult.error?.message.includes('deadline')) {
      return (
        <TestUnavailable
          title="Bài thi đã hết hạn"
          description="Hạn nộp bài đã qua. Vui lòng liên hệ giáo viên nếu bạn cần được gia hạn."
        />
      )
    }
    if (newSubResult.error?.message.includes('not found')) {
      notFound()
    }
    if (newSubResult.error) {
      console.error('[student/test] Failed to create submission attempt:', newSubResult.error.message)
      return (
        <TestUnavailable
          title="Chưa thể bắt đầu bài thi"
          description="Hệ thống chưa tạo được lượt làm bài. Vui lòng thử lại sau hoặc báo giáo viên/admin kiểm tra cấu hình bài thi."
        />
      )
    }
    submission = newSubResult.data as SubRow | null
  }

  if (!submission) notFound()

  // Get existing answers
  type AnswerRow = {
    question_id: string
    selected_option_id: string | null
    answer_text: string | null
    is_marked_for_review: boolean
    highlight_data: { text: string }[] | null
    note_text: string | null
    strikethrough_data: string[] | null
    time_spent_seconds: number | null
  }
  const answersResult = await supabase
    .from('submission_answers')
    .select('question_id, selected_option_id, answer_text, is_marked_for_review, highlight_data, note_text, strikethrough_data, time_spent_seconds')
    .eq('submission_id', submission.id)

  const existingAnswers: AnswerRow[] = (answersResult.data as AnswerRow[] | null) ?? []

  // Get student name
  const profileResult = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()
  const profile = profileResult.data as { full_name: string } | null

  const assignmentData = instance.assignments
  if (!assignmentData) notFound()

  const allQuestions = [...(assignmentData.assignment_questions ?? [])].sort(
    (a, b) => a.order - b.order
  )

  const questions = allQuestions.map((aq) => ({
    assignmentQuestionId: aq.id,
    questionId: aq.questions.id,
    type: aq.questions.type,
    content: aq.questions.content,
    module: aq.module,
    options: [...(aq.questions.question_options ?? [])].sort(
      (a, b) => a.order - b.order
    ),
  }))

  // Build initial answers map
  const initialAnswers: Record<
    string,
    {
      selectedOptionId: string | null
      answerText: string | null
      isMarkedForReview: boolean
      highlights: { text: string }[]
      noteText: string
      strikethroughOptionIds: string[]
      timeSpentSeconds: number
    }
  > = {}
  for (const a of existingAnswers) {
    initialAnswers[a.question_id] = {
      selectedOptionId: a.selected_option_id,
      answerText: a.answer_text,
      isMarkedForReview: a.is_marked_for_review,
      highlights: a.highlight_data ?? [],
      noteText: a.note_text ?? '',
      strikethroughOptionIds: a.strikethrough_data ?? [],
      timeSpentSeconds: a.time_spent_seconds ?? 0,
    }
  }

  return (
    <TestInterface
      submissionId={submission.id}
      instanceId={params.instanceId}
      assignmentTitle={assignmentData.title}
      questions={questions}
      isTimed={instance.is_timed}
      timeLimitSeconds={instance.time_limit_seconds}
      deadline={instance.deadline}
      startedAt={submission.started_at}
      studentName={profile?.full_name ?? ''}
      initialAnswers={initialAnswers}
      initialCurrentQuestionId={submission.current_question_id}
      initialCurrentModule={submission.current_module}
    />
  )
}
