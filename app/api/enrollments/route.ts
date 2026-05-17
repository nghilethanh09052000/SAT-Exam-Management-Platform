/**
 * POST /api/enrollments
 * Enroll a single student in a class.
 *
 * Body: { class_id, student_id }
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'

function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

const EnrollSchema = z.object({
  class_id: z.string().min(1),
  student_id: z.string().min(1),
})

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  if (!isTeacherOrAdmin(profile)) return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ data: null, error: 'Body không hợp lệ.' }, { status: 400 })
  }

  const parsed = EnrollSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const { class_id, student_id } = parsed.data
  const raw = rawClient()
  if (profile?.role !== 'admin') {
    const { data: cls } = await raw.from('classes').select('course_id').eq('id', class_id).single()
    const { data: course } = cls
      ? await raw.from('courses').select('teacher_id').eq('id', cls.course_id).single()
      : { data: null }
    if (!course || course.teacher_id !== user.id) {
      return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
    }
  }

  // Upsert to avoid duplicate key errors
  const { data, error } = await raw
    .from('enrollments')
    .upsert({ class_id, student_id }, { onConflict: 'class_id,student_id', ignoreDuplicates: true })
    .select('id, class_id, student_id, enrolled_at')
    .single()

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, error: null }, { status: 201 })
}

/**
 * GET /api/enrollments?class_id=xxx
 * Returns students enrolled in a class with their profile info.
 */
export async function GET(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const classId = searchParams.get('class_id')
  if (!classId) return NextResponse.json({ data: null, error: 'Thiếu class_id.' }, { status: 400 })

  const raw = rawClient()
  const { data, error } = await raw
    .from('enrollments')
    .select('id, student_id, enrolled_at, profiles(id, full_name, phone, is_active)')
    .eq('class_id', classId)
    .order('enrolled_at', { ascending: true })

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, error: null })
}
