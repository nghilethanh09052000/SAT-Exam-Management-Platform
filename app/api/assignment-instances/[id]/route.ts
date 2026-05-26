import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { assertTeacherOwnsAssignmentInstance } from '@/lib/authz'

const UpdateInstanceSchema = z.object({
  deadline: z.string().optional(),
  is_timed: z.boolean().optional(),
  time_limit_seconds: z.number().nullable().optional(),
  show_results: z.enum(['immediately', 'after_deadline']).optional(),
  published_at: z.string().nullable().optional(),
  max_retakes: z.number().int().optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('assignment_instances')
    .select(
      'id, assignment_id, class_id, week_id, deadline, is_timed, time_limit_seconds, show_results, shuffle_questions, shuffle_options, max_retakes, alert_enabled, published_at, created_at'
    )
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
  return NextResponse.json({ data, error: null })
}

export const PATCH = withTeacher<{ id: string }>(async (req, { user, profile, db, params }) => {
  const authz = await assertTeacherOwnsAssignmentInstance({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const body = await req.json()
  const parsed = UpdateInstanceSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { data, error } = await db
    .from('assignment_instances')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, deadline')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})

export const DELETE = withTeacher<{ id: string }>(async (_req, { user, profile, db, params }) => {
  const authz = await assertTeacherOwnsAssignmentInstance({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const { error } = await db.from('assignment_instances').delete().eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data: { success: true }, error: null })
})
