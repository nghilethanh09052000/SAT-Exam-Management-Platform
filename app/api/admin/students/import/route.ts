/**
 * POST /api/admin/students/import
 * Admin-only student account import without class enrollment.
 */

import { NextResponse } from 'next/server'
import {
  StudentRowSchema,
  formatStudentImportValidationError,
} from '@/lib/utils/student-import-validation'
import { createStudentImportJobRecord } from '@/lib/jobs/student-import'
import { QUEUE_TOPICS } from '@/lib/queues/names'
import { ImportStudentsPayloadSchema } from '@/lib/queues/payloads'
import { sendQueueMessage } from '@/lib/queues/client'
import { z } from 'zod'
import { withAdmin } from '@/lib/with-auth'

export const runtime = 'nodejs'

const ImportSchema = z.object({
  students: z
    .array(StudentRowSchema)
    .min(1, 'Cần ít nhất 1 học sinh để import')
    .max(500, 'Chỉ được import tối đa 500 học sinh mỗi lần'),
})

export const POST = withAdmin(async (req, { user }) => {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ImportSchema.safeParse(body)
  if (!parsed.success) {
    const validation = formatStudentImportValidationError(parsed.error)
    return NextResponse.json(
      { data: { created: 0, skipped: 0, errors: validation.errors }, error: `Dữ liệu không hợp lệ: ${validation.summary}` },
      { status: 400 }
    )
  }

  try {
    const studentImportId = await createStudentImportJobRecord({
      requestedBy: user.id,
      classId: null,
      students: parsed.data.students,
    })

    const payload = ImportStudentsPayloadSchema.parse({
      job: 'import-students',
      studentImportId,
      requestedBy: user.id,
      classId: null,
    })

    const { messageId } = await sendQueueMessage(QUEUE_TOPICS.studentImport, payload, {
      idempotencyKey: `import-students:${studentImportId}`,
    })

    return NextResponse.json({
      data: { student_import_id: studentImportId, status: 'processing', message_id: messageId },
      error: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
})
