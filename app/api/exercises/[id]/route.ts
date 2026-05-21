import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type ExerciseInfo = {
  id: string; title: string; description: string | null
  difficulty: string; category: string; estimated_minutes: number
}

type EqRow = {
  order_index: number
  questions: {
    id: string; content: string; type: string; image_url: string | null
    question_options: { id: string; label: string; content: string; is_correct: boolean }[]
    question_accepted_answers: { answer_text: string }[]
  } | null
}

type AttemptRow = { id: string }

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: exercise, error } = await sb
    .from('exercises')
    .select('id, title, description, difficulty, category, estimated_minutes')
    .eq('id', params.id)
    .eq('is_published', true)
    .single() as { data: ExerciseInfo | null; error: unknown }

  if (error || !exercise) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: eqs } = await sb
    .from('exercise_questions')
    .select('order_index, questions(id, content, type, image_url, question_options(id, label, content, is_correct), question_accepted_answers(answer_text))')
    .eq('exercise_id', params.id)
    .order('order_index', { ascending: true }) as { data: EqRow[] | null }

  const questions = (eqs ?? []).map((eq) => {
    const q = eq.questions
    if (!q) return null
    return {
      id: q.id,
      content: q.content,
      passageText: null,
      questionType: q.type,
      imageUrl: q.image_url,
      options: q.question_options,
      acceptedAnswers: q.question_accepted_answers.map((a) => a.answer_text),
    }
  }).filter(Boolean)

  const { data: existing } = await sb
    .from('exercise_attempts')
    .select('id')
    .eq('student_id', user.id)
    .eq('exercise_id', params.id)
    .eq('status', 'in_progress')
    .maybeSingle() as { data: AttemptRow | null }

  let attemptId = existing?.id
  if (!attemptId) {
    const { data: created } = await sb
      .from('exercise_attempts')
      .insert({ student_id: user.id, exercise_id: params.id, total_questions: questions.length })
      .select('id')
      .single() as { data: AttemptRow | null }
    attemptId = created?.id
  }

  return NextResponse.json({ exercise, questions, attemptId })
}
