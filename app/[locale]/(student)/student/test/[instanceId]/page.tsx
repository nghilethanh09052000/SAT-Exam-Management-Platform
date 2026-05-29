import { getCachedUser, getCachedProfile, createServerClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { TestInterface } from './test-interface'
import { Link } from '@/i18n/navigation'

interface PageProps {
  params: { locale: string; instanceId: string }
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
  subject: string | null
  content: string
  stimulus: string | null
  prompt: string | null
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
  homeLabel,
}: {
  title: string
  description: string
  homeLabel: string
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
          {homeLabel}
        </Link>
      </div>
    </div>
  )
}

export default async function TestPage({ params }: PageProps) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.test')
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = createServerClient()

  // ── Round 1 (parallel): instance metadata + existing submission + profile ──
  // getCachedProfile() is independent of submission/instance — run it here so
  // it overlaps with the two DB queries instead of waiting until after round 2.
  type SubRow = {
    id: string
    status: string
    started_at: string
    current_question_id: string | null
    current_module: string | null
  }

  const [instanceResult, existingResult, profile] = await Promise.all([
    supabase
      .from('assignment_instances')
      .select(
        'id, deadline, is_timed, time_limit_seconds, shuffle_questions, shuffle_options, max_retakes, assignment_id, assignments(title)'
      )
      .eq('id', params.instanceId)
      .not('published_at', 'is', null)
      .single(),
    supabase
      .from('submissions')
      .select('id, status, started_at, current_question_id, current_module')
      .eq('instance_id', params.instanceId)
      .eq('student_id', user!.id)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .single(),
    getCachedProfile(),
  ])

  const instance = instanceResult.data as InstanceData | null
  if (!instance) notFound()

  // Check if deadline passed
  const now = new Date().toISOString()
  if (instance.deadline < now) {
    return (
      <TestUnavailable
        title={t('testExpired')}
        description={t('testExpiredDesc')}
        homeLabel={t('backHome')}
      />
    )
  }

  // Get or create submission
  let submission: SubRow | null = null

  const existingData = existingResult.data as SubRow | null
  if (existingData) {
    submission = existingData
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newSubResult = await (supabase as any)
      .rpc('create_submission_attempt', { p_instance_id: params.instanceId })
      .single()

    if (newSubResult.error?.message.includes('Retake limit')) {
      redirect(`/${params.locale}/student/test/${params.instanceId}/results`)
    }
    if (newSubResult.error?.message.includes('deadline')) {
      return (
        <TestUnavailable
          title={t('testExpired')}
          description={t('testExpiredDesc')}
          homeLabel={t('backHome')}
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
          title={t('cannotStart')}
          description={t('cannotStartDesc')}
          homeLabel={t('backHome')}
        />
      )
    }
    submission = newSubResult.data as SubRow | null
  }

  if (!submission) notFound()

  // ── Round 3 (parallel): questions+options + existing answers ─────────────
  // Both depend on submission.id (known after round 2) and assignment_id
  // (known from round 1). Run them together.
  type QuestionOptionRow = {
    id: string
    label: string
    content: string
    order: number
  }
  type QuestionDataRow = {
    id: string
    type: string
    subject: string | null
    content: string
    stimulus: string | null
    prompt: string | null
    question_options: QuestionOptionRow[]
  }
  type AssignmentQuestionRow = {
    id: string
    question_id: string
    order: number
    module: string
    questions: QuestionDataRow
  }

  const [questionsResult, answersResult2] = await Promise.all([
    supabase
      .from('assignment_questions')
      .select('id, question_id, order, module, questions(id, type, subject, content, stimulus, prompt, question_options(id, label, content, order))')
      .eq('assignment_id', instance.assignment_id)
      .order('order', { ascending: true }),
    supabase
      .from('submission_answers')
      .select('question_id, selected_option_id, answer_text, is_marked_for_review, highlight_data, note_text, strikethrough_data, time_spent_seconds')
      .eq('submission_id', submission!.id),
  ])

  const assignmentQuestions = (questionsResult.data as AssignmentQuestionRow[] | null) ?? []

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
  const existingAnswers: AnswerRow[] = (answersResult2.data as AnswerRow[] | null) ?? []

  const assignmentData = instance.assignments
  if (!assignmentData) notFound()

  const questions = assignmentQuestions.map((aq) => ({
    assignmentQuestionId: aq.id,
    questionId: aq.questions.id,
    type: aq.questions.type,
    subject: aq.questions.subject ?? null,
    content: aq.questions.content,
    stimulus: aq.questions.stimulus ?? null,
    prompt: aq.questions.prompt ?? null,
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
