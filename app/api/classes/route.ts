import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'
import { revalidatePath } from 'next/cache'

const CreateClassSchema = z.object({
  course_id: z.string().min(1),
  title: z.string().min(1),
  schedule_text: z.string().nullable().optional(),
  start_date: z.string(),
  end_date: z.string(),
})

export async function GET(req: Request) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('course_id')

  let query = supabase
    .from('classes')
    .select('id, course_id, title, schedule_text, start_date, end_date, archived_at, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  if (courseId) {
    query = query.eq('course_id', courseId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  if (!isTeacherOrAdmin(profile)) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const parsed = CreateClassSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  const raw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  if (profile?.role !== 'admin') {
    const { data: course } = await raw
      .from('courses')
      .select('teacher_id')
      .eq('id', parsed.data.course_id)
      .single()
    if (!course || course.teacher_id !== user.id) {
      return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
    }
  }
  const { data, error } = await raw
    .from('classes')
    .insert(parsed.data)
    .select('id, title')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  revalidatePath(`/teacher/courses/${parsed.data.course_id}`)
  return NextResponse.json({ data, error: null })
}
