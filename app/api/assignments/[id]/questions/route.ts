/**
 * POST /api/assignments/:id/questions
 * Sets the questions for an assignment (replaces existing).
 * Body: { question_ids: string[] }
 *
 * GET /api/assignments/:id/questions
 * Returns ordered question list for an assignment.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createRawClient } from '@/lib/supabase/raw-client'
import { z } from 'zod'

const SetQuestionsSchema = z.object({
  question_ids: z.array(z.string().uuid()).min(1),
})

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('assignment_questions')
    .select('id, question_id, order, questions(id, type, content, difficulty)')
    .eq('assignment_id', params.id)
    .order('order', { ascending: true })

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = SetQuestionsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const raw = createRawClient()

  // Delete existing
  await raw.from('assignment_questions').delete().eq('assignment_id', params.id)

  // Insert new
  const rows = parsed.data.question_ids.map((qid, idx) => ({
    assignment_id: params.id,
    question_id: qid,
    order: idx + 1,
  }))

  const { error } = await raw.from('assignment_questions').insert(rows)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

  return NextResponse.json({ data: { set: rows.length }, error: null })
}
