import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { calculateRawScore, isShortAnswerCorrect } from '@/lib/utils/score'
import { z } from 'zod'

const AnswerSchema = z.object({
  question_id: z.string().uuid(),
  selected_option_id: z.string().uuid().nullable().optional(),
  answer_text: z.string().nullable().optional(),
  time_spent_seconds: z.number().int().nullable().optional(),
  is_marked_for_review: z.boolean().optional(),
})

const SubmitSchema = z.object({
  answers: z.array(AnswerSchema),
  time_spent_seconds: z.number().int().optional(),
})

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const parsed = SubmitSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const raw = serviceRole()
  const { data: attempt } = await raw
    .from('public_exam_attempts')
    .select('id, status, student_id')
    .eq('id', params.id)
    .eq('student_id', user.id)
    .single()

  if (!attempt) return NextResponse.json({ data: null, error: 'Attempt not found' }, { status: 404 })
  if ((attempt as { status: string }).status !== 'in_progress') {
    return NextResponse.json({ data: null, error: 'Attempt already completed' }, { status: 400 })
  }

  const processedAnswers = await Promise.all(
    parsed.data.answers.map(async (answer) => {
      let is_correct: boolean | null = null

      if (answer.selected_option_id) {
        const { data: option } = await raw
          .from('question_options')
          .select('is_correct')
          .eq('id', answer.selected_option_id)
          .single()
        is_correct = (option as { is_correct: boolean } | null)?.is_correct ?? null
      } else if (answer.answer_text) {
        const { data: acceptedAnswers } = await raw
          .from('question_accepted_answers')
          .select('answer_text')
          .eq('question_id', answer.question_id)
        const values = ((acceptedAnswers as { answer_text: string }[] | null) ?? []).map((row) => row.answer_text)
        if (values.length > 0) is_correct = isShortAnswerCorrect(answer.answer_text, values)
      }

      return {
        attempt_id: params.id,
        question_id: answer.question_id,
        selected_option_id: answer.selected_option_id ?? null,
        answer_text: answer.answer_text ?? null,
        is_correct,
        is_marked_for_review: answer.is_marked_for_review ?? false,
        time_spent_seconds: answer.time_spent_seconds ?? null,
        answered_at: new Date().toISOString(),
      }
    })
  )

  const { error: insertError } = await raw
    .from('public_exam_answers')
    .upsert(processedAnswers, { onConflict: 'attempt_id,question_id' })

  if (insertError) return NextResponse.json({ data: null, error: insertError.message }, { status: 400 })

  const rawScore = calculateRawScore(processedAnswers)
  const { data, error } = await raw
    .from('public_exam_attempts')
    .update({
      status: 'submitted',
      raw_score: rawScore,
      total_questions: parsed.data.answers.length,
      submitted_at: new Date().toISOString(),
      time_spent_seconds: parsed.data.time_spent_seconds ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('id, status, raw_score, total_questions')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}
