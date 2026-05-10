import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createRawClient } from '@/lib/supabase/raw-client'
import { z } from 'zod'

const CreateQuestionSchema = z.object({
  type: z.enum(['multiple_choice', 'short_answer']),
  content: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
  content_hash: z.string(),
  teacher_explanation: z.string().nullable().optional(),
  options: z
    .array(
      z.object({
        label: z.string(),
        content: z.string(),
        is_correct: z.boolean(),
        order: z.number().int(),
      })
    )
    .optional(),
  accepted_answers: z.array(z.string()).optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
})

export async function GET(req: Request) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const difficulty = searchParams.get('difficulty')
  const search = searchParams.get('search')

  let query = supabase
    .from('questions')
    .select(
      'id, type, content, difficulty, content_hash, ai_explanation, teacher_explanation, created_at, created_by'
    )
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (difficulty) {
    query = query.eq('difficulty', difficulty)
  }
  if (search) {
    query = query.ilike('content', `%${search}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateQuestionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { options, accepted_answers, tag_ids, ...questionData } = parsed.data

  const raw = createRawClient()

  // Insert question
  const { data: question, error: qError } = await raw
    .from('questions')
    .insert({ ...questionData, created_by: user.id })
    .select('id, content')
    .single()

  if (qError) return NextResponse.json({ data: null, error: qError.message }, { status: 400 })

  // Insert options
  if (options && options.length > 0) {
    const { error: oError } = await raw
      .from('question_options')
      .insert(options.map((o) => ({ ...o, question_id: question.id })))
    if (oError) return NextResponse.json({ data: null, error: oError.message }, { status: 400 })
  }

  // Insert accepted answers
  if (accepted_answers && accepted_answers.length > 0) {
    const { error: aError } = await raw
      .from('question_accepted_answers')
      .insert(accepted_answers.map((a) => ({ question_id: question.id, answer_text: a })))
    if (aError) return NextResponse.json({ data: null, error: aError.message }, { status: 400 })
  }

  // Insert tags
  if (tag_ids && tag_ids.length > 0) {
    const { error: tError } = await raw
      .from('question_tags')
      .insert(tag_ids.map((tid) => ({ question_id: question.id, tag_id: tid })))
    if (tError) return NextResponse.json({ data: null, error: tError.message }, { status: 400 })
  }

  return NextResponse.json({ data: question, error: null })
}
