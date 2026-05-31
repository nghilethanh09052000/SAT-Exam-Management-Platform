import { createServerClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
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
  created_by: string
  created_at: string
  updated_at: string
}

type PracticeAssignmentRow = {
  id: string
  deadline: string
  published_at: string | null
  classes: { title: string; courses: { title: string } | null } | null
  weeks: { title: string } | null
}

const DIFFICULTY_VARIANT: Record<string, 'success' | 'warning' | 'error'> = {
  easy: 'success', medium: 'warning', hard: 'error',
}

const MODULE_ACCENTS = [
  {
    rail: 'bg-[#0f6fb7]',
    chip: 'border-[#b9d7f6] bg-[#eef6ff] text-[#0c5ea8]',
    panel: 'from-[#f4faff] to-white',
  },
  {
    rail: 'bg-[#16835a]',
    chip: 'border-[#b8ebcf] bg-[#f0fbf5] text-[#13734c]',
    panel: 'from-[#f4fcf7] to-white',
  },
  {
    rail: 'bg-[#c78313]',
    chip: 'border-[#f5d789] bg-[#fff8e6] text-[#95620b]',
    panel: 'from-[#fffaf0] to-white',
  },
  {
    rail: 'bg-[#c7502a]',
    chip: 'border-[#f4c4b1] bg-[#fff3ef] text-[#a14322]',
    panel: 'from-[#fff7f4] to-white',
  },
]

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
    .select('id, title, source, year, description, created_by, created_at, updated_at')
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

  const { data: assignmentData } = await supabase
    .from('practice_test_assignments')
    .select('id, deadline, published_at, classes(title, courses(title)), weeks(title)')
    .eq('practice_test_id', params.id)
    .order('deadline', { ascending: false })
  const practiceAssignments = (assignmentData as PracticeAssignmentRow[] | null) ?? []

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
  const publishedAssignments = practiceAssignments.filter((assignment) => assignment.published_at).length

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-[#d7e7f8] bg-[#f7fbff] shadow-[0_22px_50px_-28px_rgba(15,111,183,0.45)] animate-fade-up">
        <div className="grid gap-6 p-5 md:grid-cols-[1.25fr_0.75fr] md:p-7 lg:p-8">
          <div className="flex min-w-0 flex-col justify-between gap-8">
            <div className="space-y-5">
              <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#607083]">
                <Link href="/teacher/exam-papers" className="transition-colors hover:text-[#0c5ea8]">
                  {t('breadcrumb')}
                </Link>
                <span className="text-[#9aa9b8]">/</span>
                <span className="min-w-0 truncate text-[#17202a]">{paper.title}</span>
              </nav>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{t('exam')}</Badge>
                  {[paper.source, paper.year].filter(Boolean).length > 0 && (
                    <span className="rounded-full border border-[#d8e5f1] bg-white/75 px-3 py-1 text-xs font-bold text-[#607083]">
                      {[paper.source, paper.year].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
                <h1 className="max-w-3xl font-display text-3xl font-black leading-tight tracking-tight text-[#17202a] md:text-5xl">
                  {paper.title}
                </h1>
                {paper.description && (
                  <p className="max-w-2xl text-sm leading-6 text-[#607083] md:text-base">
                    {paper.description}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#708095]">{t('questionCount', { count: 0 }).replace('0 ', '')}</p>
                <p className="mt-2 font-mono text-2xl font-black text-[#17202a]">{questionRows.length}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#708095]">{t('assignedClasses')}</p>
                <p className="mt-2 font-mono text-2xl font-black text-[#0c5ea8]">{practiceAssignments.length}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#708095]">{t('assignPublished')}</p>
                <p className="mt-2 font-mono text-2xl font-black text-[#16835a]">{publishedAssignments}</p>
              </div>
            </div>
          </div>

          <aside className="rounded-[24px] border border-white/80 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_16px_34px_-24px_rgba(15,111,183,0.55)] backdrop-blur">
            <div className="flex h-full min-h-[230px] flex-col justify-between rounded-[20px] border border-[#d6e7f8] bg-[#fbfdff] p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#0c5ea8]">SAT</p>
                  <p className="mt-2 text-lg font-black text-[#17202a]">{t('exam')}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0f6fb7] text-xs font-black text-white shadow-sm">
                  {questionRows.length}
                </div>
              </div>
              <div className="space-y-3">
                {Array.from(moduleMap.entries()).slice(0, 4).map(([moduleName, rows], index) => {
                  const accent = MODULE_ACCENTS[index % MODULE_ACCENTS.length]
                  return (
                    <div key={moduleName} className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${accent.rail}`} />
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#607083]">{moduleName}</span>
                      <span className="font-mono text-xs font-black text-[#17202a]">{rows.length}</span>
                    </div>
                  )
                })}
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/teacher/exam-papers/${params.id}/assign`}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-primary px-5 font-display text-sm font-bold text-white transition-all duration-200 hover:bg-primary-pressed active:scale-[0.98]"
                  >
                    {t('assignBtn')}
                  </Link>
                  <ExamPaperActions paperId={params.id} />
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      {/* Meta info */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#dfeaf4] bg-white px-4 py-3 shadow-sm animate-fade-up">
        <span className="rounded-full bg-[#eef6ff] px-3 py-1 text-xs font-bold text-[#0c5ea8]">
          {t('questionCount', { count: questionRows.length })}
        </span>
        <span className="ml-auto text-xs font-semibold text-[#708095]">
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
        <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <aside className="space-y-6">
            <div className="rounded-[24px] border border-[#dfeaf4] bg-white p-5 shadow-sm animate-fade-up">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black tracking-tight text-[#17202a]">{t('assignedClasses')}</h2>
                  <p className="mt-1 text-xs font-semibold text-[#708095]">{practiceAssignments.length} · {t('assignPublished')} {publishedAssignments}</p>
                </div>
              {canEdit && (
                <Link href={`/teacher/exam-papers/${params.id}/assign`} className="rounded-full bg-[#eef6ff] px-3 py-1.5 text-xs font-bold text-[#0c5ea8] transition-colors hover:bg-[#dcecff]">
                  {t('assignBtn')}
                </Link>
              )}
            </div>
            {practiceAssignments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#c8ddf1] bg-[#f7fbff] p-5 text-sm font-semibold text-[#607083]">
                {t('noAssignedClasses')}
              </div>
            ) : (
              <div className="space-y-3">
                {practiceAssignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-2xl border border-[#dfeaf4] bg-[#fbfdff] p-4 transition-transform duration-200 hover:-translate-y-0.5">
                    <p className="text-sm font-black text-[#17202a]">{assignment.classes?.title ?? t('assignNoWeek')}</p>
                    <p className="mt-1 text-xs font-semibold text-[#708095]">
                      {[assignment.classes?.courses?.title, assignment.weeks?.title].filter(Boolean).join(' · ') || t('assignNoWeek')}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-[#607083]">{new Date(assignment.deadline).toLocaleString(dateLocale)}</span>
                      <Badge variant={assignment.published_at ? 'success' : 'warning'}>
                        {assignment.published_at ? t('assignPublished') : t('assignDraft')}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </aside>

          <section className="space-y-5">
          {Array.from(moduleMap.entries()).map(([moduleName, rows], moduleIndex) => {
            const accent = MODULE_ACCENTS[moduleIndex % MODULE_ACCENTS.length]
            return (
            <div key={moduleName} className={`overflow-hidden rounded-[24px] border border-[#dfeaf4] bg-gradient-to-br ${accent.panel} shadow-sm animate-fade-up`}>
              {/* Module header */}
              <div className="flex flex-wrap items-center gap-3 border-b border-[#dfeaf4] bg-white/70 px-5 py-4">
                <span className={`h-10 w-1.5 rounded-full ${accent.rail}`} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-black tracking-tight text-[#17202a]">{moduleName}</h2>
                  <p className="mt-1 text-xs font-semibold text-[#708095]">{t('moduleQuestionCount', { count: rows.length })}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${accent.chip}`}>
                  {rows.length}
                </span>
              </div>

              {/* Questions list */}
              <div className="divide-y divide-[#e6eef7] px-3 py-2">
                {rows.map((row, idx) => (
                  <Link
                    key={row.id}
                    href={`/teacher/questions/${row.question.id}`}
                    className="group grid gap-3 rounded-2xl px-3 py-4 transition-all duration-200 hover:bg-white/90 active:scale-[0.99] sm:grid-cols-[auto_1fr_auto]"
                  >
                    {/* Order number */}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white font-mono text-xs font-black text-[#607083] ring-1 ring-[#dfeaf4]">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    {/* Content */}
                    <p className="min-w-0 text-sm font-semibold leading-6 text-[#293747] line-clamp-2 group-hover:text-[#0c5ea8]">
                      {row.question.content.slice(0, 120)}
                      {row.question.content.length > 120 ? '…' : ''}
                    </p>
                    {/* Badges */}
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
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
                        <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-[#708095] ring-1 ring-[#dfeaf4]">{row.score_weight}đ</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )})}

          {/* Stats footer */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#dfeaf4] bg-white px-4 py-3 text-xs font-semibold text-[#708095]">
            <span>{t('statsTotal', { count: questionRows.length })}</span>
            {Array.from(moduleMap.entries()).map(([mod, rows]) => (
              <span key={mod}>{mod}: <strong className="font-mono text-[#17202a]">{rows.length}</strong></span>
            ))}
          </div>
          </section>
        </div>
      )}
    </div>
  )
}
