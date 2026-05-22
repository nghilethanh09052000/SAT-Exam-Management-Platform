/**
 * POST /api/questions/parse
 * Uploads a .docx/.pdf file, records it in file_imports, and enqueues a
 * Vercel Queue job to parse it outside the request lifecycle.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'
import {
  createFileImportFromUpload,
  createServiceClient,
  getSourceFileType,
} from '@/lib/import-files'
import { QUEUE_TOPICS } from '@/lib/queues/names'
import { ParseQuestionImportPayloadSchema } from '@/lib/queues/payloads'
import { sendQueueMessage } from '@/lib/queues/client'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const skipDedup = searchParams.get('skipDedup') === 'true'

  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) {
    return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  }
  if (!isTeacherOrAdmin(profile)) {
    return NextResponse.json({ data: null, error: 'Bạn không có quyền tải file.' }, { status: 403 })
  }

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

  if (file.size > 50 * 1024 * 1024) {
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

  const payload = ParseQuestionImportPayloadSchema.parse({
    job: 'parse-question-import',
    importId: upload.importId,
    uploadedBy: user.id,
    skipDedup,
  })

  try {
    const { messageId } = await sendQueueMessage(QUEUE_TOPICS.questionImport, payload, {
      idempotencyKey: `parse-question-import:${upload.importId}`,
    })

    return NextResponse.json({
      data: {
        upload_import_id: upload.importId,
        storage_path: upload.storagePath,
        status: 'processing',
        message_id: messageId,
      },
      error: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return NextResponse.json({ data: null, error: `Không thể đưa file vào hàng đợi: ${message}` }, { status: 500 })
  }
}
