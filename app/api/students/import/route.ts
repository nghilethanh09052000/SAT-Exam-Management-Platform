/**
 * POST /api/students/import
 *
 * Unified student import for Admin and Teacher.
 * - Creates Supabase auth accounts for new students (service role).
 * - Sets is_approved = true on their profiles.
 * - Enrolls all students (new + existing) into the specified class.
 *
 * Auth rules:
 *   Admin → can import to any class.
 *   Teacher → can only import to a class inside one of their own courses.
 *
 * Body: { students: StudentRow[], class_id: string }
 * Returns: { data: { created, enrolled, skipped, errors[] }, error }
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {
  StudentRowSchema,
  type StudentImportError,
  formatStudentImportValidationError,
} from '@/lib/utils/student-import-validation'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const runtime = 'nodejs'

// ─── Validation ───────────────────────────────────────────────────────────────

const ImportSchema = z.object({
  students: z
    .array(StudentRowSchema)
    .min(1, 'Cần ít nhất 1 học sinh để import')
    .max(500, 'Chỉ được import tối đa 500 học sinh mỗi lần'),
  class_id: z.string().uuid('class_id không hợp lệ'),
})

// ─── Service-role client ──────────────────────────────────────────────────────

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
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

  // ── 2. Parse body ──────────────────────────────────────────────────────────
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

  // ── 3. Validate class ownership and active course status ───────────────────
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

  if (role === 'teacher') {
    if (course.teacher_id !== user.id) {
      return NextResponse.json({ data: null, error: 'Bạn không có quyền import vào lớp này.' }, { status: 403 })
    }
  }

  // ── 4. Create accounts + enroll ────────────────────────────────────────────
  const raw = adminClient()
  let created = 0
  let enrolled = 0
  let skipped = 0
  const errors: StudentImportError[] = []

  for (const student of students) {
    let userId: string | null = null

    // ── 4a. Create or find auth user ──────────────────────────────────────
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
          // Student exists — look up their ID
          const { data: authList } = await raw.auth.admin.listUsers({ perPage: 1000 })
          const existing = authList?.users.find(
            (u) => u.email?.toLowerCase() === student.email.toLowerCase()
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

    // ── 4b. Update profile (is_approved + extra fields) ───────────────────
    const profileUpdate: Record<string, unknown> = { is_approved: true }
    if (student.phone)        profileUpdate.phone        = student.phone
    if (student.birth_year)   profileUpdate.birth_year   = student.birth_year
    if (student.gender)       profileUpdate.gender       = student.gender
    if (student.school)       profileUpdate.school       = student.school
    if (student.city)         profileUpdate.city         = student.city
    if (student.facebook_url) profileUpdate.facebook_url = student.facebook_url
    if (student.threads_url)  profileUpdate.threads_url  = student.threads_url
    if (student.hobbies)      profileUpdate.hobbies      = student.hobbies
    if (student.target_score) profileUpdate.target_score = student.target_score
    if (student.source)       profileUpdate.source       = student.source

    const { error: profileError } = await raw.from('profiles').update(profileUpdate).eq('id', userId)
    if (profileError) {
      errors.push({
        type: 'profile',
        email: student.email,
        message: profileError.message,
        error: `Cập nhật hồ sơ ${student.email} thất bại: ${profileError.message}`,
      })
    }

    // ── 4c. Enroll in class (upsert — ignore duplicate enrollment) ─────────
    try {
      const { error: enrollError } = await raw
        .from('enrollments')
        .insert({
          student_id:  userId,
          class_id,
          enrolled_at: new Date().toISOString(),
        })

      if (enrollError) {
        // 23505 = unique constraint — already enrolled, that's fine
        if (enrollError.code !== '23505') {
          errors.push({
            type: 'enrollment',
            email: student.email,
            message: enrollError.message,
            error: `Ghi danh ${student.email} thất bại: ${enrollError.message}`,
          })
          continue
        }
        // already enrolled → count as skipped (not double-counted with account skipped)
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

  return NextResponse.json({
    data: { created, enrolled, skipped, errors },
    error: errors.length > 0 ? `${errors.length} học sinh gặp lỗi.` : null,
  })
}
