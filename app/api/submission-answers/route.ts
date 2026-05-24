/**
 * POST /api/submission-answers
 *
 * Auto-save a single answer during an in-progress test.
 * Called from test-interface.tsx debounced at 400 ms.
 *
 * Performance fix (Case 3): removed the explicit SELECT ownership check.
 * Ownership + status guard is now enforced by the RLS policy in
 * 00037_rls_submission_answers_upsert.sql — Postgres runs it inside the
 * same transaction as the upsert, saving one sequential round-trip per save.
 *
 * One round-trip per auto-save (was two).
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const UpsertAnswerSchema = z.object({
  submission_id:        z.string().min(1),
  question_id:          z.string().min(1),
  selected_option_id:   z.string().min(1).nullable().optional(),
  answer_text:          z.string().nullable().optional(),
  is_marked_for_review: z.boolean().optional(),
  highlight_data: z
    .array(
      z.object({
        text:      z.string().min(1),
        color:     z.string().optional(),
        underline: z.boolean().optional(),
        note:      z.string().optional(),
      })
    )
    .nullable()
    .optional(),
  note_text:         z.string().nullable().optional(),
  strikethrough_data: z.array(z.string()).nullable().optional(),
  time_spent_seconds: z.number().int().nullable().optional(),
})

export async function POST(req: Request) {
  // Use the anon client so RLS is enforced — ownership check happens inside Postgres
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json()
  const parsed = UpsertAnswerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  // Single upsert — RLS policy validates ownership + in_progress status
  // inside the same Postgres transaction. No extra SELECT round-trip.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('submission_answers')
    .upsert(
      {
        submission_id:        parsed.data.submission_id,
        question_id:          parsed.data.question_id,
        selected_option_id:   parsed.data.selected_option_id ?? null,
        answer_text:          parsed.data.answer_text ?? null,
        is_marked_for_review: parsed.data.is_marked_for_review ?? false,
        highlight_data:       parsed.data.highlight_data ?? null,
        note_text:            parsed.data.note_text ?? null,
        strikethrough_data:   parsed.data.strikethrough_data ?? null,
        time_spent_seconds:   parsed.data.time_spent_seconds ?? null,
        answered_at:          new Date().toISOString(),
        updated_at:           new Date().toISOString(),
      },
      { onConflict: 'submission_id,question_id' }
    )
    .select('id, question_id')
    .single()

  // RLS violation means the submission isn't in_progress or doesn't belong to user
  if (error?.code === '42501') {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data, error: null })
}
