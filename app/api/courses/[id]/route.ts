import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'

// Service-role client bypasses RLS — safe to use in server-only API routes
function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

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

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  if (!isTeacherOrAdmin(profile)) return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const parsed = UpdateCourseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  const raw = rawClient()
  if (profile?.role !== 'admin') {
    const { data: course } = await raw.from('courses').select('teacher_id').eq('id', params.id).single()
    if (!course || course.teacher_id !== user.id) {
      return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
    }
  }
  const { data, error } = await raw
    .from('courses')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, title')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  revalidatePath('/teacher/courses')
  revalidatePath('/admin/courses')
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
  const raw = rawClient()
  if (profile?.role !== 'admin') {
    const { data: course } = await raw.from('courses').select('teacher_id').eq('id', params.id).single()
    if (!course || course.teacher_id !== user.id) {
      return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
    }
  }
  const { error } = await raw
    .from('courses')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  revalidatePath('/teacher/courses')
  revalidatePath('/admin/courses')
  return NextResponse.json({ data: { success: true }, error: null })
}
