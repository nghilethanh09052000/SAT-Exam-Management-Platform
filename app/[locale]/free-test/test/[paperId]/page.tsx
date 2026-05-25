import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { TestInterface } from '../../../(student)/student/test/[instanceId]/test-interface'

type QuestionOption = {
  id: string
  label: string
  content: string
  order: number
}

type PaperQuestion = {
  id: string
  question_id: string
  order_index: number
  module_name: string | null
  questions: {
    id: string
    type: string
    content: string
    question_options: QuestionOption[]
  } | null
}

type AttemptRow = {
  id: string
  status: string
  started_at: string
  current_question_id: string | null
  current_module: string | null
}

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

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export default async function FreeTestTakePage({
  params,
}: {
  params: { locale: string; paperId: string }
}) {
  const { locale, paperId } = await params as { locale: string; paperId: string }
  setRequestLocale(locale)
  const t = await getTranslations('freeTest')
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/free-test`)

  const raw = serviceRole()

  // ── Round 1 (parallel): paper metadata + existing in-progress attempt ─────
  // These are independent — run together to cut one full round-trip.
  const [paperResult, existingResult] = await Promise.all([
    raw
      .from('exam_papers')
      .select('id, title')
      .eq('id', paperId)
      .eq('is_public', true)
      .is('archived_at', null)
      .single(),
    raw
      .from('public_exam_attempts')
      .select('id, status, started_at, current_question_id, current_module')
      .eq('exam_paper_id', paperId)
      .eq('student_id', user.id)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const paper = paperResult.data
  if (!paper) notFound()

  // ── Round 2: resolve or create attempt ────────────────────────────────────
  let attempt = existingResult.data as AttemptRow | null
  if (!attempt) {
    // count + insert must stay sequential (insert needs the count value)
    const { count } = await raw
      .from('public_exam_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('exam_paper_id', paperId)
      .eq('student_id', user.id)

    const { data: created, error } = await raw
      .from('public_exam_attempts')
      .insert({
        exam_paper_id: paperId,
        student_id: user.id,
        attempt_number: (count ?? 0) + 1,
      })
      .select('id, status, started_at, current_question_id, current_module')
      .single()

    if (error || !created) notFound()
    attempt = created as AttemptRow
  }

  // ── Round 3 (parallel): questions + existing answers ─────────────────────
  // Both need attempt.id which is now known — run together.
  const [questionResult, answersResult] = await Promise.all([
    raw
      .from('exam_paper_questions')
      .select('id, question_id, order_index, module_name, questions(id, type, content, question_options(id, label, content, order))')
      .eq('exam_paper_id', paperId)
      .order('module_name', { ascending: true })
      .order('order_index', { ascending: true }),
    raw
      .from('public_exam_answers')
      .select('question_id, selected_option_id, answer_text, is_marked_for_review, highlight_data, note_text, strikethrough_data, time_spent_seconds')
      .eq('attempt_id', attempt.id),
  ])

  const paperQuestions = (questionResult.data as PaperQuestion[] | null) ?? []
  const questions = paperQuestions
    .filter((row) => row.questions)
    .map((row) => ({
      assignmentQuestionId: row.id,
      questionId: row.questions!.id,
      type: row.questions!.type,
      content: row.questions!.content,
      module: row.module_name ?? t('defaultModule'),
      options: [...(row.questions!.question_options ?? [])].sort((a, b) => a.order - b.order),
    }))

  if (questions.length === 0) notFound()

  const answersData = answersResult.data

  const initialAnswers: Record<string, {
    selectedOptionId: string | null
    answerText: string | null
    isMarkedForReview: boolean
    highlights: { text: string }[]
    noteText: string
    strikethroughOptionIds: string[]
    timeSpentSeconds: number
  }> = {}

  for (const answer of ((answersData as AnswerRow[] | null) ?? [])) {
    initialAnswers[answer.question_id] = {
      selectedOptionId: answer.selected_option_id,
      answerText: answer.answer_text,
      isMarkedForReview: answer.is_marked_for_review,
      highlights: answer.highlight_data ?? [],
      noteText: answer.note_text ?? '',
      strikethroughOptionIds: answer.strikethrough_data ?? [],
      timeSpentSeconds: answer.time_spent_seconds ?? 0,
    }
  }

  return (
    <TestInterface
      submissionId={attempt.id}
      instanceId={paperId}
      assignmentTitle={(paper as { title: string }).title}
      questions={questions}
      isTimed={false}
      timeLimitSeconds={null}
      deadline={new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString()}
      startedAt={attempt.started_at}
      studentName={user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? ''}
      initialAnswers={initialAnswers}
      initialCurrentQuestionId={attempt.current_question_id}
      initialCurrentModule={attempt.current_module}
      progressEndpoint={`/api/free-test/attempts/${attempt.id}`}
      answerEndpoint="/api/free-test/answers"
      submitEndpoint={`/api/free-test/attempts/${attempt.id}/submit`}
      exitHref={`/${locale}/free-test`}
      resultsHref={`/${locale}/free-test/test/${paperId}/results`}
    />
  )
}
