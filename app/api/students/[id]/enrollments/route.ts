/**
 * GET /api/students/[id]/enrollments
 * Returns enrollments (with class + course info) for a single student.
 * Used by the admin student detail/edit modal to lazy-load enrollment data.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'
import { createServerClient } from '@/lib/supabase/server'

function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

type EnrollmentRow = {
  id: string
  enrolled_at: string
  class_id: string
  classes: {
    id: string
    title: string
    course_id: string
    courses: { id: string; title: string } | null
  } | null
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  if (!isTeacherOrAdmin(profile)) return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })

  const { data, error } = await rawClient()
    .from('enrollments')
    .select('id, enrolled_at, class_id, classes(id, title, course_id, courses(id, title))')
    .eq('student_id', params.id)
    .order('enrolled_at', { ascending: false })

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

  const enrollments = ((data ?? []) as unknown as EnrollmentRow[]).map((row) => ({
    id: row.id,
    enrolled_at: row.enrolled_at,
    class_id: row.class_id,
    class_title: row.classes?.title ?? '—',
    course_id: row.classes?.course_id ?? '',
    course_title: row.classes?.courses?.title ?? '—',
  }))

  return NextResponse.json({ data: enrollments, error: null })
}
