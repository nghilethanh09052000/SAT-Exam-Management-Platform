/**
 * DELETE /api/enrollments/:id — remove a student enrollment.
 */

import { NextResponse } from 'next/server'
import { withTeacher } from '@/lib/with-auth'
import { requirePermission, requireClassScope } from '@/lib/authz'

export const DELETE = withTeacher<{ id: string }>(async (_request, { profile, db, params }) => {
  const { data: enrollment } = await db.from('enrollments').select('class_id').eq('id', params.id).single()
  if (!enrollment) return NextResponse.json({ data: null, error: 'Enrollment not found' }, { status: 404 })

  const cap = requirePermission({ profile }, 'students:delete')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })
  const scope = requireClassScope({ profile }, enrollment.class_id)
  if (!scope.ok) return NextResponse.json({ data: null, error: scope.error }, { status: scope.status })

  const { error } = await db.from('enrollments').delete().eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: { deleted: true }, error: null })
})
