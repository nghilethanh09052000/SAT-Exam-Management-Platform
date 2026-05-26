import { NextResponse } from 'next/server'
import { withTeacher } from '@/lib/with-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTeacher<{ id: string }>(async (_request, { user, profile, db, params }) => {
  const { data: fileImport, error } = await (db as any)
    .from('file_imports')
    .select('id, uploaded_by, original_filename, storage_path, file_type, status, total_records, success_count, failure_count, error_message, created_at, updated_at')
    .eq('id', params.id)
    .single()

  if (error || !fileImport) {
    return NextResponse.json({ data: null, error: error?.message ?? 'Không tìm thấy import.' }, { status: 404 })
  }

  if (profile.role !== 'admin' && (fileImport as { uploaded_by: string }).uploaded_by !== user.id) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  const { data: result } = await (db as any)
    .from('file_import_results')
    .select('parsed_payload, reviewed_payload, parse_errors, save_errors, save_result')
    .eq('import_id', params.id)
    .maybeSingle()

  return NextResponse.json({
    data: {
      ...(fileImport as Record<string, unknown>),
      parsed_payload:   result?.parsed_payload   ?? null,
      reviewed_payload: result?.reviewed_payload ?? null,
      parse_errors:     result?.parse_errors     ?? null,
      save_errors:      result?.save_errors      ?? null,
      save_result:      result?.save_result      ?? null,
    },
    error: null,
  })
})
