import { NextResponse } from 'next/server'
import { withTeacher } from '@/lib/with-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTeacher<{ id: string }>(async (_request, { user, profile, db, params }) => {
  const { data, error } = await (db as any)
    .from('student_imports')
    .select('id, requested_by, class_id, status, total_records, success_count, failure_count, result, error_message, created_at, updated_at')
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ data: null, error: error?.message ?? 'Không tìm thấy import.' }, { status: 404 })
  }

  if (profile.role !== 'admin' && data.requested_by !== user.id) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ data, error: null })
})
