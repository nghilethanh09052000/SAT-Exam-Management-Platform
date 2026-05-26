import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { withTeacher } from '@/lib/with-auth'
import { assertTeacherOwnsCourse } from '@/lib/authz'

const UpdateCourseSchema = z.object({
  title: z.string().min(1).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  expires_at: z.string().nullable().optional(),
  archived_at: z.string().nullable().optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, start_date, end_date, expires_at, archived_at, created_at, teacher_id')
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
  return NextResponse.json({ data, error: null })
}

export const PATCH = withTeacher<{ id: string }>(async (req, { user, profile, db, params }) => {
  const authz = await assertTeacherOwnsCourse({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const body = await req.json()
  const parsed = UpdateCourseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { data, error } = await db
    .from('courses')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, title, start_date, end_date, archived_at, created_at, teacher_id')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  revalidatePath('/teacher/courses')
  revalidatePath('/admin/courses')
  return NextResponse.json({ data, error: null })
})

export const DELETE = withTeacher<{ id: string }>(async (_req, { user, profile, db, params }) => {
  const authz = await assertTeacherOwnsCourse({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const { error } = await db
    .from('courses')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  revalidatePath('/teacher/courses')
  revalidatePath('/admin/courses')
  return NextResponse.json({ data: { success: true }, error: null })
})
