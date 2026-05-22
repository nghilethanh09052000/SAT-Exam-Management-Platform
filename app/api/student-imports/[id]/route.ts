import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) {
    return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  }
  if (!isTeacherOrAdmin(profile)) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await (supabase.from('student_imports') as any)
    .select('id, requested_by, class_id, status, total_records, success_count, failure_count, result, error_message, created_at, updated_at')
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ data: null, error: error?.message ?? 'Không tìm thấy import.' }, { status: 404 })
  }

  if (profile?.role !== 'admin' && data.requested_by !== user.id) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ data, error: null })
}
