import { getCachedProfile, getCachedUser } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { canCreateAttempt } from '@/lib/utils/submission-rules'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { TestInterface } from '../../../test/[instanceId]/test-interface'
import { compareSatModules } from '@/lib/sat-test'

type QuestionOption = { id: string; label: string; content: string; order: number }
type AssignmentRow = {
  id: string
  practice_test_id: string
  class_id: string
  deadline: string
  is_timed: boolean
  time_limit_seconds: number | null
  max_retakes: number
  exam_papers: { title: string } | null
}
type AttemptRow = {
  id: string
  status: string
  started_at: string
  current_question_id: string | null
  current_module: string | null
}
type PaperQuestionRow = {
  id: string
  question_id: string
  order_index: number
  module_name: string | null
  questions: {
    id: string
    type: string
    subject: string | null
    content: string
    stimulus: string | null
    prompt: string | null
    question_options: QuestionOption[]
  } | null
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

export default async function AssignedPracticeTestPage({
  params,
  searchParams,
}: {
  params: { locale: string; assignmentId: string }
  searchParams: { tab?: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.test')
  const user = await getCachedUser()
  if (!user) redirect(`/${params.locale}/login`)
  const fromPracticeTestTab = searchParams.tab === 'test'
  const testTabQuery = fromPracticeTestTab ? '?tab=test' : ''
  const exitHref = fromPracticeTestTab
    ? `/${params.locale}/student/practice?tab=test`
    : `/${params.locale}/student/coursework?tab=mock`

  const db = serviceClient()
  const { data: assignmentData } = await db
    .from('practice_test_assignments')
    .select('id, practice_test_id, class_id, deadline, is_timed, time_limit_seconds, max_retakes, exam_papers(title)')
    .eq('id', params.assignmentId)
    .not('published_at', 'is', null)
    .maybeSingle()

  const assignment = assignmentData as AssignmentRow | null
  if (!assignment) notFound()

  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('student_id', user.id)
    .eq('class_id', assignment.class_id)
    .maybeSingle()

  if (!enrollment) notFound()
  if (new Date(assignment.deadline).getTime() <= Date.now()) {
    redirect(exitHref)
  }

  const { data: existing } = await db
    .from('practice_test_attempts')
    .select('id, status, started_at, current_question_id, current_module')
    .eq('practice_test_assignment_id', params.assignmentId)
    .eq('student_id', user.id)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let attempt = existing as AttemptRow | null
  if (!attempt) {
    const { data: existingAttempts } = await db
      .from('practice_test_attempts')
      .select('id, status')
      .eq('practice_test_assignment_id', params.assignmentId)
      .eq('student_id', user.id)

    const usedAttempts = ((existingAttempts ?? []) as { status: string }[])
      .filter((row) => row.status === 'submitted' || row.status === 'grading')
      .length

    if (!canCreateAttempt(usedAttempts, assignment.max_retakes)) {
      redirect(`/${params.locale}/student/practice-tests/assigned/${params.assignmentId}/results${testTabQuery}`)
    }

    const { data: created, error } = await db
      .from('practice_test_attempts')
      .insert({
        practice_test_assignment_id: params.assignmentId,
        student_id: user.id,
        attempt_number: usedAttempts + 1,
      } as never)
      .select('id, status, started_at, current_question_id, current_module')
      .single()

    if (error || !created) notFound()
    attempt = created as AttemptRow
  }

  const [questionsResult, answersResult, profile] = await Promise.all([
    db
      .from('exam_paper_questions')
      .select('id, question_id, order_index, module_name, questions(id, type, subject, content, stimulus, prompt, question_options(id, label, content, order))')
      .eq('exam_paper_id', assignment.practice_test_id)
      .order('module_name', { ascending: true })
      .order('order_index', { ascending: true }),
    db
      .from('practice_test_answers')
      .select('question_id, selected_option_id, answer_text, is_marked_for_review, highlight_data, note_text, strikethrough_data, time_spent_seconds')
      .eq('attempt_id', attempt.id),
    getCachedProfile(),
  ])

  const paperQuestions = (questionsResult.data as PaperQuestionRow[] | null) ?? []
  const questions = paperQuestions
    .filter((row) => row.questions)
    .sort((a, b) => compareSatModules(a.module_name, b.module_name) || a.order_index - b.order_index)
    .map((row) => ({
      assignmentQuestionId: row.id,
      questionId: row.questions!.id,
      type: row.questions!.type,
      subject: row.questions!.subject ?? null,
      content: row.questions!.content,
      stimulus: row.questions!.stimulus ?? null,
      prompt: row.questions!.prompt ?? null,
      module: row.module_name ?? t('defaultModule'),
      options: [...(row.questions!.question_options ?? [])].sort((a, b) => a.order - b.order),
    }))

  if (questions.length === 0) notFound()

  const initialAnswers: Record<string, {
    selectedOptionId: string | null
    answerText: string | null
    isMarkedForReview: boolean
    highlights: { text: string }[]
    noteText: string
    strikethroughOptionIds: string[]
    timeSpentSeconds: number
  }> = {}

  for (const answer of ((answersResult.data as AnswerRow[] | null) ?? [])) {
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
      instanceId={params.assignmentId}
      assignmentTitle={assignment.exam_papers?.title ?? 'Practice Test'}
      questions={questions}
      isTimed={assignment.is_timed}
      timeLimitSeconds={assignment.time_limit_seconds}
      deadline={assignment.deadline}
      startedAt={attempt.started_at}
      studentName={profile?.full_name ?? ''}
      initialAnswers={initialAnswers}
      initialCurrentQuestionId={attempt.current_question_id}
      initialCurrentModule={attempt.current_module}
      progressEndpoint={`/api/practice-test-attempts/${attempt.id}`}
      answerEndpoint={`/api/practice-test-attempts/${attempt.id}/answers`}
      submitEndpoint={`/api/practice-test-attempts/${attempt.id}/submit`}
      exitHref={exitHref}
      resultsHref={`/${params.locale}/student/practice-tests/assigned/${params.assignmentId}/results${testTabQuery}`}
    />
  )
}
