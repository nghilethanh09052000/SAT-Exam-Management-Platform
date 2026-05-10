/**
 * POST /api/questions/parse
 * Accepts a multipart/form-data upload with a single `file` field (.docx).
 * Runs the Mammoth parser and returns the structured question list for review.
 * Nothing is saved to the database here — that happens in /api/questions/bulk-save.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseDocx } from '@/lib/parsers/docx-parser'

export const runtime = 'nodejs' // Mammoth needs Node.js (not Edge)
export const maxDuration = 30   // allow up to 30s for large files

export async function POST(request: Request) {
  // Auth check
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  }

  // Parse multipart form
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ data: null, error: 'Định dạng request không hợp lệ.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ data: null, error: 'Vui lòng tải lên file .docx.' }, { status: 400 })
  }

  if (!file.name.endsWith('.docx')) {
    return NextResponse.json({ data: null, error: 'Chỉ chấp nhận file định dạng .docx.' }, { status: 400 })
  }

  if (file.size > 20 * 1024 * 1024) { // 20 MB cap
    return NextResponse.json({ data: null, error: 'File quá lớn. Tối đa 20MB.' }, { status: 400 })
  }

  // Read into ArrayBuffer and parse
  let result
  try {
    const arrayBuffer = await file.arrayBuffer()
    result = await parseDocx(arrayBuffer)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return NextResponse.json({ data: null, error: `Lỗi phân tích file: ${message}` }, { status: 500 })
  }

  if (!result.success) {
    // Return parse errors so the teacher can fix the document
    return NextResponse.json(
      {
        data: null,
        error: 'File không đúng định dạng.',
        parseErrors: result.errors,
      },
      { status: 422 }
    )
  }

  if (result.questions.length === 0) {
    return NextResponse.json(
      { data: null, error: 'Không tìm thấy câu hỏi nào trong file.' },
      { status: 422 }
    )
  }

  // Check for duplicate content hashes already in the DB
  const hashes = result.questions.map((q) => q.content_hash)
  const { data: existing } = await supabase
    .from('questions')
    .select('content_hash')
    .in('content_hash', hashes)

  const existingHashes = new Set((existing ?? []).map((r) => r.content_hash as string))

  // Annotate each question with a duplicate flag
  const annotated = result.questions.map((q) => ({
    ...q,
    is_duplicate: existingHashes.has(q.content_hash),
  }))

  return NextResponse.json({
    data: {
      questions: annotated,
      total: annotated.length,
      duplicates: annotated.filter((q) => q.is_duplicate).length,
    },
    error: null,
  })
}
