import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { assertTeacherOwnsAssignment, requirePermission } from '@/lib/authz'

const UpdateAssignmentSchema = z.object({
  title: z.string().min(1).optional(),
  archived_at: z.string().nullable().optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('assignments')
    .select('id, title, created_by, archived_at, created_at')
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
  return NextResponse.json({ data, error: null })
}

export const PATCH = withTeacher<{ id: string }>(async (req, { user, profile, db, params }) => {
  const cap = requirePermission({ profile }, 'assignments:update')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })
  const authz = await assertTeacherOwnsAssignment({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const body = await req.json()
  const parsed = UpdateAssignmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { data, error } = await db
    .from('assignments')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, title')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})

export const DELETE = withTeacher<{ id: string }>(async (_req, { user, profile, db, params }) => {
  const cap = requirePermission({ profile }, 'assignments:delete')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })
  const authz = await assertTeacherOwnsAssignment({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const { error } = await db
    .from('assignments')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data: { success: true }, error: null })
})
