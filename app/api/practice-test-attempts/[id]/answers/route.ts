import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAnyAuth } from '@/lib/with-auth'

export const runtime = 'nodejs'

const UpsertAnswerSchema = z.object({
  submission_id: z.string().uuid(),
  question_id: z.string().uuid(),
  selected_option_id: z.string().uuid().nullable().optional(),
  answer_text: z.string().nullable().optional(),
  is_marked_for_review: z.boolean().optional(),
  highlight_data: z.array(z.object({
    text: z.string().min(1),
    color: z.string().optional(),
    underline: z.boolean().optional(),
    underlineStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
    note: z.string().optional(),
  })).nullable().optional(),
  note_text: z.string().nullable().optional(),
  strikethrough_data: z.array(z.string()).nullable().optional(),
  time_spent_seconds: z.number().int().nullable().optional(),
})

export const POST = withAnyAuth<{ id: string }>(async (req, { user, db, params }) => {
  const parsed = UpsertAnswerSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  if (parsed.data.submission_id !== params.id) {
    return NextResponse.json({ data: null, error: 'Attempt mismatch' }, { status: 400 })
  }

  const { data: attempt } = await db
    .from('practice_test_attempts')
    .select('id, status')
    .eq('id', params.id)
    .eq('student_id', user.id)
    .single()

  if (!attempt) return NextResponse.json({ data: null, error: 'Attempt not found' }, { status: 404 })
  if ((attempt as { status: string }).status !== 'in_progress') {
    return NextResponse.json({ data: null, error: 'Attempt already completed' }, { status: 409 })
  }

  const { data, error } = await db
    .from('practice_test_answers')
    .upsert(
      {
        attempt_id: params.id,
        question_id: parsed.data.question_id,
        selected_option_id: parsed.data.selected_option_id ?? null,
        answer_text: parsed.data.answer_text ?? null,
        is_marked_for_review: parsed.data.is_marked_for_review ?? false,
        highlight_data: parsed.data.highlight_data ?? null,
        note_text: parsed.data.note_text ?? null,
        strikethrough_data: parsed.data.strikethrough_data ?? null,
        time_spent_seconds: parsed.data.time_spent_seconds ?? 0,
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'attempt_id,question_id' }
    )
    .select('id, question_id')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})
