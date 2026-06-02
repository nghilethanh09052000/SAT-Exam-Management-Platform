import { NextResponse } from 'next/server'
import { withAnyAuth } from '@/lib/with-auth'

export const runtime = 'nodejs'

// Per-question answer snapshot. `isCorrect` is graded on the client (same logic
// as today's practice mode); the server stores it as-is and never sees the key.
type AnswerPayload = {
  questionId: string
  selectedOptionId?: string | null
  answerText?: string | null
  isCorrect: boolean
}

type SubmitBody = {
  kind: 'category' | 'test'
  refId: string // tag_id (category) | exam_paper_id (test)
  difficulty?: string // category only — 'easy' | 'medium' | 'hard' | 'all'
  answers: AnswerPayload[]
  timeSpentSeconds?: number
}

type CompleteResult = {
  current_streak: number
  longest_streak: number
  total_days_active: number
  is_new_day: boolean
  is_new_milestone: boolean
}

// Records a self-exercise submission (topic/category drill or self-serve test).
//
// Option B from the plan: on every submit we BOTH (1) persist exactly one
// result record (upsert — retake overwrites, no history) AND (2) bump the
// streak/daily-activity via record_practice_completion — the same streak
// behavior the streak-only /complete endpoint has always had.
export const POST = withAnyAuth(async (req, { user, db }) => {
  const body = (await req.json()) as Partial<SubmitBody>
  const kind = body.kind
  const refId = body.refId
  const answers = Array.isArray(body.answers) ? body.answers : []
  const timeSpentSeconds = Number.isFinite(body.timeSpentSeconds) ? Number(body.timeSpentSeconds) : 0
  const correctCount = answers.filter((a) => a.isCorrect).length

  if (!refId || (kind !== 'category' && kind !== 'test')) {
    return NextResponse.json({ error: 'invalid kind/refId' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db as any

  const snapshot = {
    student_id: user.id,
    raw_score: correctCount,
    total_questions: answers.length,
    answers,
    time_spent_seconds: timeSpentSeconds,
    submitted_at: new Date().toISOString(),
  }

  // 1) One-record upsert into the table that matches the flow.
  if (kind === 'category') {
    const difficulty = body.difficulty ?? 'all'
    const { error } = await sb
      .from('practice_category_results')
      .upsert(
        { ...snapshot, tag_id: refId, difficulty },
        { onConflict: 'student_id,tag_id,difficulty' }
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await sb
      .from('self_test_results')
      .upsert(
        { ...snapshot, exam_paper_id: refId },
        { onConflict: 'student_id,exam_paper_id' }
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 2) Keep streak/daily-activity behavior identical to /complete.
  const { data, error: streakError } = (await sb.rpc('record_practice_completion', {
    p_student_id: user.id,
    p_correct_count: correctCount,
    p_total: answers.length,
  })) as { data: CompleteResult[] | null; error: { message: string } | null }

  if (streakError) return NextResponse.json({ error: streakError.message }, { status: 500 })

  const row = (data ?? [])[0] ?? {
    current_streak: 0, longest_streak: 0, total_days_active: 0, is_new_day: false, is_new_milestone: false,
  }

  return NextResponse.json({
    correctCount,
    total: answers.length,
    streak: {
      current: row.current_streak,
      longest: row.longest_streak,
      totalDays: row.total_days_active,
      isNewDay: row.is_new_day,
      isMilestone: row.is_new_milestone,
    },
  })
})
