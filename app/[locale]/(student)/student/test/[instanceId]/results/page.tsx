import { getCachedUser } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { ResultsClient } from './results-client'
import { GradingScreen } from './grading-screen'
import {
  canCreateAttempt,
  canSeeAnswers,
  canSeeScore,
  getMaxAttempts,
  type AnswerVisibilityPolicy,
  type ScoreVisibilityPolicy,
} from '@/lib/utils/submission-rules'

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
  question_tags: { tags: { name: string } | null }[]
}

interface AnswerRow {
  id: string
  submission_id: string
  question_id: string
  selected_option_id: string | null
  answer_text: string | null
  is_correct: boolean | null
  is_marked_for_review: boolean
  time_spent_seconds: number | null
  confidence: 'high' | 'medium' | 'low' | null
  questions: QuestionRow | null
}

interface InstanceRow {
  id: string
  assignment_id: string
  class_id: string
  deadline: string
  show_results: 'immediately' | 'after_deadline'
  score_visibility: ScoreVisibilityPolicy
  answer_visibility: AnswerVisibilityPolicy
  answer_visibility_threshold: number | null
  max_retakes: number
  assignments: { title: string } | null
}

// Shape one submission's raw answer rows into the ordered answers list +
// per-skill breakdown the client renders. Shared across every attempt so each
// can be displayed independently.
function buildAttemptView(
  rows: AnswerRow[],
  orderMap: Map<string, number>,
  errorLogMap?: Map<string, { id: string; note: string | null }>
) {
  const ordered = [...rows].sort(
    (a, b) =>
      (orderMap.get(a.question_id) ?? Number.MAX_SAFE_INTEGER) -
      (orderMap.get(b.question_id) ?? Number.MAX_SAFE_INTEGER)
  )

  const tagsByQuestion = new Map<string, string[]>()
  for (const answer of rows) {
    const tags = (answer.questions?.question_tags ?? [])
      .map((t) => t.tags?.name)
      .filter((n): n is string => Boolean(n))
    if (tags.length > 0) tagsByQuestion.set(answer.question_id, tags)
  }

  const answers = ordered.map((a, i) => {
    const q = a.questions
    const tags = tagsByQuestion.get(a.question_id) ?? []
    return {
      index: i + 1,
      questionId: a.question_id,
      isCorrect: a.is_correct,
      isMarkedForReview: a.is_marked_for_review,
      timeSpent: a.time_spent_seconds,
      selectedOptionId: a.selected_option_id,
      answerText: a.answer_text,
      confidence: a.confidence,
      skillTags: tags,
      errorLog: errorLogMap?.get(`${a.submission_id}:${a.question_id}`) ?? null,
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

  const skillBreakdown = Array.from(
    ordered.reduce((map, answer) => {
      for (const tag of tagsByQuestion.get(answer.question_id) ?? []) {
        const current = map.get(tag) ?? { correct: 0, total: 0 }
        current.total += 1
        if (answer.is_correct === true) current.correct += 1
        map.set(tag, current)
      }
      return map
    }, new Map<string, { correct: number; total: number }>())
  )
    .map(([name, stats]) => ({ name, correct: stats.correct, total: stats.total }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { answers, skillBreakdown }
}

export default async function ResultsPage({ params }: PageProps) {
  const user = await getCachedUser()
  if (!user) redirect(`/${params.locale}/login`)
  const t = await getTranslations('student.results')
  // Service client (RLS bypassed) — every read below is explicitly scoped to
  // this authenticated student (student_id = user.id, answers to the verified
  // submission). The anon-key path forced Postgres to re-evaluate a 3-table
  // enrollment EXISTS join per question/option/tag row, which made the deep
  // results join very slow for full-length papers.
  const supabase = serviceClient()

  // ── Round 1 (parallel): all attempts + instance metadata ─────────────────
  // Fetch all attempts in one query — the latest submitted/grading one is
  // derived from this array in JS, eliminating the separate subResult query.
  const [instanceResult, attemptsResult] = await Promise.all([
    supabase
      .from('assignment_instances')
      .select('id, assignment_id, class_id, deadline, show_results, score_visibility, answer_visibility, answer_visibility_threshold, max_retakes, assignments(title)')
      .eq('id', params.instanceId)
      .single(),
    supabase
      .from('submissions')
      .select('id, attempt_number, status, raw_score, total_questions, time_spent_seconds, submitted_at')
      .eq('instance_id', params.instanceId)
      .eq('student_id', user!.id)
      .order('attempt_number', { ascending: true }),
  ])

  const attempts: SubmissionRow[] = (attemptsResult.data as SubmissionRow[] | null) ?? []

  // Most recent submitted/grading attempt — equivalent to the old .limit(1)
  // query ordered by submitted_at desc, derived from the attempts array.
  const submission = [...attempts]
    .reverse()
    .find(a => a.status === 'submitted' || a.status === 'grading') ?? null

  if (!submission) {
    redirect(`/${params.locale}/student/test/${params.instanceId}`)
  }

  // Still grading — show polling screen instead of crashing or redirect loop.
  if (submission!.status === 'grading') {
    return <GradingScreen submissionId={submission!.id} instanceId={params.instanceId} />
  }

  const instance = instanceResult.data as InstanceRow | null
  const assignmentTitle = instance?.assignments?.title ?? '—'

  // "Whole class submitted" is only needed for the after_all_students policy.
  let allStudentsSubmitted = false
  if (
    instance &&
    (instance.score_visibility === 'after_all_students' ||
      instance.answer_visibility === 'after_all_students')
  ) {
    const [enrolledRes, submittedRes] = await Promise.all([
      supabase
        .from('enrollments')
        .select('student_id', { count: 'exact', head: true })
        .eq('class_id', instance.class_id),
      supabase
        .from('submissions')
        .select('student_id')
        .eq('instance_id', instance.id)
        .eq('status', 'submitted'),
    ])
    const submittedStudents = new Set(
      ((submittedRes.data as { student_id: string }[] | null) ?? []).map((s) => s.student_id)
    )
    allStudentsSubmitted = (enrolledRes.count ?? 0) > 0 && submittedStudents.size >= (enrolledRes.count ?? 0)
  }

  // Best submitted score as % — drives the after_score_threshold answer policy.
  const bestPct = attempts
    .filter((a) => a.status === 'submitted' && a.total_questions)
    .reduce<number | null>((best, a) => {
      const pct = ((a.raw_score ?? 0) / (a.total_questions ?? 1)) * 100
      return best === null || pct > best ? pct : best
    }, null)

  const visibilityCtx = instance
    ? { deadline: instance.deadline, allStudentsSubmitted, scorePct: bestPct }
    : null

  const showScore = instance && visibilityCtx
    ? canSeeScore(instance.score_visibility, visibilityCtx)
    : false
  const canReview = instance && visibilityCtx
    ? canSeeAnswers(instance.answer_visibility, instance.answer_visibility_threshold, visibilityCtx)
    : false

  // Submitted attempts are the reviewable ones — fetch answers for all of them
  // so the student can switch between attempts on the results page.
  const submittedAttempts = attempts.filter((a) => a.status === 'submitted')
  const submittedIds = submittedAttempts.map((a) => a.id)

  // ── Round 2 (parallel): answers with tags + question order ────────────────
  // Tags are embedded in the answers join (question_tags(tags(name))) so they
  // arrive in the same query — eliminates the old sequential round 3 fetch.
  const [answersResult, assignmentQuestionOrderResult, errorLogResult] = await Promise.all([
    canReview
      ? supabase
          .from('submission_answers')
          .select(
            'id, submission_id, question_id, selected_option_id, answer_text, is_correct, is_marked_for_review, time_spent_seconds, confidence, questions(id, type, content, teacher_explanation, ai_explanation, question_options(id, label, content, is_correct, order), question_accepted_answers(answer_text), question_tags(tags(name)))'
          )
          .in('submission_id', submittedIds)
      : Promise.resolve({ data: [] as AnswerRow[] }),
    instance
      ? supabase
          .from('assignment_questions')
          .select('question_id, order')
          .eq('assignment_id', instance.assignment_id)
      : Promise.resolve({ data: [] as { question_id: string; order: number }[] }),
    canReview && submittedIds.length > 0
      ? supabase
          .from('error_log')
          .select('id, submission_id, question_id, student_note')
          .eq('student_id', user!.id)
          .in('submission_id', submittedIds)
      : Promise.resolve({ data: [] as { id: string; submission_id: string; question_id: string; student_note: string | null }[] }),
  ])

  const errorLogMap = new Map(
    ((errorLogResult.data as { id: string; submission_id: string; question_id: string; student_note: string | null }[] | null) ?? [])
      .map((e) => [`${e.submission_id}:${e.question_id}`, { id: e.id, note: e.student_note }])
  )

  const answers: AnswerRow[] = (answersResult.data as AnswerRow[] | null) ?? []
  const assignmentQuestionOrder = new Map(
    ((assignmentQuestionOrderResult.data as { question_id: string; order: number }[] | null) ?? [])
      .map((q) => [q.question_id, q.order])
  )

  // Group every fetched answer by its submission so each attempt renders
  // independently — the client lets the student switch between attempts.
  const answersBySubmission = new Map<string, AnswerRow[]>()
  for (const answer of answers) {
    const list = answersBySubmission.get(answer.submission_id) ?? []
    list.push(answer)
    answersBySubmission.set(answer.submission_id, list)
  }

  // Most-recent-first list of submitted attempts, each with its own answers +
  // skill breakdown. The client defaults to the latest (index 0).
  const attemptResults = [...submittedAttempts]
    .sort((a, b) => b.attempt_number - a.attempt_number)
    .map((att) => {
      const view = buildAttemptView(answersBySubmission.get(att.id) ?? [], assignmentQuestionOrder, errorLogMap)
      return {
        id: att.id,
        attemptNumber: att.attempt_number,
        rawScore: att.raw_score ?? 0,
        totalQuestions: att.total_questions ?? 0,
        timeSpentSeconds: att.time_spent_seconds ?? 0,
        submittedAt: att.submitted_at ?? '',
        answers: view.answers,
        skillBreakdown: view.skillBreakdown,
      }
    })

  // Latest attempt's view — passed as the default answers/skillBreakdown props
  // for backward compatibility with callers that ignore attemptResults.
  const latestView = buildAttemptView(
    answersBySubmission.get(submission!.id) ?? [],
    assignmentQuestionOrder,
    errorLogMap
  )

  // "Used" attempts are the ones that count against the retake limit —
  // submitted or grading. An in-progress attempt is NOT yet used; it's the
  // attempt currently being taken. Counting it here matches the enforcement
  // in the test page (test/page.tsx) and avoids showing "3/3 used" while a
  // legitimate in-progress attempt can still be continued.
  const usedAttempts = attempts.filter(
    (a) => a.status === 'submitted' || a.status === 'grading'
  ).length
  const hasInProgressAttempt = attempts.some((a) => a.status === 'in_progress')
  const deadlineHasPassed = instance ? new Date(instance.deadline).getTime() <= Date.now() : true
  const retryAvailable = Boolean(
    instance &&
    !deadlineHasPassed &&
    (hasInProgressAttempt || canCreateAttempt(usedAttempts, instance.max_retakes))
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
      homeHref="/student/coursework"
      homeLabel={t('backToAssignments')}
      canReview={canReview}
      showScore={showScore}
      retryAvailable={retryAvailable}
      attemptsUsed={usedAttempts}
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
      answers={latestView.answers}
      skillBreakdown={latestView.skillBreakdown}
      attemptResults={attemptResults}
    />
  )
}
