import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { assertTeacherOwnsExamPaper, requirePermission } from '@/lib/authz'

const UpsertQuestionsSchema = z.object({
  questions: z.array(z.object({
    question_id: z.string().uuid(),
    module_name: z.string().optional().nullable(),
    order_index: z.number().int().default(0),
    score_weight: z.number().default(1),
  })),
})

const REQUIRED_MODULES = [
  'Reading & Writing Module 1',
  'Reading & Writing Module 2',
  'Math Module 1',
  'Math Module 2',
]

export const PUT = withTeacher<{ id: string }>(async (req, { user, profile, db, params }) => {
  const cap = requirePermission({ profile }, 'exam_papers:update')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })
  const authz = await assertTeacherOwnsExamPaper({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const body = await req.json()
  const parsed = UpsertQuestionsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const modulesWithQuestions = new Set(
    parsed.data.questions
      .map((question) => question.module_name?.trim())
      .filter((moduleName): moduleName is string => Boolean(moduleName))
  )
  const missingModules = REQUIRED_MODULES.filter((moduleName) => !modulesWithQuestions.has(moduleName))
  if (missingModules.length > 0) {
    return NextResponse.json(
      { data: null, error: `Practice test requires all SAT modules. Missing: ${missingModules.join(', ')}` },
      { status: 400 }
    )
  }

  const { error: delError } = await db
    .from('exam_paper_questions')
    .delete()
    .eq('exam_paper_id', params.id)
  if (delError) return NextResponse.json({ data: null, error: delError.message }, { status: 400 })

  if (parsed.data.questions.length > 0) {
    const rows = parsed.data.questions.map((q) => ({
      exam_paper_id: params.id,
      question_id: q.question_id,
      module_name: q.module_name ?? null,
      order_index: q.order_index,
      score_weight: q.score_weight,
    }))
    const { error: insError } = await db.from('exam_paper_questions').insert(rows)
    if (insError) return NextResponse.json({ data: null, error: insError.message }, { status: 400 })
  }

  return NextResponse.json({ data: { count: parsed.data.questions.length }, error: null })
})
