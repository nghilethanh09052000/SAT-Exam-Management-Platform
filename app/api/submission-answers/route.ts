/**
 * POST /api/submission-answers
 *
 * Save a single answer during an in-progress test.
 * Called from test-interface.tsx when the student clicks Save.
 *
 * Performance fix: use a narrow RPC for the hot save path.
 * Ownership + status guard is enforced inside public.upsert_submission_answer,
 * and no-op saves return the existing row without rewriting it.
 *
 * One round-trip per saved answer.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { withAnyAuth } from '@/lib/with-auth'

export const runtime = 'nodejs'

const UpsertAnswerSchema = z.object({
  submission_id:        z.string().min(1),
  question_id:          z.string().min(1),
  selected_option_id:   z.string().min(1).nullable().optional(),
  answer_text:          z.string().nullable().optional(),
  is_marked_for_review: z.boolean().optional(),
  highlight_data: z
    .array(
      z.object({
        text:          z.string().min(1),
        color:         z.string().optional(),
        underline:     z.boolean().optional(),
        underlineStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
        note:          z.string().optional(),
      })
    )
    .nullable()
    .optional(),
  note_text:         z.string().nullable().optional(),
  strikethrough_data: z.array(z.string()).nullable().optional(),
  time_spent_seconds: z.number().int().nullable().optional(),
})

export const POST = withAnyAuth(async (req) => {
  const body   = await req.json()
  const parsed = UpsertAnswerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  // Use the session-carrying client so auth.uid() inside the RPC is the current user
  const supabase = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .rpc('upsert_submission_answer', {
      p_submission_id: parsed.data.submission_id,
      p_question_id: parsed.data.question_id,
      p_selected_option_id: parsed.data.selected_option_id ?? null,
      p_answer_text: parsed.data.answer_text ?? null,
      p_is_marked_for_review: parsed.data.is_marked_for_review ?? false,
      p_highlight_data: parsed.data.highlight_data ?? null,
      p_note_text: parsed.data.note_text ?? null,
      p_strikethrough_data: parsed.data.strikethrough_data ?? null,
      p_time_spent_seconds: parsed.data.time_spent_seconds ?? null,
    })
    .single()

  // RLS violation means the submission isn't in_progress or doesn't belong to user
  if (error?.code === '42501' || error?.code === 'P0002') {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    data: {
      id: data.id,
      question_id: data.question_id,
    },
    error: null,
  })
})
