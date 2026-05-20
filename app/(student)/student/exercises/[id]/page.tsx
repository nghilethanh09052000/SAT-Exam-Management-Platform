import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ExerciseClient } from '@/components/student/exercise-client'

type ExerciseInfo = {
  id: string; title: string; description: string | null
  difficulty: string; category: string; estimated_minutes: number
}

type EqRow = {
  order_index: number
  questions: {
    id: string; content: string; passage_text: string | null
    question_type: string; image_url: string | null
    question_options: { id: string; label: string; content: string; is_correct: boolean }[]
    question_accepted_answers: { answer_text: string }[]
  } | null
}

type AttemptRow = { id: string }

const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' }
const DIFFICULTY_COLOR: Record<string, string> = {
  easy:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  hard:   'bg-rose-50 text-rose-700 border-rose-200',
}

export default async function ExerciseDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: exercise } = await sb
    .from('exercises')
    .select('id, title, description, difficulty, category, estimated_minutes')
    .eq('id', params.id)
    .eq('is_published', true)
    .maybeSingle() as { data: ExerciseInfo | null }

  if (!exercise) notFound()

  const { data: eqs } = await sb
    .from('exercise_questions')
    .select('order_index, questions(id, content, passage_text, question_type, image_url, question_options(id, label, content, is_correct), question_accepted_answers(answer_text))')
    .eq('exercise_id', params.id)
    .order('order_index', { ascending: true }) as { data: EqRow[] | null }

  const questions = (eqs ?? [])
    .map((eq) => {
      const q = eq.questions
      if (!q) return null
      return {
        id: q.id,
        content: q.content,
        passageText: q.passage_text,
        questionType: q.question_type,
        imageUrl: q.image_url,
        options: q.question_options,
        acceptedAnswers: q.question_accepted_answers.map((a) => a.answer_text),
      }
    })
    .filter((q): q is NonNullable<typeof q> => q !== null)

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

  if (!attemptId) notFound()

  const diffStyle = DIFFICULTY_COLOR[exercise.difficulty] ?? DIFFICULTY_COLOR.medium

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/student/exercises"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6d7cff] hover:text-[#4f7cff]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Quay lại danh sách
        </Link>

        <div className="mt-4 overflow-hidden rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-black ${diffStyle}`}>
                  {DIFFICULTY_LABEL[exercise.difficulty] ?? exercise.difficulty}
                </span>
                <span className="rounded-full border border-[#e0e6f7] bg-[#f0f4ff] px-3 py-1 text-xs font-bold capitalize text-[#5b72f6]">
                  {exercise.category.replace('_', ' ')}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-black text-[#252837] md:text-3xl">{exercise.title}</h1>
              {exercise.description && (
                <p className="mt-2 text-sm font-medium text-[#7b8295]">{exercise.description}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-4 text-center">
              <div className="rounded-2xl bg-[#f5f8ff] px-4 py-3">
                <p className="text-xl font-black text-[#4f7cff]">{questions.length}</p>
                <p className="text-xs font-bold text-[#8a91a3]">câu hỏi</p>
              </div>
              <div className="rounded-2xl bg-[#f5f8ff] px-4 py-3">
                <p className="text-xl font-black text-[#4f7cff]">~{exercise.estimated_minutes}</p>
                <p className="text-xs font-bold text-[#8a91a3]">phút</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-[24px] border border-white/80 bg-white/90 p-10 text-center shadow-sm">
          <p className="text-lg font-bold text-[#7b8295]">Bài tập này chưa có câu hỏi nào.</p>
          <Link href="/student/exercises" className="mt-4 inline-block text-sm font-black text-[#4f7cff] hover:underline">
            Quay lại danh sách
          </Link>
        </div>
      ) : (
        <ExerciseClient
          exerciseId={params.id}
          attemptId={attemptId}
          title={exercise.title}
          questions={questions}
        />
      )}
    </div>
  )
}
