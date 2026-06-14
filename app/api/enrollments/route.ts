/**
 * POST /api/enrollments — enroll a single student in a class.
 * GET  /api/enrollments?class_id=xxx — list students enrolled in a class.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher, withAnyAuth } from '@/lib/with-auth'
import { requirePermission, requireClassScope } from '@/lib/authz'

const EnrollSchema = z.object({
  class_id: z.string().min(1),
  student_id: z.string().min(1),
})

export const GET = withAnyAuth(async (request, { profile, db }) => {
  const { searchParams } = new URL(request.url)
  const classId = searchParams.get('class_id')
  if (!classId) return NextResponse.json({ data: null, error: 'Thiếu class_id.' }, { status: 400 })

  const cap = requirePermission({ profile }, 'students:view')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })
  const scope = requireClassScope({ profile }, classId)
  if (!scope.ok) return NextResponse.json({ data: null, error: scope.error }, { status: scope.status })

  const { data, error } = await db
    .from('enrollments')
    .select('id, student_id, enrolled_at, profiles(id, full_name, phone, is_active, birth_year, gender, school, city, facebook_url, threads_url, hobbies, target_score, source)')
    .eq('class_id', classId)
    .order('enrolled_at', { ascending: true })

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
})

export const POST = withTeacher(async (request, { profile, db }) => {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ data: null, error: 'Body không hợp lệ.' }, { status: 400 })
  }

  const parsed = EnrollSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const { class_id, student_id } = parsed.data

  const cap = requirePermission({ profile }, 'students:create')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })
  const scope = requireClassScope({ profile }, class_id)
  if (!scope.ok) return NextResponse.json({ data: null, error: scope.error }, { status: scope.status })

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

  const { data: cls } = await db
    .from('classes')
    .select('id, archived_at, courses(teacher_id, end_date, expires_at, archived_at)')
    .eq('id', class_id)
    .single()

  const clsTyped = cls as ClassWithCourse | null
  const course = Array.isArray(clsTyped?.courses) ? clsTyped?.courses[0] : clsTyped?.courses
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  if (!clsTyped || clsTyped.archived_at || !course || course.archived_at || course.end_date < today || (course.expires_at && course.expires_at < now)) {
    return NextResponse.json({ data: null, error: 'Lớp học không còn hoạt động.' }, { status: 400 })
  }

  const { data, error } = await db
    .from('enrollments')
    .upsert({ class_id, student_id }, { onConflict: 'class_id,student_id', ignoreDuplicates: true })
    .select('id, class_id, student_id, enrolled_at')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null }, { status: 201 })
})
