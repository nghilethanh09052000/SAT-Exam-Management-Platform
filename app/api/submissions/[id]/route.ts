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

  const { data: submission } = await supabase
    .from('submissions')
    .select('id, status')
    .eq('id', params.id)
    .eq('student_id', user.id)
    .single()

  if (!submission) return NextResponse.json({ data: null, error: 'Submission not found' }, { status: 404 })
  if ((submission as { status: string }).status !== 'in_progress') {
    return NextResponse.json({ data: null, error: 'Submission already completed' }, { status: 409 })
  }

  const { data, error } = await (supabase.from('submissions') as any)
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, current_question_id, current_module')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}
