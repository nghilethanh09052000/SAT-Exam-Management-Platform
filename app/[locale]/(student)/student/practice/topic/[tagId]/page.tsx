import { getCachedUser } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { ExerciseClient } from '@/components/student/exercise-client'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

type TagRow = { id: string; name: string; subject: 'reading_writing' | 'math' }
type LinkRow = { question_id: string; questions: { id: string; difficulty: string | null; created_at: string } | null }
type FullQuestion = {
  id: string
  content: string
  stimulus: string | null
  type: string
  image_url: string | null
  question_options: { id: string; label: string; content: string; is_correct: boolean }[]
  question_accepted_answers: { answer_text: string }[]
}

const DIFFICULTIES = new Set(['easy', 'medium', 'hard'])

function clampInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number.parseInt(raw ?? '', 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export default async function TopicPracticePage({
  params,
  searchParams,
}: {
  params: { locale: string; tagId: string }
  searchParams: { n?: string; offset?: string; difficulty?: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.practice')
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const limit = clampInt(searchParams.n, 12, 1, 30)
  const offset = clampInt(searchParams.offset, 0, 0, 5000)
  const difficulty = DIFFICULTIES.has(searchParams.difficulty ?? '') ? searchParams.difficulty! : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = serviceClient() as any

  const { data: tag } = (await sb
    .from('tags')
    .select('id, name, subject')
    .eq('id', params.tagId)
    .maybeSingle()) as { data: TagRow | null }
  if (!tag) notFound()

  // Resolve which questions belong to this drill (stable created_at + id order).
  let linkQuery = sb
    .from('question_tags')
    .select('question_id, questions!inner(id, difficulty, created_at)')
    .eq('tag_id', tag.id)
    .is('questions.archived_at', null)
  if (difficulty) linkQuery = linkQuery.eq('questions.difficulty', difficulty)

  const { data: linkRows } = (await linkQuery) as { data: LinkRow[] | null }
  const ordered = (linkRows ?? [])
    .filter((r): r is LinkRow & { questions: NonNullable<LinkRow['questions']> } => Boolean(r.questions))
    .sort((a, b) => {
      const byDate = a.questions.created_at.localeCompare(b.questions.created_at)
      return byDate !== 0 ? byDate : a.questions.id.localeCompare(b.questions.id)
    })
  const slice = ordered.slice(offset, offset + limit)
  const ids = slice.map((r) => r.questions.id)

  let questions: { id: string; content: string; passageText: string | null; questionType: string; imageUrl: string | null; options: FullQuestion['question_options']; acceptedAnswers: string[] }[] = []
  if (ids.length > 0) {
    const { data: full } = (await sb
      .from('questions')
      .select('id, content, stimulus, type, image_url, question_options(id, label, content, is_correct), question_accepted_answers(answer_text)')
      .in('id', ids)) as { data: FullQuestion[] | null }

    const byId = new Map((full ?? []).map((q) => [q.id, q]))
    questions = ids
      .map((id) => byId.get(id))
      .filter((q): q is FullQuestion => Boolean(q))
      .map((q) => ({
        id: q.id,
        content: q.content,
        passageText: q.stimulus,
        questionType: q.type,
        imageUrl: q.image_url,
        options: q.question_options,
        acceptedAnswers: q.question_accepted_answers.map((a) => a.answer_text),
      }))
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/student/practice?tab=topics"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6d7cff] hover:text-[#4f7cff]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('backToTopics')}
        </Link>

        <div className="mt-4 overflow-hidden rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#e0e6f7] bg-[#f0f4ff] px-3 py-1 text-xs font-bold text-[#5b72f6]">
                  {tag.subject === 'math' ? t('subjectMath') : t('subjectReadingWriting')}
                </span>
                {difficulty && (
                  <span className="rounded-full border border-[#e0e6f7] bg-white px-3 py-1 text-xs font-bold capitalize text-[#6a7286]">
                    {t(`difficulty.${difficulty}` as 'difficulty.easy')}
                  </span>
                )}
              </div>
              <h1 className="mt-3 text-2xl font-black text-[#252837] md:text-3xl">{tag.name}</h1>
              <p className="mt-2 text-sm font-medium text-[#7b8295]">{t('drillSubtitle')}</p>
            </div>
            <div className="rounded-2xl bg-[#f5f8ff] px-4 py-3 text-center">
              <p className="text-xl font-black text-[#4f7cff]">{questions.length}</p>
              <p className="text-xs font-bold text-[#8a91a3]">{t('questionsUnit')}</p>
            </div>
          </div>
        </div>
      </div>

      {questions.length === 0 ? (
        <EmptyState title={t('drillEmptyTitle')} description={t('drillEmptyDesc')} />
      ) : (
        <ExerciseClient
          exerciseId=""
          attemptId=""
          title={tag.name}
          questions={questions}
          completeUrl="/api/student/practice/complete"
          redirectHref="/student/practice?tab=topics"
        />
      )}
    </div>
  )
}
