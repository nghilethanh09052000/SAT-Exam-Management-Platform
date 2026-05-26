import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAnyAuth } from '@/lib/with-auth'

export const runtime = 'nodejs'

const CreateAttemptSchema = z.object({
  exam_paper_id: z.string().uuid(),
})

export const POST = withAnyAuth(async (req, { user, db }) => {
  const parsed = CreateAttemptSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const { data: paper } = await db
    .from('exam_papers')
    .select('id')
    .eq('id', parsed.data.exam_paper_id)
    .eq('is_public', true as never)
    .is('archived_at', null)
    .single()

  if (!paper) return NextResponse.json({ data: null, error: 'Public test not found' }, { status: 404 })

  const { data: existing } = await db
    .from('public_exam_attempts')
    .select('id, status, started_at, current_question_id, current_module')
    .eq('exam_paper_id', parsed.data.exam_paper_id)
    .eq('student_id', user.id)
    .eq('status', 'in_progress' as never)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return NextResponse.json({ data: existing, error: null })

  const { count } = await db
    .from('public_exam_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('exam_paper_id', parsed.data.exam_paper_id)
    .eq('student_id', user.id)

  const { data, error } = await db
    .from('public_exam_attempts')
    .insert({
      exam_paper_id: parsed.data.exam_paper_id,
      student_id: user.id,
      attempt_number: (count ?? 0) + 1,
    } as never)
    .select('id, status, started_at, current_question_id, current_module')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})
