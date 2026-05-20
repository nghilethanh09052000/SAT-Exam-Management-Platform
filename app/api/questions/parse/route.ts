/**
 * POST /api/questions/parse
 * Accepts a multipart/form-data upload with a single `file` field (.docx).
 * Runs the Mammoth parser and returns the structured question list for review.
 * The original .docx/.pdf file is stored in Supabase Storage and tracked in file_imports.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseDocx } from '@/lib/parsers/docx-parser'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'
import {
  createFileImportFromUpload,
  createServiceClient,
  getSourceFileType,
  updateFileImportStatus,
} from '@/lib/import-files'

export const runtime = 'nodejs' // Mammoth needs Node.js (not Edge)
export const maxDuration = 30   // allow up to 30s for large files

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const skipDedup = searchParams.get('skipDedup') === 'true'

  // Auth check
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) {
    return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  }
  if (!isTeacherOrAdmin(profile)) {
    return NextResponse.json({ data: null, error: 'Bạn không có quyền tải file.' }, { status: 403 })
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
    return NextResponse.json({ data: null, error: 'Vui lòng tải lên file .docx hoặc .pdf.' }, { status: 400 })
  }

  const fileType = getSourceFileType(file)
  if (!fileType) {
    return NextResponse.json({ data: null, error: 'Chỉ chấp nhận file định dạng .docx hoặc .pdf.' }, { status: 400 })
  }

  if (file.size > 50 * 1024 * 1024) { // 50 MB cap, aligned with storage bucket
    return NextResponse.json({ data: null, error: 'File quá lớn. Tối đa 50MB.' }, { status: 400 })
  }

  const raw = createServiceClient()
  let upload
  try {
    upload = await createFileImportFromUpload({
      raw,
      userId: user.id,
      file,
      sourceContext: searchParams.get('source') ?? 'question_bank_upload',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }

  // Parse the uploaded DOCX/PDF buffer.
  let result
  try {
    if (upload.fileType === 'pdf') {
      const { parsePdf } = await import('@/lib/parsers/pdf-parser')
      result = await parsePdf(upload.arrayBuffer)
    } else {
      result = await parseDocx(upload.arrayBuffer)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    await updateFileImportStatus({
      raw,
      importId: upload.importId,
      status: 'failed',
      errorMessage: `Lỗi phân tích file: ${message}`,
    })
    return NextResponse.json({ data: null, error: `Lỗi phân tích file: ${message}` }, { status: 500 })
  }

  if (!result.success) {
    await updateFileImportStatus({
      raw,
      importId: upload.importId,
      status: 'failed',
      failureCount: result.errors.length,
      errorMessage: 'File không đúng định dạng.',
    })
    // Return parse errors so the teacher can fix the document
    return NextResponse.json(
      {
        data: null,
        error: 'File không đúng định dạng.',
        upload_import_id: upload.importId,
        parseErrors: result.errors,
      },
      { status: 422 }
    )
  }

  if (result.questions.length === 0) {
    await updateFileImportStatus({
      raw,
      importId: upload.importId,
      status: 'failed',
      errorMessage: 'Không tìm thấy câu hỏi nào trong file.',
    })
    return NextResponse.json(
      {
        data: null,
        error: 'Không tìm thấy câu hỏi nào trong file.',
        upload_import_id: upload.importId,
      },
      { status: 422 }
    )
  }

  // Check for duplicate content hashes already in the DB (skip when called from wizard upload)
  let existingHashes = new Set<string>()
  if (!skipDedup) {
    const hashes = result.questions.map((q) => q.contentHash)
    const { data: existing } = await supabase
      .from('questions')
      .select('content_hash')
      .in('content_hash', hashes) as { data: { content_hash: string }[] | null }
    existingHashes = new Set((existing ?? []).map((r) => r.content_hash))
  }

  // Normalize to snake_case for the client (easier JSON serialization across the wire)
  const annotated = result.questions.map((q) => ({
    content: q.content,
    type: q.type,
    content_hash: q.contentHash,
    image_url: null as string | null,  // base64 images not yet uploaded — Phase 1
    module: q.module,
    options: q.options.map((o, i) => ({
      label: o.label,
      content: o.content,
      is_correct: o.isCorrect,
      order: i + 1,
    })),
    accepted_answers: q.acceptedAnswers,
    is_duplicate: existingHashes.has(q.contentHash),
  }))

  await updateFileImportStatus({
    raw,
    importId: upload.importId,
    status: 'parsed',
    totalRecords: annotated.length,
    failureCount: 0,
    errorMessage: null,
  })

  return NextResponse.json({
    data: {
      upload_import_id: upload.importId,
      storage_path: upload.storagePath,
      questions: annotated,
      total: annotated.length,
      duplicates: annotated.filter((q) => q.is_duplicate).length,
    },
    error: null,
  })
}
