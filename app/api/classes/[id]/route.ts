import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'

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

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  if (!isTeacherOrAdmin(profile)) return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const parsed = UpdateClassSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  const raw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: existingClass } = await raw
    .from('classes')
    .select('course_id')
    .eq('id', params.id)
    .single()
  const { data: course } = existingClass
    ? await raw.from('courses').select('teacher_id').eq('id', existingClass.course_id).single()
    : { data: null }
  const ownerId = course?.teacher_id
  if (!existingClass || (profile?.role !== 'admin' && ownerId !== user.id)) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }
  const { data, error } = await raw
    .from('classes')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, title')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  revalidatePath(`/teacher/courses/${existingClass.course_id}`)
  return NextResponse.json({ data, error: null })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  if (!isTeacherOrAdmin(profile)) return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  const raw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: existingClass } = await raw
    .from('classes')
    .select('course_id')
    .eq('id', params.id)
    .single()
  const { data: course } = existingClass
    ? await raw.from('courses').select('teacher_id').eq('id', existingClass.course_id).single()
    : { data: null }
  const ownerId = course?.teacher_id
  if (!existingClass || (profile?.role !== 'admin' && ownerId !== user.id)) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }
  const { error } = await raw
    .from('classes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  revalidatePath(`/teacher/courses/${existingClass.course_id}`)
  return NextResponse.json({ data: { success: true }, error: null })
}
