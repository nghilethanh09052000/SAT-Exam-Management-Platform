import { getCachedUser } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

interface PageProps {
  params: { locale: string }
}

// Student results hub: gradebook summary (per-skill bars) + one card per
// assignment set with best score, class rank and percentile.
export default async function StudentResultsPage({ params }: PageProps) {
  setRequestLocale(params.locale)
  const t = await getTranslations('student.resultsHub')
  const user = await getCachedUser()
  if (!user) redirect(`/${params.locale}/login`)
  const db = serviceClient()

  // Classes the student is enrolled in → their published assignment sets
  const { data: enrollRaw } = await db
    .from('enrollments')
    .select('class_id')
    .eq('student_id', user!.id)
  const classIds = ((enrollRaw as { class_id: string }[] | null) ?? []).map((e) => e.class_id)

  type InstanceRow = { id: string; class_id: string; deadline: string; assignments: { title: string } | null }
  const { data: instRaw } = classIds.length > 0
    ? await db
        .from('assignment_instances')
        .select('id, class_id, deadline, assignments(title)')
        .in('class_id', classIds)
        .not('published_at', 'is', null)
    : { data: [] as InstanceRow[] }
  const instances = (instRaw as InstanceRow[] | null) ?? []
  const instanceIds = instances.map((i) => i.id)

  // All submitted attempts for these sets (whole class → rank/percentile)
  type SubmissionRow = {
    id: string
    instance_id: string
    student_id: string
    raw_score: number | null
    total_questions: number | null
    submitted_at: string | null
  }
  const { data: subsRaw } = instanceIds.length > 0
    ? await db
        .from('submissions')
        .select('id, instance_id, student_id, raw_score, total_questions, submitted_at')
        .in('instance_id', instanceIds)
        .eq('status', 'submitted')
    : { data: [] as SubmissionRow[] }
  const submissions = (subsRaw as SubmissionRow[] | null) ?? []

  // Best attempt per (student, instance)
  const bestByKey = new Map<string, SubmissionRow>()
  for (const s of submissions) {
    const key = `${s.student_id}:${s.instance_id}`
    const prev = bestByKey.get(key)
    if (!prev || (s.raw_score ?? 0) > (prev.raw_score ?? 0)) bestByKey.set(key, s)
  }

  // Rank within class per instance
  const classBestByInstance = new Map<string, SubmissionRow[]>()
  for (const s of Array.from(bestByKey.values())) {
    const list = classBestByInstance.get(s.instance_id) ?? []
    list.push(s)
    classBestByInstance.set(s.instance_id, list)
  }

  const myCards = instances
    .map((inst) => {
      const mine = bestByKey.get(`${user!.id}:${inst.id}`)
      if (!mine) return null
      const peers = (classBestByInstance.get(inst.id) ?? []).slice().sort((a, b) => {
        const pa = a.total_questions ? (a.raw_score ?? 0) / a.total_questions : 0
        const pb = b.total_questions ? (b.raw_score ?? 0) / b.total_questions : 0
        return pb - pa
      })
      const rank = peers.findIndex((p) => p.student_id === user!.id) + 1
      const pct = mine.total_questions
        ? Math.round(((mine.raw_score ?? 0) / mine.total_questions) * 100)
        : 0
      return {
        instanceId: inst.id,
        title: inst.assignments?.title ?? '—',
        score: `${mine.raw_score ?? 0}/${mine.total_questions ?? 0}`,
        pct,
        rank,
        peers: peers.length,
        topPct: peers.length > 0 ? Math.max(1, Math.round((rank / peers.length) * 100)) : null,
        submittedAt: mine.submitted_at,
        bestSubmissionId: mine.id,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))

  // Gradebook: per-skill accuracy across my best attempts
  const myBestIds = myCards.map((c) => c.bestSubmissionId)
  type AnswerRow = { question_id: string; is_correct: boolean | null }
  type TagLinkRow = { question_id: string; tags: { name: string } | null }
  let answers: AnswerRow[] = []
  let tagLinks: TagLinkRow[] = []
  if (myBestIds.length > 0) {
    const { data: answersRaw } = await db
      .from('submission_answers')
      .select('question_id, is_correct')
      .in('submission_id', myBestIds)
    answers = (answersRaw as AnswerRow[] | null) ?? []
    const qIds = Array.from(new Set(answers.map((a) => a.question_id)))
    if (qIds.length > 0) {
      const { data: tagsRaw } = await db
        .from('question_tags')
        .select('question_id, tags(name)')
        .in('question_id', qIds)
      tagLinks = (tagsRaw as TagLinkRow[] | null) ?? []
    }
  }
  const tagsByQuestion = new Map<string, string[]>()
  for (const link of tagLinks) {
    if (!link.tags?.name) continue
    const list = tagsByQuestion.get(link.question_id) ?? []
    list.push(link.tags.name)
    tagsByQuestion.set(link.question_id, list)
  }
  const skillMap = new Map<string, { correct: number; total: number }>()
  for (const a of answers) {
    for (const tag of tagsByQuestion.get(a.question_id) ?? []) {
      const cur = skillMap.get(tag) ?? { correct: 0, total: 0 }
      cur.total += 1
      if (a.is_correct === true) cur.correct += 1
      skillMap.set(tag, cur)
    }
  }
  const skills = Array.from(skillMap.entries())
    .map(([name, s]) => ({ name, ...s, pct: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct)

  // Overall accuracy from best-attempt scores (works even when older
  // submissions predate per-answer rows).
  const myBest = instances
    .map((inst) => bestByKey.get(`${user!.id}:${inst.id}`))
    .filter((s): s is SubmissionRow => Boolean(s))
  const totalCorrect = myBest.reduce((sum, s) => sum + (s.raw_score ?? 0), 0)
  const totalAnswered = myBest.reduce((sum, s) => sum + (s.total_questions ?? 0), 0)
  const overallPct = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null

  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'
  const fmt = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })
      : '—'

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6d7cff]">{t('eyebrow')}</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-ink md:text-5xl">{t('title')}</h1>
        <p className="mt-2 max-w-xl text-sm font-semibold text-[#8a91a3]">{t('subtitle')}</p>
      </header>

      {/* Gradebook summary */}
      <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <div className="rounded-[24px] border border-white/80 bg-white/90 p-6 shadow-sm shadow-blue-100/60">
            <p className="text-xs font-bold text-[#8a91a3]">{t('overallAccuracy')}</p>
            <p className="mt-1 text-4xl font-black text-ink tabular-nums">
              {overallPct === null ? '—' : `${overallPct}%`}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#9aa2b6]">
              {t('overallDetail', { correct: totalCorrect, total: totalAnswered })}
            </p>
          </div>
          <div className="rounded-[24px] border border-white/80 bg-white/90 p-6 shadow-sm shadow-blue-100/60">
            <p className="text-xs font-bold text-[#8a91a3]">{t('setsDone')}</p>
            <p className="mt-1 text-4xl font-black text-ink tabular-nums">{myCards.length}</p>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/80 bg-white/90 p-6 shadow-sm shadow-blue-100/60">
          <h2 className="text-lg font-black text-ink">{t('skillTitle')}</h2>
          <p className="mt-0.5 text-xs font-semibold text-[#9aa2b6]">{t('skillDesc')}</p>
          <div className="mt-4 space-y-3">
            {skills.map((s) => (
              <div key={s.name}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold text-navy-soft">{s.name}</span>
                  <span className="font-semibold tabular-nums text-[#8a91a3]">{s.correct}/{s.total} · {s.pct}%</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[#edf0f7]">
                  <div
                    className={`h-full rounded-full ${s.pct >= 70 ? 'bg-emerald-500' : s.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
              </div>
            ))}
            {skills.length === 0 && <p className="text-sm text-[#9aa2b6]">{t('noData')}</p>}
          </div>
        </div>
      </section>

      {/* Result cards */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-ink">{t('cardsTitle')}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {myCards.map((card) => (
            <Link
              key={card.instanceId}
              href={`/student/test/${card.instanceId}/results`}
              className="group rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-sm shadow-blue-100/60 transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 flex-1 text-base font-black leading-snug text-ink line-clamp-2">{card.title}</h3>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${card.pct >= 70 ? 'bg-emerald-50 text-emerald-700' : card.pct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}
                >
                  {card.pct}%
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-ink">
                {card.score}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-[#8a91a3]">
                <span className="rounded-full bg-[#eef3ff] px-2.5 py-1 text-[#5368f6]">
                  {t('rank', { rank: card.rank, total: card.peers })}
                </span>
                {card.topPct !== null && (
                  <span className="rounded-full bg-[#fff4e6] px-2.5 py-1 text-[#ea8c2d]">
                    {t('topPercent', { pct: card.topPct })}
                  </span>
                )}
                <span>{fmt(card.submittedAt)}</span>
              </div>
              <p className="mt-3 text-xs font-bold text-[#5368f6] opacity-0 transition-opacity group-hover:opacity-100">
                {t('viewDetail')} →
              </p>
            </Link>
          ))}
        </div>
        {myCards.length === 0 && (
          <p className="rounded-[24px] border border-white/80 bg-white/90 p-6 text-sm font-semibold text-[#9aa2b6]">
            {t('empty')}
          </p>
        )}
      </section>
    </div>
  )
}
