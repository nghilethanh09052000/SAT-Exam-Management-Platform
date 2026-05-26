/**
 * POST /api/questions/parse
 * Uploads a .docx/.pdf file, records it in file_imports, and enqueues a
 * Vercel Queue job to parse it outside the request lifecycle.
 */

import { NextResponse } from 'next/server'
import { withTeacher } from '@/lib/with-auth'
import {
  QUESTION_IMPORTS_BUCKET,
  createFileImportFromUpload,
  createServiceClient,
  deleteImportStorageObject,
  getSourceFileType,
  updateFileImportStatus,
} from '@/lib/import-files'
import { QUEUE_TOPICS } from '@/lib/queues/names'
import { ParseQuestionImportPayloadSchema } from '@/lib/queues/payloads'
import { sendQueueMessage } from '@/lib/queues/client'

export const runtime = 'nodejs'
export const maxDuration = 30

export const POST = withTeacher(async (request, { user }) => {
  const { searchParams } = new URL(request.url)
  const skipDedup = searchParams.get('skipDedup') === 'true'

  let formData: FormData
  try { formData = await request.formData() } catch {
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
    await deleteImportStorageObject(raw, QUESTION_IMPORTS_BUCKET, upload.storagePath)
    await updateFileImportStatus({
      raw,
      importId: upload.importId,
      status: 'failed',
      errorMessage: `Không thể đưa file vào hàng đợi: ${message}`,
    })
    return NextResponse.json({ data: null, error: `Không thể đưa file vào hàng đợi: ${message}` }, { status: 500 })
  }
})
