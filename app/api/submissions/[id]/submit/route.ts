import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { calculateRawScore } from '@/lib/utils/score'
import { isShortAnswerCorrect } from '@/lib/utils/score'
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

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = SubmitSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { answers, time_spent_seconds } = parsed.data

  // Verify submission belongs to user and is in_progress
  const subResult = await supabase
    .from('submissions')
    .select('id, status, student_id, instance_id')
    .eq('id', params.id)
    .eq('student_id', user.id)
    .single()

  type SubRow = { id: string; status: string; student_id: string; instance_id: string }
  const submission = subResult.data as SubRow | null

  if (!submission) {
    return NextResponse.json({ data: null, error: 'Submission not found' }, { status: 404 })
  }
  if (submission.status !== 'in_progress') {
    return NextResponse.json({ data: null, error: 'Submission already completed' }, { status: 400 })
  }

  // Process each answer — determine is_correct
  const processedAnswers = await Promise.all(
    answers.map(async (answer) => {
      let is_correct: boolean | null = null

      if (answer.selected_option_id) {
        // Multiple choice
        const optResult = await supabase
          .from('question_options')
          .select('is_correct')
          .eq('id', answer.selected_option_id)
          .single()
        const opt = optResult.data as { is_correct: boolean } | null
        is_correct = opt?.is_correct ?? null
      } else if (answer.answer_text) {
        // Short answer
        const aaResult = await supabase
          .from('question_accepted_answers')
          .select('answer_text')
          .eq('question_id', answer.question_id)
        type AaRow = { answer_text: string }
        const acceptedAnswers: AaRow[] = (aaResult.data as AaRow[] | null) ?? []
        if (acceptedAnswers.length > 0) {
          is_correct = isShortAnswerCorrect(
            answer.answer_text,
            acceptedAnswers.map((a) => a.answer_text)
          )
        }
      }

      return {
        submission_id: params.id,
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

  const raw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

  // Upsert submission_answers
  const { error: insertError } = await raw
    .from('submission_answers')
    .upsert(processedAnswers, { onConflict: 'submission_id,question_id' })

  if (insertError) {
    return NextResponse.json({ data: null, error: insertError.message }, { status: 400 })
  }

  // Calculate score
  const rawScore = calculateRawScore(processedAnswers)

  // Update submission to submitted
  const { data: updated, error: updateError } = await raw
    .from('submissions')
    .update({
      status: 'submitted',
      raw_score: rawScore,
      total_questions: answers.length,
      submitted_at: new Date().toISOString(),
      time_spent_seconds: time_spent_seconds ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('id, status, raw_score, total_questions')
    .single()

  if (updateError) {
    return NextResponse.json({ data: null, error: updateError.message }, { status: 400 })
  }

  // Add to error log — wrong answers
  const wrongAnswers = processedAnswers.filter((a) => a.is_correct === false)
  if (wrongAnswers.length > 0) {
    await raw.from('error_log').insert(
      wrongAnswers.map((a) => ({
        student_id: user.id,
        submission_id: params.id,
        question_id: a.question_id,
      }))
    )
  }

  return NextResponse.json({ data: updated, error: null })
}
