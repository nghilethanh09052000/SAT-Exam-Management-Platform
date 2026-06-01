import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { RichHtml } from '@/lib/rich-html'
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">{children}</p>
}

function HtmlBlock({ html, className = '' }: { html: string; className?: string }) {
  return (
    <RichHtml
      html={html}
      className={['text-base text-ink leading-relaxed [&_img]:my-3 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg', className].join(' ')}
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
    <div className="max-w-4xl animate-fade-in">
      <PageHeader
        title={t('detailTitle')}
        breadcrumbs={[
          { label: tNav('questionBank'), href: '/teacher/questions' },
          { label: t('breadcrumbDetail') },
        ]}
        action={
          <Link href={`/teacher/questions/${params.id}/edit`}>
            <Button variant="secondary" size="sm" className="shadow-sm border border-slate-200 hover:bg-slate-50 transition-all">
              {t('editBtn')}
            </Button>
          </Link>
        }
      />

      <div className="space-y-6">
        {/* ── Header badges ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type */}
          {question.type === 'multiple_choice' ? (
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50/60 px-2.5 py-0.5 text-xs font-semibold text-blue-700 backdrop-blur-sm">
              {t('typeMc')}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50/60 px-2.5 py-0.5 text-xs font-semibold text-slate-700 backdrop-blur-sm">
              {t('typeSa')}
            </span>
          )}

          {/* Subject */}
          {question.subject === 'math' && (
            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50/60 px-2.5 py-0.5 text-xs font-semibold text-violet-700 backdrop-blur-sm">
              Math
            </span>
          )}
          {question.subject === 'reading_writing' && (
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50/60 px-2.5 py-0.5 text-xs font-semibold text-sky-700 backdrop-blur-sm">
              Reading &amp; Writing
            </span>
          )}

          {/* Difficulty */}
          {question.difficulty === 'easy' && (
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 backdrop-blur-sm">
              {t('diffEasy')}
            </span>
          )}
          {question.difficulty === 'medium' && (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50/60 px-2.5 py-0.5 text-xs font-semibold text-amber-700 backdrop-blur-sm">
              {t('diffMedium')}
            </span>
          )}
          {question.difficulty === 'hard' && (
            <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50/60 px-2.5 py-0.5 text-xs font-semibold text-rose-700 backdrop-blur-sm">
              {t('diffHard')}
            </span>
          )}

          {/* Tags */}
          {tags.map((row, i) => row.tags && (
            <span key={i} className="inline-flex items-center rounded-full border border-slate-200 bg-white/70 px-2.5 py-0.5 text-xs font-medium text-slate-600 backdrop-blur-sm">
              {row.tags.name}
            </span>
          ))}

          {/* Split-screen indicator */}
          {hasSplitScreen && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50/60 px-2.5 py-0.5 text-xs font-semibold text-sky-600 backdrop-blur-sm">
              <span>⬛</span> Split-screen
            </span>
          )}

          <span className="ml-auto text-xs text-mute-light font-medium bg-white/50 border border-slate-100/60 px-2.5 py-0.5 rounded-full backdrop-blur-sm">
            {new Date(question.created_at).toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </div>

        {/* ── Question content ─────────────────────────────────────────────── */}
        {hasSplitScreen ? (
          /* Split-screen: passage left, question stem right */
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="teacher-surface p-6 border-sky-200 bg-sky-50/20 shadow-sm relative overflow-hidden backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-sky-300">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 to-blue-500" />
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-600">{t('labelStimulus')}</p>
              <HtmlBlock html={question.stimulus!} />
            </div>
            <div className="teacher-surface p-6 border-indigo-200 bg-indigo-50/20 shadow-sm relative overflow-hidden backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-indigo-300">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-400 to-violet-500" />
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">{t('labelPrompt')}</p>
              <HtmlBlock html={question.prompt ?? question.content} />
            </div>
          </div>
        ) : (
          <div className="teacher-surface p-6 bg-white/90 shadow-sm backdrop-blur-sm relative overflow-hidden transition-all duration-300 hover:shadow-md">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-indigo-600" />
            <SectionLabel>{t('labelContent')}</SectionLabel>
            <HtmlBlock html={question.content} />
          </div>
        )}

        {/* ── Multiple choice options ──────────────────────────────────────── */}
        {question.type === 'multiple_choice' && options.length > 0 && (
          <div className="teacher-surface p-6 bg-white/90 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md">
            <SectionLabel>{t('labelOptions')}</SectionLabel>
            <div className="space-y-3">
              {options.map((opt) => (
                <div
                  key={opt.id}
                  className={[
                    'flex items-start gap-4 px-5 py-4 rounded-xl transition-all duration-200 border text-sm leading-relaxed',
                    opt.is_correct
                      ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950 shadow-sm shadow-emerald-50'
                      : 'bg-white/60 border-slate-100/80 text-slate-800 hover:bg-white hover:border-indigo-100 hover:shadow-sm',
                  ].join(' ')}
                >
                  <div className={[
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 border shadow-sm transition-colors',
                    opt.is_correct
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-emerald-600/20'
                      : 'bg-slate-50 border-slate-200 text-slate-700',
                  ].join(' ')}>
                    {opt.label}
                  </div>
                  <RichHtml
                    html={opt.content}
                    className={['flex-1 [&_img]:max-w-full [&_img]:h-auto', opt.is_correct ? 'font-medium' : ''].join(' ')}
                  />
                  {opt.is_correct && (
                    <span className="ml-auto shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100/80 text-[10px] font-semibold text-emerald-800 uppercase tracking-wider">
                      ✓ {t('correctLabel')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Short answer: accepted answers ───────────────────────────────── */}
        {question.type === 'short_answer' && answers.length > 0 && (
          <div className="teacher-surface p-6 bg-white/90 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md">
            <SectionLabel>{t('labelAccepted')}</SectionLabel>
            <div className="flex flex-wrap gap-3">
              {answers.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50/50 border border-emerald-200 rounded-xl text-sm text-emerald-800 font-semibold shadow-sm"
                >
                  <span className="text-emerald-500 font-bold">✓</span>
                  {a.answer_text}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Explanations ─────────────────────────────────────────────────── */}
        {(question.teacher_explanation || question.ai_explanation) && (
          <div className="grid gap-5 sm:grid-cols-2">
            {question.teacher_explanation && (
              <div className="teacher-surface p-6 border-purple-200 bg-purple-50/30 shadow-sm relative overflow-hidden backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-purple-300">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-purple-400 to-fuchsia-500" />
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-600">{t('labelExplanation')}</p>
                <HtmlBlock html={question.teacher_explanation} className="text-sm" />
              </div>
            )}
            {question.ai_explanation && (
              <div className="teacher-surface p-6 border-indigo-200 bg-indigo-50/30 shadow-sm relative overflow-hidden backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-indigo-300">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400" />
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="text-xs animate-pulse">✨</span>
                  <p className="text-xs font-semibold uppercase tracking-wide bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">{t('labelAiExplanation')}</p>
                </div>
                <HtmlBlock html={question.ai_explanation} className="text-sm" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
