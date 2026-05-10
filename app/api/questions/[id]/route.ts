import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const OptionSchema = z.object({
  label: z.string(),
  content: z.string(),
  is_correct: z.boolean(),
})

const UpdateQuestionSchema = z.object({
  content: z.string().min(1).optional(),
  type: z.enum(['multiple_choice', 'short_answer']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
  teacher_explanation: z.string().nullable().optional(),
  archived_at: z.string().nullable().optional(),
  options: z.array(OptionSchema).optional(),
  accepted_answers: z.array(z.string()).optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('questions')
    .select(
      'id, type, content, difficulty, content_hash, ai_explanation, teacher_explanation, created_at, created_by'
    )
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
  return NextResponse.json({ data, error: null })
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const parsed = UpdateQuestionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  const raw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

  // Separate options/answers from question fields
  const { options, accepted_answers, ...questionFields } = parsed.data

  const { data, error } = await raw
    .from('questions')
    .update({ ...questionFields, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, content')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  // Update options if provided
  if (options !== undefined) {
    await raw.from('question_options').delete().eq('question_id', params.id)
    if (options.length > 0) {
      await raw.from('question_options').insert(
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

  // Update accepted answers if provided
  if (accepted_answers !== undefined) {
    await raw.from('question_accepted_answers').delete().eq('question_id', params.id)
    const validAnswers = accepted_answers.filter((a) => a.trim())
    if (validAnswers.length > 0) {
      await raw.from('question_accepted_answers').insert(
        validAnswers.map((a) => ({ question_id: params.id, answer_text: a.trim() }))
      )
    }
  }

  return NextResponse.json({ data, error: null })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  const raw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await raw
    .from('questions')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data: { success: true }, error: null })
}
