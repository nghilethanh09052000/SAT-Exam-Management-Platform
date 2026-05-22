import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { StudentRowSchema, type StudentImportError } from '@/lib/utils/student-import-validation'
import type { Database } from '@/types/database'

type RawClient = any

export const StudentImportPayloadSchema = z.object({
  students: z.array(StudentRowSchema).min(1).max(500),
  class_id: z.string().uuid().nullable().optional(),
})

type StudentImportRow = {
  id: string
  requested_by: string
  class_id: string | null
  payload: unknown
  status: string
}

export async function createStudentImportJobRecord({
  requestedBy,
  classId,
  students,
}: {
  requestedBy: string
  classId?: string | null
  students: z.infer<typeof StudentRowSchema>[]
}) {
  const raw = rawClient()
  const { data, error } = await (raw.from('student_imports') as any)
    .insert({
      requested_by: requestedBy,
      class_id: classId ?? null,
      status: 'processing',
      total_records: students.length,
      success_count: 0,
      failure_count: 0,
      payload: { students, class_id: classId ?? null },
      error_message: null,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Không thể tạo job import học sinh.')
  }

  return data.id as string
}

export async function runStudentImportJob({
  studentImportId,
}: {
  studentImportId: string
}) {
  const raw = rawClient()
  const { data, error } = await (raw.from('student_imports') as any)
    .select('id, requested_by, class_id, payload, status')
    .eq('id', studentImportId)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Không tìm thấy job import học sinh.')
  }

  const row = data as StudentImportRow
  if (['success', 'partial_success', 'failed'].includes(row.status)) {
    return { skipped: true, status: row.status }
  }

  const payload = StudentImportPayloadSchema.parse(row.payload)
  await updateStudentImport(raw, studentImportId, {
    status: 'processing',
    error_message: null,
    total_records: payload.students.length,
  })

  const result = await processStudents({
    raw,
    students: payload.students,
    classId: payload.class_id ?? row.class_id,
  })

  const failureCount = result.errors.length
  const successCount = result.created + result.enrolled + result.skipped
  const status = failureCount > 0
    ? (successCount > 0 ? 'partial_success' : 'failed')
    : 'success'

  await updateStudentImport(raw, studentImportId, {
    status,
    success_count: successCount,
    failure_count: failureCount,
    result,
    error_message: failureCount > 0 ? `${failureCount} học sinh gặp lỗi.` : null,
  })

  return result
}

async function processStudents({
  raw,
  students,
  classId,
}: {
  raw: RawClient
  students: z.infer<typeof StudentRowSchema>[]
  classId?: string | null
}) {
  let created = 0
  let enrolled = 0
  let skipped = 0
  const errors: StudentImportError[] = []

  for (const student of students) {
    let userId: string | null = null

    try {
      const { data: newUser, error: createError } = await raw.auth.admin.createUser({
        email: student.email,
        email_confirm: true,
        user_metadata: {
          role: 'student',
          full_name: student.full_name,
        },
      })

      if (createError) {
        const msg = createError.message.toLowerCase()
        if (msg.includes('already') || msg.includes('exists')) {
          const { data: authList } = await raw.auth.admin.listUsers({ perPage: 1000 })
          const existing = authList?.users.find(
            (u: { email?: string | null }) => u.email?.toLowerCase() === student.email.toLowerCase()
          )
          if (existing) {
            userId = existing.id
            skipped++
          } else {
            errors.push({
              type: 'auth',
              email: student.email,
              message: 'Tài khoản đã tồn tại nhưng không tìm thấy.',
              error: `Không thể tìm tài khoản đã tồn tại: ${student.email}`,
            })
            continue
          }
        } else {
          errors.push({
            type: 'auth',
            email: student.email,
            message: createError.message,
            error: `Không thể tạo tài khoản ${student.email}: ${createError.message}`,
          })
          continue
        }
      } else if (newUser?.user) {
        userId = newUser.user.id
        created++
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lỗi tạo tài khoản'
      errors.push({
        type: 'auth',
        email: student.email,
        message,
        error: `Không thể tạo tài khoản ${student.email}: ${message}`,
      })
      continue
    }

    if (!userId) continue

    const profileUpdate: Record<string, unknown> = { is_approved: true }
    if (student.phone) profileUpdate.phone = student.phone
    if (student.birth_year) profileUpdate.birth_year = student.birth_year
    if (student.gender) profileUpdate.gender = student.gender
    if (student.school) profileUpdate.school = student.school
    if (student.city) profileUpdate.city = student.city
    if (student.facebook_url) profileUpdate.facebook_url = student.facebook_url
    if (student.threads_url) profileUpdate.threads_url = student.threads_url
    if (student.hobbies) profileUpdate.hobbies = student.hobbies
    if (student.target_score) profileUpdate.target_score = student.target_score
    if (student.source) profileUpdate.source = student.source

    const { error: profileError } = await raw.from('profiles').update(profileUpdate).eq('id', userId)
    if (profileError) {
      errors.push({
        type: 'profile',
        email: student.email,
        message: profileError.message,
        error: `Cập nhật hồ sơ ${student.email} thất bại: ${profileError.message}`,
      })
    }

    if (!classId) continue

    try {
      const { error: enrollError } = await raw
        .from('enrollments')
        .insert({
          student_id: userId,
          class_id: classId,
          enrolled_at: new Date().toISOString(),
        })

      if (enrollError) {
        if (enrollError.code !== '23505') {
          errors.push({
            type: 'enrollment',
            email: student.email,
            message: enrollError.message,
            error: `Ghi danh ${student.email} thất bại: ${enrollError.message}`,
          })
          continue
        }
      } else {
        enrolled++
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lỗi ghi danh'
      errors.push({
        type: 'enrollment',
        email: student.email,
        message,
        error: `Ghi danh ${student.email} thất bại: ${message}`,
      })
    }
  }

  return { created, enrolled, skipped, errors }
}

async function updateStudentImport(
  raw: RawClient,
  studentImportId: string,
  patch: Record<string, unknown>
) {
  const { error } = await (raw.from('student_imports') as any)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', studentImportId)

  if (error) throw new Error(`Không thể cập nhật trạng thái import học sinh: ${error.message}`)
}

function rawClient(): RawClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
