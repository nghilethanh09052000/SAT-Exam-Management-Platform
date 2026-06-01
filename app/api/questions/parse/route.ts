/**
 * POST /api/questions/parse
 * Uploads a .docx/.pdf file, records it in file_imports, and enqueues a
 * Vercel Queue job to parse it outside the request lifecycle.
 */

import { NextResponse } from 'next/server'
import { withTeacher } from '@/lib/with-auth'
import {
  QUESTION_IMPORTS_BUCKET,
  createFileImportForDirectUpload,
  createFileImportFromUpload,
  createServiceClient,
  deleteImportStorageObject,
  getSourceFileType,
  updateFileImportStatus,
} from '@/lib/import-files'
import { QUEUE_TOPICS } from '@/lib/queues/names'
import { ParseQuestionImportPayloadSchema } from '@/lib/queues/payloads'
import { sendQueueMessage } from '@/lib/queues/client'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024

const DirectUploadRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create-upload'),
    filename: z.string().min(1),
    fileSize: z.number().int().positive().max(MAX_IMPORT_FILE_SIZE),
    mimeType: z.string().optional(),
    sourceContext: z.string().optional(),
  }),
  z.object({
    action: z.literal('enqueue'),
    importId: z.string().uuid(),
    skipDedup: z.boolean().optional(),
  }),
])

export const POST = withTeacher(async (request, { user }) => {
  const { searchParams } = new URL(request.url)
  const skipDedup = searchParams.get('skipDedup') === 'true'

  if (request.headers.get('content-type')?.includes('application/json')) {
    let json: unknown
    try { json = await request.json() } catch {
      return NextResponse.json({ data: null, error: 'Định dạng request không hợp lệ.' }, { status: 400 })
    }

    const parsed = DirectUploadRequestSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: 'Thông tin upload không hợp lệ.' }, { status: 400 })
    }

    const raw = createServiceClient()

    if (parsed.data.action === 'create-upload') {
      try {
        const upload = await createFileImportForDirectUpload({
          raw,
          userId: user.id,
          filename: parsed.data.filename,
          fileSize: parsed.data.fileSize,
          mimeType: parsed.data.mimeType,
          sourceContext: parsed.data.sourceContext ?? searchParams.get('source') ?? 'question_bank_upload',
        })

        return NextResponse.json({
          data: {
            upload_import_id: upload.importId,
            bucket: upload.bucket,
            storage_path: upload.storagePath,
            token: upload.signedUpload.token,
            path: upload.signedUpload.path,
            mime_type: upload.mimeType,
          },
          error: null,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Lỗi không xác định'
        return NextResponse.json({ data: null, error: message }, { status: 500 })
      }
    }

    const { data: fileImport, error: importError } = await raw
      .from('file_imports')
      .select('id, uploaded_by, storage_path')
      .eq('id', parsed.data.importId)
      .single()

    if (importError || !fileImport || fileImport.uploaded_by !== user.id) {
      return NextResponse.json({ data: null, error: 'Không tìm thấy file import.' }, { status: 404 })
    }

    const payload = ParseQuestionImportPayloadSchema.parse({
      job: 'parse-question-import',
      importId: parsed.data.importId,
      uploadedBy: user.id,
      skipDedup: parsed.data.skipDedup ?? skipDedup,
    })

    try {
      const { messageId } = await sendQueueMessage(QUEUE_TOPICS.questionImport, payload, {
        idempotencyKey: `parse-question-import:${parsed.data.importId}`,
      })
      return NextResponse.json({
        data: {
          upload_import_id: parsed.data.importId,
          storage_path: fileImport.storage_path,
          status: 'processing',
          message_id: messageId,
        },
        error: null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      await updateFileImportStatus({
        raw,
        importId: parsed.data.importId,
        status: 'failed',
        errorMessage: `Không thể đưa file vào hàng đợi: ${message}`,
      })
      return NextResponse.json({ data: null, error: `Không thể đưa file vào hàng đợi: ${message}` }, { status: 500 })
    }
  }

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

  if (file.size > MAX_IMPORT_FILE_SIZE) {
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
