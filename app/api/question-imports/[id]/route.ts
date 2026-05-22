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

  const { data: fileImport, error } = await supabase
    .from('file_imports')
    .select('id, uploaded_by, original_filename, storage_path, file_type, status, total_records, success_count, failure_count, error_message, created_at, updated_at')
    .eq('id', params.id)
    .single()

  if (error || !fileImport) {
    return NextResponse.json({ data: null, error: error?.message ?? 'Không tìm thấy import.' }, { status: 404 })
  }

  if (profile?.role !== 'admin' && (fileImport as { uploaded_by: string }).uploaded_by !== user.id) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  const { data: result } = await (supabase.from('file_import_results') as any)
    .select('parsed_payload, reviewed_payload, parse_errors, save_errors, save_result')
    .eq('import_id', params.id)
    .maybeSingle()

  const fileImportData = fileImport as Record<string, unknown>

  return NextResponse.json({
    data: {
      ...fileImportData,
      parsed_payload: result?.parsed_payload ?? null,
      reviewed_payload: result?.reviewed_payload ?? null,
      parse_errors: result?.parse_errors ?? null,
      save_errors: result?.save_errors ?? null,
      save_result: result?.save_result ?? null,
    },
    error: null,
  })
}
