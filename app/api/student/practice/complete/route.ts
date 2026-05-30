import { NextResponse } from 'next/server'
import { withAnyAuth } from '@/lib/with-auth'

export const runtime = 'nodejs'

type AnswerPayload = {
  questionId: string
  selectedOptionId?: string | null
  answerText?: string | null
  isCorrect: boolean
}

type CompleteResult = {
  current_streak: number
  longest_streak: number
  total_days_active: number
  is_new_day: boolean
  is_new_milestone: boolean
}

// Records a topic/tag practice drill. Drills are composed on the fly from the
// question bank, so there is no exercise_attempts row — we only bump the
// streak + daily activity via record_practice_completion(student, correct, total).
export const POST = withAnyAuth(async (req, { user, db }) => {
  const body = (await req.json()) as { answers: AnswerPayload[] }
  const answers = Array.isArray(body.answers) ? body.answers : []
  const correctCount = answers.filter((a) => a.isCorrect).length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db as any

  const { data, error } = (await sb.rpc('record_practice_completion', {
    p_student_id: user.id,
    p_correct_count: correctCount,
    p_total: answers.length,
  })) as { data: CompleteResult[] | null; error: { message: string } | null }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
