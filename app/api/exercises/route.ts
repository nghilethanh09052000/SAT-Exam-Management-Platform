import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type ExerciseRow = {
  id: string
  title: string
  description: string | null
  difficulty: string
  category: string
  estimated_minutes: number
  exercise_questions: { count: number }[]
}

type AttemptRow = {
  exercise_id: string
  correct_count: number
  total_questions: number
  completed_at: string | null
}

export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: exercises, error } = await sb
    .from('exercises')
    .select('id, title, description, difficulty, category, estimated_minutes, exercise_questions(count)')
    .eq('is_published', true)
    .order('created_at', { ascending: false }) as { data: ExerciseRow[] | null; error: { message: string } | null }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const exerciseIds = (exercises ?? []).map((e) => e.id)
  const { data: attempts } = exerciseIds.length > 0
    ? await sb
        .from('exercise_attempts')
        .select('exercise_id, correct_count, total_questions, completed_at')
        .eq('student_id', user.id)
        .eq('status', 'completed')
        .in('exercise_id', exerciseIds)
        .order('correct_count', { ascending: false }) as { data: AttemptRow[] | null }
    : { data: [] as AttemptRow[] }

  const bestByExercise = new Map<string, { correct: number; total: number; completedAt: string | null }>()
  for (const attempt of attempts ?? []) {
    if (!bestByExercise.has(attempt.exercise_id)) {
      bestByExercise.set(attempt.exercise_id, {
        correct: attempt.correct_count,
        total: attempt.total_questions,
        completedAt: attempt.completed_at,
      })
    }
  }

  const result = (exercises ?? []).map((e) => {
    const qCount = Array.isArray(e.exercise_questions)
      ? e.exercise_questions.reduce((sum, row) => sum + (row.count ?? 0), 0)
      : 0
    const best = bestByExercise.get(e.id)
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      difficulty: e.difficulty,
      category: e.category,
      estimatedMinutes: e.estimated_minutes,
      questionCount: qCount,
      bestScore: best ? { correct: best.correct, total: best.total } : null,
      completedAt: best?.completedAt ?? null,
    }
  })

  return NextResponse.json(result)
}
