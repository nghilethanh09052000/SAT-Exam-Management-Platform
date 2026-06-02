import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { assertTeacherOwnsClass, assertTeacherOwnsExamPaper } from '@/lib/authz'

export const runtime = 'nodejs'

const AssignSchema = z.object({
  targets: z.array(z.object({
    class_id: z.string().uuid(),
    week_id: z.string().uuid().nullable().optional(),
  })).min(1),
  deadline: z.string().datetime(),
  is_timed: z.boolean().optional(),
  time_limit_seconds: z.number().int().positive().nullable().optional(),
  show_results: z.enum(['immediately', 'after_deadline']).optional(),
  max_retakes: z.number().int().min(0).optional(),
  published_at: z.string().datetime().nullable().optional(),
  // Which student surface this test belongs to: a coursework mock test or a
  // self-practice test. Defaults to coursework to match prior behavior.
  test_type: z.enum(['coursework', 'self_practice']).optional(),
})

const REQUIRED_MODULES = [
  'Reading & Writing Module 1',
  'Reading & Writing Module 2',
  'Math Module 1',
  'Math Module 2',
]

function isValidModuleSet(modules: Set<string>) {
  return REQUIRED_MODULES.every((module) => modules.has(module))
}

export const POST = withTeacher<{ id: string }>(async (req, { user, profile, db, params }) => {
  const parsed = AssignSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const paperAuth = await assertTeacherOwnsExamPaper({ user, profile, db }, params.id)
  if (!paperAuth.ok) return NextResponse.json({ data: null, error: paperAuth.error }, { status: paperAuth.status })

  const classIds = Array.from(new Set(parsed.data.targets.map((target) => target.class_id)))
  for (const classId of classIds) {
    const classAuth = await assertTeacherOwnsClass({ user, profile, db }, classId)
    if (!classAuth.ok) return NextResponse.json({ data: null, error: classAuth.error }, { status: classAuth.status })
  }

  const { data: questions, error: qError } = await db
    .from('exam_paper_questions')
    .select('module_name')
    .eq('exam_paper_id', params.id)

  if (qError) return NextResponse.json({ data: null, error: qError.message }, { status: 400 })

  const moduleCounts = new Map<string, number>()
  for (const row of ((questions ?? []) as { module_name: string | null }[])) {
    const moduleName = (row.module_name ?? '').trim()
    if (!moduleName) continue
    moduleCounts.set(moduleName, (moduleCounts.get(moduleName) ?? 0) + 1)
  }

  if (!isValidModuleSet(new Set(moduleCounts.keys()))) {
    return NextResponse.json(
      { data: null, error: 'Practice test must contain all four SAT modules.' },
      { status: 400 }
    )
  }

  const rows = parsed.data.targets.map((target) => ({
    practice_test_id: params.id,
    class_id: target.class_id,
    week_id: target.week_id ?? null,
    deadline: parsed.data.deadline,
    is_timed: parsed.data.is_timed ?? true,
    time_limit_seconds: parsed.data.time_limit_seconds ?? null,
    show_results: parsed.data.show_results ?? 'immediately',
    max_retakes: parsed.data.max_retakes ?? 0,
    published_at: parsed.data.published_at ?? null,
    test_type: parsed.data.test_type ?? 'coursework',
    created_by: user.id,
  }))

  const { data, error } = await db
    .from('practice_test_assignments')
    .upsert(rows as never[], { onConflict: 'practice_test_id,class_id,week_id,test_type' })
    .select('id, class_id, week_id, deadline, published_at, test_type')

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})
