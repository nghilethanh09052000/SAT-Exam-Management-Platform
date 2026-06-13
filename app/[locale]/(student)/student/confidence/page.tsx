import { getCachedUser } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { stripHtmlToText } from '@/lib/html-text'
import { ConfidenceFilters } from './confidence-filters'

interface PageProps {
  params: { locale: string }
  searchParams: { level?: string; skill?: string; set?: string; from?: string; to?: string }
}

// Questions grouped by the student's self-reported confidence, filterable by
// level, skill, set and date range.
export default async function ConfidencePage({ params, searchParams }: PageProps) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.confidence')
  const user = await getCachedUser()
  if (!user) redirect(`/${params.locale}/login`)
  const db = serviceClient()

  // My submitted attempts → answers carrying a confidence rating
  type SubmissionRow = {
    id: string
    submitted_at: string | null
    assignment_instances: { id: string; assignments: { title: string } | null } | null
  }
  const { data: subsRaw } = await db
    .from('submissions')
    .select('id, submitted_at, assignment_instances(id, assignments(title))')
    .eq('student_id', user!.id)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(200)
  const submissions = (subsRaw as SubmissionRow[] | null) ?? []
  const subMeta = new Map(
    submissions.map((s) => [
      s.id,
      { title: s.assignment_instances?.assignments?.title ?? '—', date: s.submitted_at },
    ])
  )

  type AnswerRow = {
    submission_id: string
    question_id: string
    is_correct: boolean | null
    confidence: 'high' | 'medium' | 'low'
    questions: { content: string } | null
  }
  const { data: answersRaw } = submissions.length > 0
    ? await db
        .from('submission_answers')
        .select('submission_id, question_id, is_correct, confidence, questions(content)')
        .in('submission_id', submissions.map((s) => s.id))
        .not('confidence', 'is', null)
    : { data: [] as AnswerRow[] }
  const answers = (answersRaw as AnswerRow[] | null) ?? []

  // Tags for the skill filter + display
  type TagLinkRow = { question_id: string; tags: { id: string; name: string } | null }
  const qIds = Array.from(new Set(answers.map((a) => a.question_id)))
  const { data: tagsRaw } = qIds.length > 0
    ? await db.from('question_tags').select('question_id, tags(id, name)').in('question_id', qIds)
    : { data: [] as TagLinkRow[] }
  const tagLinks = (tagsRaw as TagLinkRow[] | null) ?? []
  const tagsByQuestion = new Map<string, { id: string; name: string }[]>()
  for (const link of tagLinks) {
    if (!link.tags) continue
    const list = tagsByQuestion.get(link.question_id) ?? []
    list.push(link.tags)
    tagsByQuestion.set(link.question_id, list)
  }

  const allSkills = Array.from(
    new Map(tagLinks.filter((l) => l.tags).map((l) => [l.tags!.id, l.tags!])).values()
  ).sort((a, b) => a.name.localeCompare(b.name))
  const allSets = Array.from(
    new Map(submissions.map((s) => [s.assignment_instances?.id ?? s.id, s.assignment_instances?.assignments?.title ?? '—'])).entries()
  ).map(([id, title]) => ({ id, title }))

  // Apply filters
  const level = searchParams.level ?? ''
  const skill = searchParams.skill ?? ''
  const set = searchParams.set ?? ''
  const from = searchParams.from ?? ''
  const to = searchParams.to ?? ''

  const rows = answers
    .map((a) => {
      const meta = subMeta.get(a.submission_id)
      return {
        key: `${a.submission_id}:${a.question_id}`,
        excerpt: a.questions ? stripHtmlToText(a.questions.content).slice(0, 120) : '—',
        confidence: a.confidence,
        isCorrect: a.is_correct,
        setTitle: meta?.title ?? '—',
        setId: (submissions.find((s) => s.id === a.submission_id)?.assignment_instances?.id) ?? '',
        date: meta?.date ?? null,
        skills: (tagsByQuestion.get(a.question_id) ?? []).map((tg) => tg.name),
        skillIds: (tagsByQuestion.get(a.question_id) ?? []).map((tg) => tg.id),
      }
    })
    .filter((r) => !level || r.confidence === level)
    .filter((r) => !skill || r.skillIds.includes(skill))
    .filter((r) => !set || r.setId === set)
    .filter((r) => !from || (r.date ?? '') >= new Date(`${from}T00:00:00+07:00`).toISOString())
    .filter((r) => !to || (r.date ?? '') <= new Date(`${to}T23:59:59+07:00`).toISOString())

  const counts = {
    high: answers.filter((a) => a.confidence === 'high').length,
    medium: answers.filter((a) => a.confidence === 'medium').length,
    low: answers.filter((a) => a.confidence === 'low').length,
  }

  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }) : '—'

  const confidenceChip: Record<string, string> = {
    high: 'bg-emerald-50 text-emerald-700',
    medium: 'bg-amber-50 text-amber-700',
    low: 'bg-red-50 text-red-700',
  }
  const confidenceLabel: Record<string, string> = {
    high: t('high'),
    medium: t('medium'),
    low: t('low'),
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6d7cff]">{t('eyebrow')}</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-ink md:text-5xl">{t('title')}</h1>
        <p className="mt-2 max-w-xl text-sm font-semibold text-[#8a91a3]">{t('subtitle')}</p>
      </header>

      {/* Level summary chips */}
      <div className="grid gap-4 sm:grid-cols-3">
        {(['high', 'medium', 'low'] as const).map((lv) => (
          <div key={lv} className="rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-sm shadow-blue-100/60">
            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${confidenceChip[lv]}`}>{confidenceLabel[lv]}</span>
            <p className="mt-2 text-3xl font-black tabular-nums text-ink">{counts[lv]}</p>
            <p className="text-xs font-semibold text-[#9aa2b6]">{t('questionsUnit')}</p>
          </div>
        ))}
      </div>

      <ConfidenceFilters
        skills={allSkills}
        sets={allSets}
        level={level}
        skill={skill}
        set={set}
        from={from}
        to={to}
      />

      {/* Rows */}
      <section className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex flex-col gap-2 rounded-[20px] border border-white/80 bg-white/90 p-4 shadow-sm shadow-blue-100/50 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-snug text-navy-soft line-clamp-2">{r.excerpt}</p>
              <p className="mt-1 text-xs font-semibold text-[#9aa2b6]">
                {r.setTitle} · {fmt(r.date)}{r.skills.length > 0 ? ` · ${r.skills.join(', ')}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${confidenceChip[r.confidence]}`}>
                {confidenceLabel[r.confidence]}
              </span>
              {r.isCorrect === true ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{t('correct')}</span>
              ) : r.isCorrect === false ? (
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-black text-red-700">{t('wrong')}</span>
              ) : (
                <span className="rounded-full bg-[#f1f3f8] px-2.5 py-1 text-xs font-black text-[#9aa2b6]">{t('skipped')}</span>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="rounded-[24px] border border-white/80 bg-white/90 p-6 text-sm font-semibold text-[#9aa2b6]">{t('empty')}</p>
        )}
      </section>
    </div>
  )
}
