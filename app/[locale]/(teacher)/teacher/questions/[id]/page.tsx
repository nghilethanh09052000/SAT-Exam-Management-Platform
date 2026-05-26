import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { renderMathInHtml } from '@/lib/math-html'
import { getTranslations, setRequestLocale } from 'next-intl/server'

interface PageProps {
  params: { id: string; locale: string }
}

function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

interface QuestionRow {
  id: string
  type: string
  content: string
  difficulty: string | null
  teacher_explanation: string | null
  created_at: string
}

interface OptionRow {
  id: string
  label: string
  content: string
  is_correct: boolean
  order: number
}

interface AnswerRow {
  id: string
  answer_text: string
}

interface TagRow {
  tags: { id: string; subject: string; name: string } | null
}

const DIFFICULTY_VARIANTS: Record<string, 'success' | 'warning' | 'error'> = {
  easy: 'success', medium: 'warning', hard: 'error',
}

export default async function QuestionDetailPage({ params }: PageProps) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.questions')
  const tNav = await getTranslations('nav')
  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'
  const supabase = createServerClient()
  const raw = rawClient()

  // Fire all four queries in parallel — we already know the ID from the URL,
  // so we don't need the question row before starting the related queries.
  const [questionResult, optionsResult, answersResult, tagsResult] = await Promise.all([
    supabase
      .from('questions')
      .select('id, type, content, difficulty, teacher_explanation, created_at')
      .eq('id', params.id)
      .single(),
    raw
      .from('question_options')
      .select('id, label, content, is_correct, order')
      .eq('question_id', params.id)
      .order('order'),
    raw
      .from('question_accepted_answers')
      .select('id, answer_text')
      .eq('question_id', params.id),
    raw
      .from('question_tags')
      .select('tags(id, subject, name)')
      .eq('question_id', params.id),
  ])

  const question = questionResult.data as QuestionRow | null
  if (!question) notFound()

  const options: OptionRow[] = (optionsResult.data as OptionRow[] | null) ?? []
  const answers: AnswerRow[] = (answersResult.data as AnswerRow[] | null) ?? []
  const tags: TagRow[] = (tagsResult.data as TagRow[] | null) ?? []

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t('detailTitle')}
        breadcrumbs={[
          { label: tNav('questionBank'), href: '/teacher/questions' },
          { label: t('breadcrumbDetail') },
        ]}
        action={
          <Link href={`/teacher/questions/${params.id}/edit`}>
            <Button variant="secondary" size="sm">{t('editBtn')}</Button>
          </Link>
        }
      />

      <div className="space-y-5">
        {/* Header badges */}
        <div className="flex items-center gap-2">
          {question.type === 'multiple_choice' ? (
            <Badge variant="info">{t('typeMc')}</Badge>
          ) : (
            <Badge variant="default">{t('typeSa')}</Badge>
          )}
          {question.difficulty && (
            <Badge variant={DIFFICULTY_VARIANTS[question.difficulty] ?? 'default'}>
              {t(`diff${question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1)}` as Parameters<typeof t>[0])}
            </Badge>
          )}
          {tags.map((t, i) => t.tags && (
            <Badge key={i} variant="muted">{t.tags.name}</Badge>
          ))}
          <span className="ml-auto text-xs text-mute-light">
            {new Date(question.created_at).toLocaleDateString(dateLocale)}
          </span>
        </div>

        {/* Question content */}
        <Card className="p-6">
          <p className="text-sm font-medium text-mute-light mb-2">{t('labelContent')}</p>
          <div
            className="text-base text-ink leading-relaxed [&_img]:my-3 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg"
            dangerouslySetInnerHTML={{ __html: renderMathInHtml(question.content) }}
          />
        </Card>

        {/* Multiple choice options */}
        {question.type === 'multiple_choice' && options.length > 0 && (
          <Card className="p-6">
            <p className="text-sm font-medium text-mute-light mb-3">{t('labelOptions')}</p>
            <div className="space-y-2">
              {options.map((opt) => (
                <div
                  key={opt.id}
                  className={[
                    'flex items-center gap-3 px-4 py-3 rounded-lg',
                    opt.is_correct
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-surface-soft',
                  ].join(' ')}
                >
                  <div className={[
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                    opt.is_correct ? 'bg-green-500 text-white' : 'bg-ash-light text-ink',
                  ].join(' ')}>
                    {opt.label}
                  </div>
                  <div
                    className={['text-sm [&_img]:max-w-full [&_img]:h-auto', opt.is_correct ? 'text-green-700 font-medium' : 'text-ink'].join(' ')}
                    dangerouslySetInnerHTML={{ __html: renderMathInHtml(opt.content) }}
                  />
                  {opt.is_correct && (
                    <span className="ml-auto text-xs text-green-600 font-medium shrink-0">{t('correctLabel')}</span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Short answer accepted answers */}
        {question.type === 'short_answer' && answers.length > 0 && (
          <Card className="p-6">
            <p className="text-sm font-medium text-mute-light mb-3">{t('labelAccepted')}</p>
            <div className="flex flex-wrap gap-2">
              {answers.map((a) => (
                <span
                  key={a.id}
                  className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium"
                >
                  {a.answer_text}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Teacher explanation */}
        {question.teacher_explanation && (
          <Card className="p-6">
            <p className="text-sm font-medium text-mute-light mb-2">{t('labelExplanation')}</p>
            <div
              className="text-sm text-ink leading-relaxed [&_img]:my-2 [&_img]:max-w-full [&_img]:h-auto"
              dangerouslySetInnerHTML={{ __html: renderMathInHtml(question.teacher_explanation) }}
            />
          </Card>
        )}
      </div>
    </div>
  )
}
