/**
 * DELETE /api/enrollments/:id — remove a student enrollment.
 */

import { NextResponse } from 'next/server'
import { withTeacher } from '@/lib/with-auth'

export const DELETE = withTeacher<{ id: string }>(async (_request, { user, profile, db, params }) => {
  const { data: enrollment } = await db.from('enrollments').select('class_id').eq('id', params.id).single()
  const { data: cls } = enrollment
    ? await db.from('classes').select('course_id').eq('id', enrollment.class_id).single()
    : { data: null }
  const { data: course } = cls
    ? await db.from('courses').select('teacher_id').eq('id', cls.course_id).single()
    : { data: null }

  if (!enrollment || (profile.role !== 'admin' && course?.teacher_id !== user.id)) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await db.from('enrollments').delete().eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: { deleted: true }, error: null })
})
