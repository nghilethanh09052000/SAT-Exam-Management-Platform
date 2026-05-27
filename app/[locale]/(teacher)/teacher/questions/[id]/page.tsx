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
  subject: string | null
  content: string
  stimulus: string | null
  prompt: string | null
  difficulty: string | null
  teacher_explanation: string | null
  ai_explanation: string | null
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute-light">{children}</p>
}

function HtmlBlock({ html, className = '' }: { html: string; className?: string }) {
  return (
    <div
      className={['text-base text-ink leading-relaxed [&_img]:my-3 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg', className].join(' ')}
      dangerouslySetInnerHTML={{ __html: renderMathInHtml(html) }}
    />
  )
}

export default async function QuestionDetailPage({ params }: PageProps) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.questions')
  const tNav = await getTranslations('nav')
  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'
  const supabase = createServerClient()
  const raw = rawClient()

  const [questionResult, optionsResult, answersResult, tagsResult] = await Promise.all([
    supabase
      .from('questions')
      .select('id, type, subject, content, stimulus, prompt, difficulty, teacher_explanation, ai_explanation, created_at')
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

  const hasSplitScreen = Boolean(question.stimulus)

  return (
    <div className="max-w-4xl">
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
        {/* ── Header badges ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type */}
          {question.type === 'multiple_choice' ? (
            <Badge variant="info">{t('typeMc')}</Badge>
          ) : (
            <Badge variant="default">{t('typeSa')}</Badge>
          )}

          {/* Subject */}
          {question.subject === 'math' && (
            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
              Math
            </span>
          )}
          {question.subject === 'reading_writing' && (
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
              Reading &amp; Writing
            </span>
          )}

          {/* Difficulty */}
          {question.difficulty && (
            <Badge variant={DIFFICULTY_VARIANTS[question.difficulty] ?? 'default'}>
              {t(`diff${question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1)}` as Parameters<typeof t>[0])}
            </Badge>
          )}

          {/* Tags */}
          {tags.map((row, i) => row.tags && (
            <Badge key={i} variant="muted">{row.tags.name}</Badge>
          ))}

          {/* Split-screen indicator */}
          {hasSplitScreen && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-600">
              <span>⬛</span> Split-screen
            </span>
          )}

          <span className="ml-auto text-xs text-mute-light">
            {new Date(question.created_at).toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </div>

        {/* ── Question content ─────────────────────────────────────────────── */}
        {hasSplitScreen ? (
          /* Split-screen: passage left, question stem right */
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-6 border-sky-200 bg-sky-50/30">
              <SectionLabel>{t('labelStimulus')}</SectionLabel>
              <HtmlBlock html={question.stimulus!} />
            </Card>
            <Card className="p-6 border-indigo-200 bg-indigo-50/30">
              <SectionLabel>{t('labelPrompt')}</SectionLabel>
              <HtmlBlock html={question.prompt ?? question.content} />
            </Card>
          </div>
        ) : (
          <Card className="p-6">
            <SectionLabel>{t('labelContent')}</SectionLabel>
            <HtmlBlock html={question.content} />
          </Card>
        )}

        {/* ── Multiple choice options ──────────────────────────────────────── */}
        {question.type === 'multiple_choice' && options.length > 0 && (
          <Card className="p-6">
            <SectionLabel>{t('labelOptions')}</SectionLabel>
            <div className="space-y-2">
              {options.map((opt) => (
                <div
                  key={opt.id}
                  className={[
                    'flex items-start gap-3 px-4 py-3 rounded-lg',
                    opt.is_correct
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-surface-soft',
                  ].join(' ')}
                >
                  <div className={[
                    'mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                    opt.is_correct ? 'bg-green-500 text-white' : 'bg-ash-light text-ink',
                  ].join(' ')}>
                    {opt.label}
                  </div>
                  <div
                    className={['flex-1 text-sm leading-relaxed [&_img]:max-w-full [&_img]:h-auto', opt.is_correct ? 'text-green-700 font-medium' : 'text-ink'].join(' ')}
                    dangerouslySetInnerHTML={{ __html: renderMathInHtml(opt.content) }}
                  />
                  {opt.is_correct && (
                    <span className="ml-auto shrink-0 text-xs text-green-600 font-semibold">{t('correctLabel')}</span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Short answer: accepted answers ───────────────────────────────── */}
        {question.type === 'short_answer' && answers.length > 0 && (
          <Card className="p-6">
            <SectionLabel>{t('labelAccepted')}</SectionLabel>
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

        {/* ── Explanations ─────────────────────────────────────────────────── */}
        {(question.teacher_explanation || question.ai_explanation) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {question.teacher_explanation && (
              <Card className="p-6 border-purple-200 bg-purple-50/30">
                <SectionLabel>{t('labelExplanation')}</SectionLabel>
                <HtmlBlock html={question.teacher_explanation} className="text-sm" />
              </Card>
            )}
            {question.ai_explanation && (
              <Card className="p-6 border-indigo-200 bg-indigo-50/30">
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="text-[10px]">✨</span>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{t('labelAiExplanation')}</p>
                </div>
                <HtmlBlock html={question.ai_explanation} className="text-sm" />
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
