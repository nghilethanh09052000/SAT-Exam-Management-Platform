import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createRawClient } from '@/lib/supabase/raw-client'
import { z } from 'zod'

const UpsertAnswerSchema = z.object({
  submission_id: z.string().uuid(),
  question_id: z.string().uuid(),
  selected_option_id: z.string().uuid().nullable().optional(),
  answer_text: z.string().nullable().optional(),
  is_marked_for_review: z.boolean().optional(),
})

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = UpsertAnswerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const raw = createRawClient()
  const { data, error } = await raw
    .from('submission_answers')
    .upsert(
      {
        submission_id: parsed.data.submission_id,
        question_id: parsed.data.question_id,
        selected_option_id: parsed.data.selected_option_id ?? null,
        answer_text: parsed.data.answer_text ?? null,
        is_marked_for_review: parsed.data.is_marked_for_review ?? false,
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'submission_id,question_id' }
    )
    .select('id, question_id')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}
