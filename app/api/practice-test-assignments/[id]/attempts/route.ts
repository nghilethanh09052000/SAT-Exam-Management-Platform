import { NextResponse } from 'next/server'
import { withAnyAuth } from '@/lib/with-auth'
import { canCreateAttempt } from '@/lib/utils/submission-rules'

export const runtime = 'nodejs'

type AssignmentRow = {
  id: string
  class_id: string
  deadline: string
  max_retakes: number
  published_at: string | null
}

export const POST = withAnyAuth<{ id: string }>(async (_req, { user, db, params }) => {
  const { data: assignment } = await db
    .from('practice_test_assignments')
    .select('id, class_id, deadline, max_retakes, published_at')
    .eq('id', params.id)
    .maybeSingle()

  const row = assignment as AssignmentRow | null
  if (!row || !row.published_at) {
    return NextResponse.json({ data: null, error: 'Practice test assignment not found' }, { status: 404 })
  }

  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('student_id', user.id)
    .eq('class_id', row.class_id)
    .maybeSingle()

  if (!enrollment) return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  if (new Date(row.deadline).getTime() <= Date.now()) {
    return NextResponse.json({ data: null, error: 'Practice test deadline has passed' }, { status: 400 })
  }

  const { data: existing } = await db
    .from('practice_test_attempts')
    .select('id, status, started_at, current_question_id, current_module')
    .eq('practice_test_assignment_id', params.id)
    .eq('student_id', user.id)
    .eq('status', 'in_progress' as never)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return NextResponse.json({ data: existing, error: null })

  const { data: attempts } = await db
    .from('practice_test_attempts')
    .select('id, status')
    .eq('practice_test_assignment_id', params.id)
    .eq('student_id', user.id)

  const usedAttempts = ((attempts ?? []) as { status: string }[])
    .filter((attempt) => attempt.status === 'submitted' || attempt.status === 'grading')
    .length

  if (!canCreateAttempt(usedAttempts, row.max_retakes)) {
    return NextResponse.json({ data: null, error: 'Retake limit reached' }, { status: 409 })
  }

  const { data, error } = await db
    .from('practice_test_attempts')
    .insert({
      practice_test_assignment_id: params.id,
      student_id: user.id,
      attempt_number: usedAttempts + 1,
    } as never)
    .select('id, status, started_at, current_question_id, current_module')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})
