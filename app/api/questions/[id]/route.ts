import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { withTeacher } from '@/lib/with-auth'
import { assertTeacherOwnsQuestion } from '@/lib/authz'

const OptionSchema = z.object({
  label: z.string(),
  content: z.string(),
  is_correct: z.boolean(),
})

const UpdateQuestionSchema = z.object({
  content: z.string().min(1).optional(),
  type: z.enum(['multiple_choice', 'short_answer']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
  ai_explanation: z.string().nullable().optional(),
  teacher_explanation: z.string().nullable().optional(),
  archived_at: z.string().nullable().optional(),
  options: z.array(OptionSchema).optional(),
  accepted_answers: z.array(z.string()).optional(),
  tag_ids: z.array(z.string().min(1)).optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('questions')
    .select(
      'id, type, content, difficulty, content_hash, ai_explanation, teacher_explanation, created_at, created_by, question_options(id, label, content, is_correct, order), question_accepted_answers(id, answer_text)'
    )
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
  return NextResponse.json({ data, error: null })
}

export const PATCH = withTeacher<{ id: string }>(async (req, { user, profile, db, params }) => {
  const body = await req.json()
  const parsed = UpdateQuestionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const authz = await assertTeacherOwnsQuestion({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const { options, accepted_answers, tag_ids, ...questionFields } = parsed.data

  const { data, error } = await db
    .from('questions')
    .update({ ...questionFields, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, content')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  if (options !== undefined) {
    await db.from('question_options').delete().eq('question_id', params.id)
    if (options.length > 0) {
      await db.from('question_options').insert(
        options.map((o, i) => ({
          question_id: params.id,
          label: o.label,
          content: o.content,
          is_correct: o.is_correct,
          order: i + 1,
        }))
      )
    }
  }

  if (accepted_answers !== undefined) {
    await db.from('question_accepted_answers').delete().eq('question_id', params.id)
    const valid = accepted_answers.filter((a) => a.trim())
    if (valid.length > 0) {
      await db.from('question_accepted_answers').insert(
        valid.map((a) => ({ question_id: params.id, answer_text: a.trim() }))
      )
    }
  }

  if (tag_ids !== undefined) {
    await db.from('question_tags').delete().eq('question_id', params.id)
    if (tag_ids.length > 0) {
      await db.from('question_tags').insert(
        tag_ids.map((tagId) => ({ question_id: params.id, tag_id: tagId }))
      )
    }
  }

  revalidatePath('/teacher/questions')
  revalidatePath(`/teacher/questions/${params.id}`)
  return NextResponse.json({ data, error: null })
})

export const DELETE = withTeacher<{ id: string }>(async (_req, { user, profile, db, params }) => {
  const authz = await assertTeacherOwnsQuestion({ user, profile, db }, params.id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const { error } = await db
    .from('questions')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  revalidatePath('/teacher/questions')
  return NextResponse.json({ data: { success: true }, error: null })
})
