/**
 * POST /api/students/import
 *
 * Validates an admin/teacher class import and enqueues background student
 * account creation/enrollment.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {
  StudentRowSchema,
  formatStudentImportValidationError,
} from '@/lib/utils/student-import-validation'
import { createStudentImportJobRecord } from '@/lib/jobs/student-import'
import { QUEUE_TOPICS } from '@/lib/queues/names'
import { ImportStudentsPayloadSchema } from '@/lib/queues/payloads'
import { sendQueueMessage } from '@/lib/queues/client'
import { z } from 'zod'

export const runtime = 'nodejs'

const ImportSchema = z.object({
  students: z
    .array(StudentRowSchema)
    .min(1, 'Cần ít nhất 1 học sinh để import')
    .max(500, 'Chỉ được import tối đa 500 học sinh mỗi lần'),
  class_id: z.string().uuid('class_id không hợp lệ'),
})

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile as { role: string } | null)?.role
  if (role !== 'admin' && role !== 'teacher') {
    return NextResponse.json({ data: null, error: 'Không có quyền truy cập.' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ data: null, error: 'Body không hợp lệ.' }, { status: 400 })
  }

  const parsed = ImportSchema.safeParse(body)
  if (!parsed.success) {
    const validation = formatStudentImportValidationError(parsed.error)
    return NextResponse.json(
      { data: { created: 0, enrolled: 0, skipped: 0, errors: validation.errors }, error: `Dữ liệu không hợp lệ: ${validation.summary}` },
      { status: 400 }
    )
  }

  const { students, class_id } = parsed.data

  type ClassWithCourse = {
    id: string
    archived_at: string | null
    courses: {
      teacher_id: string
      end_date: string
      expires_at: string | null
      archived_at: string | null
    } | {
      teacher_id: string
      end_date: string
      expires_at: string | null
      archived_at: string | null
    }[] | null
  }

  const { data: classData } = await supabase
    .from('classes')
    .select('id, archived_at, courses!inner(teacher_id, end_date, expires_at, archived_at)')
    .eq('id', class_id)
    .single()

  const clsTyped = classData as ClassWithCourse | null
  const course = Array.isArray(clsTyped?.courses) ? clsTyped?.courses[0] : clsTyped?.courses
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  if (!clsTyped || clsTyped.archived_at || !course || course.archived_at || course.end_date < today || (course.expires_at && course.expires_at < now)) {
    return NextResponse.json({ data: null, error: 'Lớp học không còn hoạt động.' }, { status: 400 })
  }

  if (role === 'teacher' && course.teacher_id !== user.id) {
    return NextResponse.json({ data: null, error: 'Bạn không có quyền import vào lớp này.' }, { status: 403 })
  }

  try {
    const studentImportId = await createStudentImportJobRecord({
      requestedBy: user.id,
      classId: class_id,
      students,
    })

    const payload = ImportStudentsPayloadSchema.parse({
      job: 'import-students',
      studentImportId,
      requestedBy: user.id,
      classId: class_id,
    })

    const { messageId } = await sendQueueMessage(QUEUE_TOPICS.studentImport, payload, {
      idempotencyKey: `import-students:${studentImportId}`,
    })

    return NextResponse.json({
      data: {
        student_import_id: studentImportId,
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
