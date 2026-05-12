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
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const runtime = 'nodejs'

// ─── Validation ───────────────────────────────────────────────────────────────

const StudentRowSchema = z.object({
  full_name:    z.string().min(1, 'Họ tên không được để trống'),
  email:        z.string().email('Email không hợp lệ'),
  phone:        z.string().optional().nullable(),
  birth_year:   z.number().int().min(1990).max(2020).optional().nullable(),
  gender:       z.string().optional().nullable(),
  school:       z.string().optional().nullable(),
  city:         z.string().optional().nullable(),
  facebook_url: z.string().optional().nullable(),
  threads_url:  z.string().optional().nullable(),
  hobbies:      z.string().optional().nullable(),
  target_score: z.number().int().min(400).max(1600).optional().nullable(),
  source:       z.string().optional().nullable(),
})

const ImportSchema = z.object({
  students: z.array(StudentRowSchema).min(1).max(500),
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
    const firstErr = parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ'
    return NextResponse.json({ data: null, error: firstErr }, { status: 400 })
  }

  const { students, class_id } = parsed.data

  // ── 3. Validate class ownership (teacher only) ─────────────────────────────
  if (role === 'teacher') {
    const { data: cls } = await supabase
      .from('classes')
      .select('id, courses!inner(teacher_id)')
      .eq('id', class_id)
      .is('archived_at', null)
      .single()

    type ClassWithCourse = {
      id: string
      courses: { teacher_id: string } | { teacher_id: string }[]
    }
    const clsTyped = cls as ClassWithCourse | null

    if (!clsTyped) {
      return NextResponse.json({ data: null, error: 'Lớp học không tồn tại.' }, { status: 404 })
    }

    const teacherId = Array.isArray(clsTyped.courses)
      ? clsTyped.courses[0]?.teacher_id
      : clsTyped.courses?.teacher_id

    if (teacherId !== user.id) {
      return NextResponse.json({ data: null, error: 'Bạn không có quyền import vào lớp này.' }, { status: 403 })
    }
  } else {
    // Admin: just confirm the class exists
    const { data: cls } = await supabase
      .from('classes')
      .select('id')
      .eq('id', class_id)
      .single()

    if (!cls) {
      return NextResponse.json({ data: null, error: 'Lớp học không tồn tại.' }, { status: 404 })
    }
  }

  // ── 4. Create accounts + enroll ────────────────────────────────────────────
  const raw = adminClient()
  let created = 0
  let enrolled = 0
  let skipped = 0
  const errors: { email: string; error: string }[] = []

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
            errors.push({ email: student.email, error: 'Tài khoản đã tồn tại nhưng không tìm thấy.' })
            continue
          }
        } else {
          errors.push({ email: student.email, error: createError.message })
          continue
        }
      } else if (newUser?.user) {
        userId = newUser.user.id
        created++
      }
    } catch (err) {
      errors.push({ email: student.email, error: err instanceof Error ? err.message : 'Lỗi tạo tài khoản' })
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

    await raw.from('profiles').update(profileUpdate).eq('id', userId)

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
          errors.push({ email: student.email, error: `Ghi danh thất bại: ${enrollError.message}` })
          continue
        }
        // already enrolled → count as skipped (not double-counted with account skipped)
      } else {
        enrolled++
      }
    } catch (err) {
      errors.push({ email: student.email, error: err instanceof Error ? err.message : 'Lỗi ghi danh' })
    }
  }

  return NextResponse.json({
    data: { created, enrolled, skipped, errors },
    error: errors.length > 0 ? `${errors.length} học sinh gặp lỗi.` : null,
  })
}
