import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { assertTeacherOwnsExamPaper } from '@/lib/authz'

const UpsertQuestionsSchema = z.object({
  // Array of questions to add/replace for this paper
  questions: z.array(z.object({
    question_id: z.string().uuid(),
    module_name: z.string().optional().nullable(),
    order_index: z.number().int().default(0),
    score_weight: z.number().default(1),
  })),
})

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// PUT /api/exam-papers/[id]/questions — replace all questions for a paper
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const authz = await assertTeacherOwnsExamPaper(supabase, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const body = await req.json()
  const parsed = UpsertQuestionsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const raw = serviceRole()

  // Delete existing questions for this paper
  const { error: delError } = await raw
    .from('exam_paper_questions')
    .delete()
    .eq('exam_paper_id', params.id)

  if (delError) return NextResponse.json({ data: null, error: delError.message }, { status: 400 })

  // Insert new questions
  if (parsed.data.questions.length > 0) {
    const rows = parsed.data.questions.map((q) => ({
      exam_paper_id: params.id,
      question_id: q.question_id,
      module_name: q.module_name ?? null,
      order_index: q.order_index,
      score_weight: q.score_weight,
    }))

    const { error: insError } = await raw
      .from('exam_paper_questions')
      .insert(rows)

    if (insError) return NextResponse.json({ data: null, error: insError.message }, { status: 400 })
  }

  return NextResponse.json({ data: { count: parsed.data.questions.length }, error: null })
}
