import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher, withAnyAuth } from '@/lib/with-auth'
import { assertTeacherOwnsExamPaper } from '@/lib/authz'

const UpdateExamPaperSchema = z.object({
  title: z.string().min(1).optional(),
  source: z.string().optional().nullable(),
  year: z.number().int().min(2000).max(2100).optional().nullable(),
  description: z.string().optional().nullable(),
  is_public: z.boolean().optional(),
})

export const GET = withAnyAuth<{ id: string }>(async (_req, { db, params }) => {
  const { data: paper, error: pError } = await db
    .from('exam_papers')
    .select('id, title, source, year, description, is_public, created_by, created_at, updated_at')
    .eq('id', params.id)
    .is('archived_at', null)
    .single()

  if (pError || !paper) {
    return NextResponse.json({ data: null, error: pError?.message ?? 'Not found' }, { status: 404 })
  }

  const { data: questions, error: qError } = await db
    .from('exam_paper_questions')
    .select('id, order_index, module_name, score_weight, question:questions(id, type, content, difficulty)')
    .eq('exam_paper_id', params.id)
    .order('module_name', { ascending: true })
    .order('order_index', { ascending: true })

  if (qError) return NextResponse.json({ data: null, error: qError.message }, { status: 400 })
  return NextResponse.json({ data: { ...(paper as Record<string, unknown>), questions: questions ?? [] }, error: null })
})

export const PATCH = withTeacher<{ id: string }>(async (req, { user, profile, db, params }) => {
  const authz = await assertTeacherOwnsExamPaper({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const body = await req.json()
  const parsed = UpdateExamPaperSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const { data, error } = await db
    .from('exam_papers')
    .update(parsed.data)
    .eq('id', params.id)
    .select('id, title')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})

export const DELETE = withTeacher<{ id: string }>(async (_req, { user, profile, db, params }) => {
  const authz = await assertTeacherOwnsExamPaper({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const { error } = await db
    .from('exam_papers')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data: { ok: true }, error: null })
})
