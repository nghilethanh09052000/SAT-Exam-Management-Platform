import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { withTeacher } from '@/lib/with-auth'
import { assertTeacherOwnsClass } from '@/lib/authz'

const UpdateClassSchema = z.object({
  title: z.string().min(1).optional(),
  schedule_text: z.string().trim().min(1, 'Schedule is required').optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('classes')
    .select('id, course_id, title, schedule_text, archived_at, created_at')
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
  return NextResponse.json({ data, error: null })
}

export const PATCH = withTeacher<{ id: string }>(async (req, { user, profile, db, params }) => {
  const authz = await assertTeacherOwnsClass({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const body = await req.json()
  const parsed = UpdateClassSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { data: existingClass } = await db.from('classes').select('course_id').eq('id', params.id).single()

  const { data, error } = await db
    .from('classes')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, title')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  if (existingClass) revalidatePath(`/teacher/courses/${existingClass.course_id}`)
  return NextResponse.json({ data, error: null })
})

export const DELETE = withTeacher<{ id: string }>(async (_req, { user, profile, db, params }) => {
  const authz = await assertTeacherOwnsClass({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const { data: existingClass } = await db.from('classes').select('course_id').eq('id', params.id).single()

  const { error } = await db
    .from('classes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  if (existingClass) revalidatePath(`/teacher/courses/${existingClass.course_id}`)
  return NextResponse.json({ data: { success: true }, error: null })
})
