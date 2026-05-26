import { NextResponse } from 'next/server'
import { calculateRawScore, isShortAnswerCorrect } from '@/lib/utils/score'
import { z } from 'zod'
import { withAnyAuth } from '@/lib/with-auth'

export const runtime = 'nodejs'

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

export const POST = withAnyAuth<{ id: string }>(async (req, { user, db, params }) => {
  const parsed = SubmitSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { data: attempt } = await db
    .from('public_exam_attempts')
    .select('id, status, student_id')
    .eq('id', params.id)
    .eq('student_id', user.id)
    .single()

  if (!attempt) return NextResponse.json({ data: null, error: 'Attempt not found' }, { status: 404 })
  if ((attempt as { id: string; status: string; student_id: string }).status !== 'in_progress') {
    return NextResponse.json({ data: null, error: 'Attempt already completed' }, { status: 400 })
  }

  const answers = parsed.data.answers

  // ── Batch fetch — 2 queries instead of N ─────────────────────────────────
  const optionIds     = answers.filter(a => a.selected_option_id).map(a => a.selected_option_id!)
  const saQuestionIds = answers.filter(a => a.answer_text && !a.selected_option_id).map(a => a.question_id)

  const [optionsRes, acceptedRes] = await Promise.all([
    optionIds.length > 0
      ? db.from('question_options').select('id, is_correct').in('id', optionIds)
      : Promise.resolve({ data: [] as { id: string; is_correct: boolean }[] }),
    saQuestionIds.length > 0
      ? db.from('question_accepted_answers').select('question_id, answer_text').in('question_id', saQuestionIds)
      : Promise.resolve({ data: [] as { question_id: string; answer_text: string }[] }),
  ])

  const optionMap = new Map((optionsRes.data ?? []).map(o => [o.id, o.is_correct]))
  const acceptedMap = new Map<string, string[]>()
  for (const row of acceptedRes.data ?? []) {
    const list = acceptedMap.get(row.question_id) ?? []
    list.push(row.answer_text)
    acceptedMap.set(row.question_id, list)
  }

  // ── Grade in memory ───────────────────────────────────────────────────────
  const processedAnswers = answers.map((answer) => {
    let is_correct: boolean | null = null

    if (answer.selected_option_id) {
      is_correct = optionMap.get(answer.selected_option_id) ?? null
    } else if (answer.answer_text) {
      const accepted = acceptedMap.get(answer.question_id) ?? []
      if (accepted.length > 0) is_correct = isShortAnswerCorrect(answer.answer_text, accepted)
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

  const { error: insertError } = await db
    .from('public_exam_answers')
    .upsert(processedAnswers as never[], { onConflict: 'attempt_id,question_id' })

  if (insertError) return NextResponse.json({ data: null, error: insertError.message }, { status: 400 })

  const rawScore = calculateRawScore(processedAnswers)
  const { data, error } = await db
    .from('public_exam_attempts')
    .update({
      status: 'submitted',
      raw_score: rawScore,
      total_questions: answers.length,
      submitted_at: new Date().toISOString(),
      time_spent_seconds: parsed.data.time_spent_seconds ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', params.id)
    .select('id, status, raw_score, total_questions')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})
