import { getCachedUser, createServerClient } from '@/lib/supabase/server'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { StreakCard } from '@/components/student/streak-card'
import { ExerciseCard } from '@/components/student/exercise-card'
import { EmptyState } from '@/components/ui/empty-state'

type ExerciseRow = {
  id: string
  title: string
  description: string | null
  difficulty: 'easy' | 'medium' | 'hard'
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

type StreakRow = {
  current_streak: number
  longest_streak: number
  last_activity_date: string | null
  total_days_active: number
}

type ActivityRow = {
  activity_date: string
  exercises_completed: number
}

export default async function ExercisesPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.exercises')
  const CATEGORY_LABELS: Record<string, string> = {
    math:            t('categoryMath'),
    reading_writing: t('categoryReadingWriting'),
    grammar:         t('categoryGrammar'),
    vocabulary:      t('categoryVocabulary'),
    general:         t('categoryGeneral'),
  }
  const user = await getCachedUser()
  if (!user) return null
  const supabase = createServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const since = new Date()
  since.setDate(since.getDate() - 111)

  const [
    { data: exercisesRaw },
    { data: attemptsRaw },
    { data: streakRaw },
    { data: activityRaw },
  ] = await Promise.all([
    sb.from('exercises')
      .select('id, title, description, difficulty, category, estimated_minutes, exercise_questions(count)')
      .eq('is_published', true)
      .order('created_at', { ascending: false }) as Promise<{ data: ExerciseRow[] | null }>,

    sb.from('exercise_attempts')
      .select('exercise_id, correct_count, total_questions, completed_at')
      .eq('student_id', user.id)
      .eq('status', 'completed')
      .order('correct_count', { ascending: false }) as Promise<{ data: AttemptRow[] | null }>,

    sb.from('student_streaks')
      .select('current_streak, longest_streak, last_activity_date, total_days_active')
      .eq('student_id', user.id)
      .maybeSingle() as Promise<{ data: StreakRow | null }>,

    sb.from('daily_activity')
      .select('activity_date, exercises_completed')
      .eq('student_id', user.id)
      .gte('activity_date', since.toISOString().slice(0, 10))
      .order('activity_date', { ascending: true }) as Promise<{ data: ActivityRow[] | null }>,
  ])

  const exercises = exercisesRaw ?? []
  const attempts = attemptsRaw ?? []
  const streak: StreakRow = streakRaw ?? { current_streak: 0, longest_streak: 0, last_activity_date: null, total_days_active: 0 }
  const activity = activityRaw ?? []

  const bestByExercise = new Map<string, { correct: number; total: number; completedAt: string | null }>()
  for (const a of attempts) {
    if (!bestByExercise.has(a.exercise_id)) {
      bestByExercise.set(a.exercise_id, { correct: a.correct_count, total: a.total_questions, completedAt: a.completed_at })
    }
  }

  // Group by category
  const grouped = new Map<string, ExerciseRow[]>()
  for (const ex of exercises) {
    if (!grouped.has(ex.category)) grouped.set(ex.category, [])
    grouped.get(ex.category)!.push(ex)
  }
  const categories = Array.from(grouped.keys())

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6d7cff]">{t('sectionLabel')}</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-[#232635] md:text-5xl">
          {t('bankTitle')}
        </h1>
        <p className="mt-2 text-base font-medium text-[#778095]">
          {t('subtitle')}
        </p>
      </div>

      <StreakCard streak={streak} activity={activity} />

      {exercises.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDesc')}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-10">
          {categories.map((cat) => {
            const catExercises = grouped.get(cat) ?? []
            return (
              <section key={cat}>
                <h2 className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-[#8c94a8]">
                  {CATEGORY_LABELS[cat] ?? cat}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {catExercises.map((ex) => {
                    const best = bestByExercise.get(ex.id)
                    const qCount = Array.isArray(ex.exercise_questions)
                      ? ex.exercise_questions.reduce((s, r) => s + (r.count ?? 0), 0)
                      : 0
                    return (
                      <ExerciseCard
                        key={ex.id}
                        id={ex.id}
                        title={ex.title}
                        description={ex.description}
                        difficulty={ex.difficulty}
                        category={ex.category}
                        estimatedMinutes={ex.estimated_minutes}
                        questionCount={qCount}
                        bestScore={best ? { correct: best.correct, total: best.total } : null}
                        completedAt={best?.completedAt ?? null}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
