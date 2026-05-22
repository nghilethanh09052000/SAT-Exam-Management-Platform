/**
 * POST /api/admin/students/import
 *
 * Bulk-creates student accounts from a parsed Excel list.
 * Each row becomes a Supabase Auth user (email_confirmed = true) so the
 * student can sign in immediately with Google using that email.
 *
 * The `handle_new_user` DB trigger auto-creates the profiles row from
 * user_metadata, so no manual INSERT into profiles is needed.
 *
 * Body:  { students: Array<{ full_name, email, phone? }> }
 * Returns: { data: { created, skipped, errors[] }, error }
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

const ImportSchema = z.object({
  students: z
    .array(StudentRowSchema)
    .min(1, 'Cần ít nhất 1 học sinh để import')
    .max(500, 'Chỉ được import tối đa 500 học sinh mỗi lần'),
})

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(req: Request) {
  // ── Auth: admin only ────────────────────────────────────────────────────
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as { role: string }).role !== 'admin') {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse body ──────────────────────────────────────────────────────────
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

  // ── Create users ────────────────────────────────────────────────────────
  const raw = adminClient()
  let created = 0
  let skipped = 0
  const errors: StudentImportError[] = []

  for (const student of parsed.data.students) {
    try {
      const { data: newUser, error: createError } = await raw.auth.admin.createUser({
        email: student.email,
        email_confirm: true,       // skip email verification — admin pre-approved
        user_metadata: {
          role: 'student',
          full_name: student.full_name,
        },
      })

      if (createError) {
        // "User already registered" — treat as skip, not an error
        const msg = createError.message.toLowerCase()
        if (msg.includes('already') || msg.includes('exists')) {
          skipped++
        } else {
          errors.push({
            type: 'auth',
            email: student.email,
            message: createError.message,
            error: `Không thể tạo tài khoản ${student.email}: ${createError.message}`,
          })
        }
        continue
      }

      // Profile was auto-created by handle_new_user trigger.
      // Mark as admin-approved so the OAuth callback lets them through.
      // Also update phone if provided (trigger doesn't set phone).
      if (newUser?.user) {
        const { error: profileError } = await raw
          .from('profiles')
          .update({
            is_approved: true,
            ...(student.phone        ? { phone:        student.phone        } : {}),
            ...(student.birth_year   ? { birth_year:   student.birth_year   } : {}),
            ...(student.gender       ? { gender:       student.gender       } : {}),
            ...(student.school       ? { school:       student.school       } : {}),
            ...(student.city         ? { city:         student.city         } : {}),
            ...(student.facebook_url ? { facebook_url: student.facebook_url } : {}),
            ...(student.threads_url  ? { threads_url:  student.threads_url  } : {}),
            ...(student.hobbies      ? { hobbies:      student.hobbies      } : {}),
            ...(student.target_score ? { target_score: student.target_score } : {}),
            ...(student.source       ? { source:       student.source       } : {}),
          })
          .eq('id', newUser.user.id)

        if (profileError) {
          errors.push({
            type: 'profile',
            email: student.email,
            message: profileError.message,
            error: `Tạo tài khoản thành công nhưng cập nhật hồ sơ ${student.email} thất bại: ${profileError.message}`,
          })
        }
      }

      created++
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      errors.push({
        type: 'unknown',
        email: student.email,
        message,
        error: `Không thể xử lý ${student.email}: ${message}`,
      })
    }
  }

  return NextResponse.json({
    data: { created, skipped, errors },
    error: errors.length > 0 ? `${errors.length} học sinh không thể tạo.` : null,
  })
}
