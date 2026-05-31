import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAnyAuth } from '@/lib/with-auth'

export const runtime = 'nodejs'

const UpdateProgressSchema = z.object({
  current_question_id: z.string().uuid().nullable().optional(),
  current_module: z.string().nullable().optional(),
})

export const GET = withAnyAuth<{ id: string }>(async (_req, { user, db, params }) => {
  const { data, error } = await db
    .from('practice_test_attempts')
    .select('id, status, raw_score, total_questions')
    .eq('id', params.id)
    .eq('student_id', user.id)
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
  return NextResponse.json({ data, error: null })
})

export const PATCH = withAnyAuth<{ id: string }>(async (req, { user, db, params }) => {
  const parsed = UpdateProgressSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { data: attempt } = await db
    .from('practice_test_attempts')
    .select('id, status')
    .eq('id', params.id)
    .eq('student_id', user.id)
    .single()

  if (!attempt) return NextResponse.json({ data: null, error: 'Attempt not found' }, { status: 404 })
  if ((attempt as { status: string }).status !== 'in_progress') {
    return NextResponse.json({ data: null, error: 'Attempt already completed' }, { status: 409 })
  }

  const { data, error } = await db
    .from('practice_test_attempts')
    .update({ ...parsed.data, updated_at: new Date().toISOString() } as never)
    .eq('id', params.id)
    .select('id, current_question_id, current_module')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})
