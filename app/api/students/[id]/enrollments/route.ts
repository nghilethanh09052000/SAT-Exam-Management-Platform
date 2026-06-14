/**
 * GET /api/students/[id]/enrollments
 * Returns enrollments (with class + course info) for a single student.
 */

import { NextResponse } from 'next/server'
import { withTeacher } from '@/lib/with-auth'
import { requirePermission } from '@/lib/authz'

type EnrollmentRow = {
  id: string
  enrolled_at: string
  class_id: string
  classes: {
    id: string
    title: string
    course_id: string
    courses: { id: string; title: string; end_date: string; expires_at: string | null } | null
  } | null
}

export const GET = withTeacher<{ id: string }>(async (_req, { profile, db, params }) => {
  const cap = requirePermission({ profile }, 'students:view')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })

  const { data, error } = await db
    .from('enrollments')
    .select('id, enrolled_at, class_id, classes(id, title, course_id, courses(id, title, end_date, expires_at))')
    .eq('student_id', params.id)
    .order('enrolled_at', { ascending: false })

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

  const enrollments = ((data ?? []) as unknown as EnrollmentRow[]).map((row) => ({
    id: row.id,
    enrolled_at: row.enrolled_at,
    class_id: row.class_id,
    class_title: row.classes?.title ?? '—',
    course_id: row.classes?.course_id ?? '',
    course_title: row.classes?.courses?.title ?? '—',
    course_end_date: row.classes?.courses?.end_date ?? null,
    course_expires_at: row.classes?.courses?.expires_at ?? null,
  }))

  return NextResponse.json({ data: enrollments, error: null })
})
