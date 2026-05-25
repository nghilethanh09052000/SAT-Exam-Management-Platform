import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { ExamPaperActions } from './exam-paper-actions'
import { getTranslations, setRequestLocale } from 'next-intl/server'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuestionRow {
  id: string
  order_index: number
  module_name: string | null
  score_weight: number
  question: {
    id: string
    type: string
    content: string
    difficulty: string | null
  }
}

interface ExamPaper {
  id: string
  title: string
  source: string | null
  year: number | null
  description: string | null
  is_public: boolean
  created_by: string
  created_at: string
  updated_at: string
}

const DIFFICULTY_VARIANT: Record<string, 'success' | 'warning' | 'error'> = {
  easy: 'success', medium: 'warning', hard: 'error',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ExamPaperDetailPage({
  params,
}: {
  params: { id: string; locale: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.examPapers')
  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: paperData, error: pError } = await supabase
    .from('exam_papers')
    .select('id, title, source, year, description, is_public, created_by, created_at, updated_at')
    .eq('id', params.id)
    .is('archived_at', null)
    .single()

  if (pError || !paperData) return notFound()

  const paper = paperData as ExamPaper

  const { data: qData } = await supabase
    .from('exam_paper_questions')
    .select('id, order_index, module_name, score_weight, question:questions(id, type, content, difficulty)')
    .eq('exam_paper_id', params.id)
    .order('module_name', { ascending: true })
    .order('order_index', { ascending: true })

  const questionRows: QuestionRow[] = (qData as QuestionRow[] | null) ?? []

  // Group by module
  const moduleMap = new Map<string, QuestionRow[]>()
  questionRows.forEach((r) => {
    const key = r.module_name ?? t('noModule')
    if (!moduleMap.has(key)) moduleMap.set(key, [])
    moduleMap.get(key)!.push(r)
  })

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .single()
  const isAdmin = (profileData as { role: string } | null)?.role === 'admin'
  const canEdit = isAdmin || paper.created_by === user?.id

  return (
    <div>
      <PageHeader
        title={paper.title}
        breadcrumbs={[
          { label: t('breadcrumb'), href: '/teacher/exam-papers' },
          { label: paper.title },
        ]}
        description={[paper.source, paper.year].filter(Boolean).join(' · ') || undefined}
        action={
          canEdit ? (
            <ExamPaperActions paperId={params.id} />
          ) : undefined
        }
      />

      {/* Meta info */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-white p-4 shadow-sm animate-fade-up">
        <Badge variant="info">{t('exam')}</Badge>
        {paper.is_public && <Badge variant="success">{t('publicFreeTest')}</Badge>}
        <span className="text-xs text-mute-light">
          {t('questionCount', { count: questionRows.length })}
        </span>
        {paper.description && (
          <span className="text-xs text-mute-light">· {paper.description}</span>
        )}
        <span className="ml-auto text-xs text-mute-light">
          {t('updatedAt', { date: new Date(paper.updated_at).toLocaleDateString(dateLocale) })}
        </span>
      </div>

      {questionRows.length === 0 ? (
        <EmptyState
          title={t('emptyQuestions')}
          description={t('emptyQuestionsDesc')}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-6">
          {Array.from(moduleMap.entries()).map(([moduleName, rows]) => (
            <div key={moduleName} className="animate-fade-up">
              {/* Module header */}
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-ink">{moduleName}</h2>
                <div className="flex-1 h-px bg-ash-light" />
                <span className="text-xs text-mute-light shrink-0">{t('moduleQuestionCount', { count: rows.length })}</span>
              </div>

              {/* Questions list */}
              <div className="space-y-1.5">
                {rows.map((row, idx) => (
                  <Link
                    key={row.id}
                    href={`/teacher/questions/${row.question.id}`}
                    className="group flex items-start gap-4 rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    {/* Order number */}
                    <span className="w-6 text-xs font-mono text-mute-light shrink-0 pt-0.5 text-right">
                      {idx + 1}
                    </span>
                    {/* Content */}
                    <p className="flex-1 text-sm text-ink leading-snug min-w-0 truncate">
                      {row.question.content.slice(0, 120)}
                      {row.question.content.length > 120 ? '…' : ''}
                    </p>
                    {/* Badges */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {row.question.type === 'multiple_choice'
                        ? <Badge variant="info">{t('badgeMc')}</Badge>
                        : <Badge variant="default">{t('badgeSa')}</Badge>
                      }
                      {row.question.difficulty && (
                        <Badge variant={DIFFICULTY_VARIANT[row.question.difficulty] ?? 'default'}>
                          {t(`diff${row.question.difficulty.charAt(0).toUpperCase() + row.question.difficulty.slice(1)}` as Parameters<typeof t>[0])}
                        </Badge>
                      )}
                      {row.score_weight !== 1 && (
                        <span className="text-[10px] text-mute-light">{row.score_weight}đ</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {/* Stats footer */}
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-ash-light text-xs text-mute-light">
            <span>{t('statsTotal', { count: questionRows.length })}</span>
            {Array.from(moduleMap.entries()).map(([mod, rows]) => (
              <span key={mod}>{mod}: <strong className="text-ink">{rows.length}</strong></span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
