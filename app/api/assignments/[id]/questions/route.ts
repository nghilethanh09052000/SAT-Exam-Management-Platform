/**
 * GET  /api/assignments/:id/questions — ordered question list for an assignment.
 * POST /api/assignments/:id/questions — replace all questions for an assignment.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher, withAnyAuth } from '@/lib/with-auth'
import { assertTeacherOwnsAssignment, requirePermission } from '@/lib/authz'

const SetQuestionsSchema = z.object({
  question_ids: z.array(z.string().min(1)).min(1),
})

export const GET = withAnyAuth<{ id: string }>(async (_req, { db, params }) => {
  const { data, error } = await db
    .from('assignment_questions')
    .select('id, question_id, order, questions(id, type, content, difficulty)')
    .eq('assignment_id', params.id)
    .order('order', { ascending: true })

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})

export const POST = withTeacher<{ id: string }>(async (req, { user, profile, db, params }) => {
  const cap = requirePermission({ profile }, 'assignments:update')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })
  const authz = await assertTeacherOwnsAssignment({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const body = await req.json()
  const parsed = SetQuestionsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  await db.from('assignment_questions').delete().eq('assignment_id', params.id)

  const rows = parsed.data.question_ids.map((qid, idx) => ({
    assignment_id: params.id,
    question_id: qid,
    order: idx + 1,
  }))

  const { error } = await db.from('assignment_questions').insert(rows)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: { set: rows.length }, error: null })
})
