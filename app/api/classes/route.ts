import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { requirePermission } from '@/lib/authz'
import { revalidatePath } from 'next/cache'

const CreateClassSchema = z.object({
  course_id:     z.string().min(1),
  title:         z.string().min(1),
  schedule_text: z.string().trim().min(1, 'Schedule is required'),
})

export async function GET(req: Request) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('course_id')

  let query = supabase
    .from('classes')
    .select('id, course_id, title, schedule_text, archived_at, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  if (courseId) query = query.eq('course_id', courseId)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

export const POST = withTeacher(async (req, { user, profile, db }) => {
  const cap = requirePermission({ profile }, 'classes:create')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })

  const body = await req.json()
  const parsed = CreateClassSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  // `classes:create` is not class-scoped (no class yet). Until course-level staff
  // attachment is modelled (plan §9.7), staff may only create classes under courses
  // they own; admin bypasses.
  const { data: course } = await db
    .from('courses')
    .select('teacher_id')
    .eq('id', parsed.data.course_id)
    .single()
  if (!course || (profile.role !== 'admin' && course.teacher_id !== user.id)) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await db
    .from('classes')
    .insert(parsed.data)
    .select('id, title')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  // Auto-assign the creating teacher to the new class so they can manage it under the
  // class-scope model. (Admins are implicitly scoped to all classes — skip.) The insert
  // fires the perm_version trigger, so the creator's cached cookie is invalidated and the
  // new class is manageable on their very next request — no staleness window (plan §9.2).
  if (data && profile.role === 'teacher') {
    await db
      .from('staff_class_assignments')
      .upsert({ user_id: user.id, class_id: data.id }, { onConflict: 'user_id,class_id', ignoreDuplicates: true })
  }

  revalidatePath(`/teacher/courses/${parsed.data.course_id}`)
  return NextResponse.json({ data, error: null })
})
