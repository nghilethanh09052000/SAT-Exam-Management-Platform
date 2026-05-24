import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const UpdateProgressSchema = z.object({
  current_question_id: z.string().uuid().nullable().optional(),
  current_module: z.string().nullable().optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('submissions')
    .select(
      'id, instance_id, student_id, attempt_number, status, raw_score, total_questions, current_question_id, current_module, started_at, submitted_at, time_spent_seconds'
    )
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
  return NextResponse.json({ data, error: null })
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = UpdateProgressSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const { data, error } = await (supabase as any)
    .rpc('save_submission_progress', {
      p_submission_id: params.id,
      p_current_question_id: parsed.data.current_question_id ?? null,
      p_current_module: parsed.data.current_module ?? null,
    })
    .single()

  if (error || !data) {
    return NextResponse.json({ data: null, error: 'Submission not found or already completed' }, { status: 409 })
  }

  return NextResponse.json({
    data: {
      id: data.id,
      current_question_id: data.current_question_id,
      current_module: data.current_module,
    },
    error: null,
  })
}
