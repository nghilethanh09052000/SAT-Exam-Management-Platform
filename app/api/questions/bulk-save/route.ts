/**
 * POST /api/questions/bulk-save
 * Stores teacher-reviewed questions and enqueues a background save job.
 */

import { NextResponse } from 'next/server'
import { withTeacher } from '@/lib/with-auth'
import { requirePermission } from '@/lib/authz'
import { updateFileImportStatus } from '@/lib/import-files'
import {
  BulkSaveQuestionsSchema,
  storeReviewedQuestionPayload,
} from '@/lib/jobs/question-import'
import { QUEUE_TOPICS } from '@/lib/queues/names'
import { SaveQuestionImportPayloadSchema } from '@/lib/queues/payloads'
import { sendQueueMessage } from '@/lib/queues/client'

export const runtime = 'nodejs'

export const POST = withTeacher(async (request, { user, profile, db }) => {
  const cap = requirePermission({ profile }, 'questions:create')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ data: null, error: 'Request body không hợp lệ.' }, { status: 400 })
  }

  const parsed = BulkSaveQuestionsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: `Dữ liệu không hợp lệ: ${parsed.error.message}` },
      { status: 400 }
    )
  }

  const uploadImportId = parsed.data.upload_import_id
  if (!uploadImportId) {
    return NextResponse.json({ data: null, error: 'Thiếu upload_import_id để lưu nền.' }, { status: 400 })
  }

  try {
    await storeReviewedQuestionPayload({
      importId: uploadImportId,
      questions: parsed.data.questions,
    })

    await updateFileImportStatus({
      raw: db as any,
      importId: uploadImportId,
      status: 'processing',
      totalRecords: parsed.data.questions.length,
      errorMessage: null,
    })

    const payload = SaveQuestionImportPayloadSchema.parse({
      job: 'save-question-import',
      importId: uploadImportId,
      requestedBy: user.id,
    })

    const { messageId } = await sendQueueMessage(QUEUE_TOPICS.questionImport, payload, {
      idempotencyKey: `save-question-import:${uploadImportId}`,
    })

    return NextResponse.json({
      data: { upload_import_id: uploadImportId, status: 'processing', message_id: messageId },
      error: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
})
