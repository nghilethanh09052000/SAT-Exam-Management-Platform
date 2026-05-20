import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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

export async function POST(req: Request, { params: _params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { attemptId: string; answers: AnswerPayload[] }
  const correctCount = body.answers.filter((a) => a.isCorrect).length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  if (body.answers.length > 0) {
    await sb.from('exercise_answers').insert(
      body.answers.map((a) => ({
        attempt_id: body.attemptId,
        question_id: a.questionId,
        selected_option_id: a.selectedOptionId ?? null,
        answer_text: a.answerText ?? null,
        is_correct: a.isCorrect,
      }))
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    'complete_exercise_attempt',
    { p_attempt_id: body.attemptId, p_correct_count: correctCount, p_total: body.answers.length }
  ) as { data: CompleteResult[] | null; error: { message: string } | null }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const row = (data ?? [])[0] ?? {
    current_streak: 0, longest_streak: 0, total_days_active: 0, is_new_day: false, is_new_milestone: false,
  }

  return NextResponse.json({
    correctCount,
    total: body.answers.length,
    streak: {
      current: row.current_streak,
      longest: row.longest_streak,
      totalDays: row.total_days_active,
      isNewDay: row.is_new_day,
      isMilestone: row.is_new_milestone,
    },
  })
}
