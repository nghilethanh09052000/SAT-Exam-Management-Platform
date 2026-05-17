/**
 * DELETE /api/enrollments/:id
 * Remove a student enrollment.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'

function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  if (!isTeacherOrAdmin(profile)) return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })

  const raw = rawClient()
  const { data: enrollment } = await raw.from('enrollments').select('class_id').eq('id', params.id).single()
  const { data: cls } = enrollment
    ? await raw.from('classes').select('course_id').eq('id', enrollment.class_id).single()
    : { data: null }
  const { data: course } = cls
    ? await raw.from('courses').select('teacher_id').eq('id', cls.course_id).single()
    : { data: null }
  if (!enrollment || (profile?.role !== 'admin' && course?.teacher_id !== user.id)) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }
  const { error } = await raw
    .from('enrollments')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { deleted: true }, error: null })
}
