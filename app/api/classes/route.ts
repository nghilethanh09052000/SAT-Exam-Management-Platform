import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { revalidatePath } from 'next/cache'

const CreateClassSchema = z.object({
  course_id: z.string().min(1),
  title: z.string().min(1),
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
  const body = await req.json()
  const parsed = CreateClassSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

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

  revalidatePath(`/teacher/courses/${parsed.data.course_id}`)
  return NextResponse.json({ data, error: null })
})
