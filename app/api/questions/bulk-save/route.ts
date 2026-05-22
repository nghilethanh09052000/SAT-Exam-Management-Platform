/**
 * POST /api/questions/bulk-save
 * Stores teacher-reviewed questions and enqueues a background save job.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { updateFileImportStatus } from '@/lib/import-files'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'
import {
  BulkSaveQuestionsSchema,
  storeReviewedQuestionPayload,
} from '@/lib/jobs/question-import'
import { QUEUE_TOPICS } from '@/lib/queues/names'
import { SaveQuestionImportPayloadSchema } from '@/lib/queues/payloads'
import { createClient } from '@supabase/supabase-js'
import { sendQueueMessage } from '@/lib/queues/client'

export const runtime = 'nodejs'

function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) {
    return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  }
  if (!isTeacherOrAdmin(profile)) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
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

    const raw = rawClient()
    await updateFileImportStatus({
      raw,
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
      data: {
        upload_import_id: uploadImportId,
        status: 'processing',
        message_id: messageId,
      },
      error: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
