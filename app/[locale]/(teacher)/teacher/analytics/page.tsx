import { getCachedUser, getCachedProfile } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { PageHeader } from '@/components/ui/page-header'
import { AnalyticsFilters } from './analytics-filters'
import { ThresholdsEditor } from './thresholds-editor'

interface PageProps {
  params: { locale: string }
  searchParams: { class?: string; from?: string; to?: string; tag?: string }
}

type Tier = 'excellent' | 'target' | 'watch' | 'danger'

interface Thresholds {
  excellent_pct: number
  target_pct: number
  watch_pct: number
}

const DEFAULT_THRESHOLDS: Thresholds = { excellent_pct: 85, target_pct: 70, watch_pct: 50 }

function tierOf(pct: number, th: Thresholds): Tier {
  if (pct >= th.excellent_pct) return 'excellent'
  if (pct >= th.target_pct) return 'target'
  if (pct >= th.watch_pct) return 'watch'
  return 'danger'
}

const tierBadge: Record<Tier, string> = {
  excellent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  target: 'bg-sky-50 text-sky-700 border-sky-200',
  watch: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
}

export default async function AnalyticsPage({ params, searchParams }: PageProps) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.analytics')
  const user = await getCachedUser()
  if (!user) redirect(`/${params.locale}/login`)
  const profile = await getCachedProfile()
  const isAdmin = profile?.role === 'admin'
  const db = serviceClient()

  // ── Classes the viewer may analyze ─────────────────────────────────────────
  type ClassRow = { id: string; title: string; courses: { title: string; teacher_id: string } | null }
  let classQuery = db
    .from('classes')
    .select('id, title, courses!inner(title, teacher_id)')
    .is('archived_at', null)
    .order('title')
  if (!isAdmin) classQuery = classQuery.eq('courses.teacher_id', user!.id)
  const { data: classRowsRaw } = await classQuery
  const classRows = ((classRowsRaw as ClassRow[] | null) ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    courseTitle: c.courses?.title ?? '',
  }))

  const selectedClassId =
    searchParams.class && classRows.some((c) => c.id === searchParams.class)
      ? searchParams.class
      : classRows[0]?.id ?? ''

  const from = searchParams.from ?? ''
  const to = searchParams.to ?? ''
  const selectedTagId = searchParams.tag ?? ''

  if (!selectedClassId) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} description={t('description')} />
        <p className="rounded-2xl border border-hairline-light bg-white p-6 text-sm text-mute-light">{t('noClasses')}</p>
      </div>
    )
  }

  // ── Raw data for the selected class ───────────────────────────────────────
  type EnrollmentRow = { student_id: string; profiles: { full_name: string } | null }
  type InstanceRow = { id: string; deadline: string; assignments: { title: string } | null }
  type ThresholdsRow = Thresholds | null

  let instanceQuery = db
    .from('assignment_instances')
    .select('id, deadline, assignments(title)')
    .eq('class_id', selectedClassId)
    .not('published_at', 'is', null)
    .order('deadline', { ascending: true })
  if (from) instanceQuery = instanceQuery.gte('deadline', new Date(`${from}T00:00:00+07:00`).toISOString())
  if (to) instanceQuery = instanceQuery.lte('deadline', new Date(`${to}T23:59:59+07:00`).toISOString())

  const [enrollRes, instanceRes, thresholdsRes] = await Promise.all([
    db
      .from('enrollments')
      .select('student_id, profiles(full_name)')
      .eq('class_id', selectedClassId),
    instanceQuery,
    db
      .from('performance_thresholds')
      .select('excellent_pct, target_pct, watch_pct')
      .eq('teacher_id', user!.id)
      .maybeSingle(),
  ])

  const enrollments = (enrollRes.data as EnrollmentRow[] | null) ?? []
  const instances = (instanceRes.data as InstanceRow[] | null) ?? []
  const thresholds: Thresholds = (thresholdsRes.data as ThresholdsRow) ?? DEFAULT_THRESHOLDS

  const instanceIds = instances.map((i) => i.id)
  const studentNames = new Map(enrollments.map((e) => [e.student_id, e.profiles?.full_name ?? '—']))

  type SubmissionRow = {
    id: string
    instance_id: string
    student_id: string
    raw_score: number | null
    total_questions: number | null
  }
  const { data: subsRaw } = instanceIds.length > 0
    ? await db
        .from('submissions')
        .select('id, instance_id, student_id, raw_score, total_questions')
        .in('instance_id', instanceIds)
        .eq('status', 'submitted')
    : { data: [] as SubmissionRow[] }
  const submissions = (subsRaw as SubmissionRow[] | null) ?? []

  // Best attempt per (student, instance) — analytics always use the best try.
  const bestByKey = new Map<string, SubmissionRow>()
  for (const s of submissions) {
    const key = `${s.student_id}:${s.instance_id}`
    const prev = bestByKey.get(key)
    if (!prev || (s.raw_score ?? 0) > (prev.raw_score ?? 0)) bestByKey.set(key, s)
  }
  const bestSubmissions = Array.from(bestByKey.values())
  const bestSubmissionIds = new Set(bestSubmissions.map((s) => s.id))

  // Per-question rows of the best attempts → skill-tag and subject stats.
  type AnswerRow = {
    submission_id: string
    is_correct: boolean | null
    questions: { subject: string | null } | null
    question_id: string
  }
  type TagLinkRow = { question_id: string; tags: { id: string; name: string } | null }

  let answers: AnswerRow[] = []
  let tagLinks: TagLinkRow[] = []
  if (bestSubmissionIds.size > 0) {
    const { data: answersRaw } = await db
      .from('submission_answers')
      .select('submission_id, question_id, is_correct, questions(subject)')
      .in('submission_id', Array.from(bestSubmissionIds))
    answers = (answersRaw as AnswerRow[] | null) ?? []

    const questionIds = Array.from(new Set(answers.map((a) => a.question_id)))
    if (questionIds.length > 0) {
      const { data: tagsRaw } = await db
        .from('question_tags')
        .select('question_id, tags(id, name)')
        .in('question_id', questionIds)
      tagLinks = (tagsRaw as TagLinkRow[] | null) ?? []
    }
  }

  const tagsByQuestion = new Map<string, { id: string; name: string }[]>()
  for (const link of tagLinks) {
    if (!link.tags) continue
    const list = tagsByQuestion.get(link.question_id) ?? []
    list.push(link.tags)
    tagsByQuestion.set(link.question_id, list)
  }
  const allTags = Array.from(
    new Map(tagLinks.filter((l) => l.tags).map((l) => [l.tags!.id, l.tags!])).values()
  ).sort((a, b) => a.name.localeCompare(b.name))

  const submissionStudent = new Map(bestSubmissions.map((s) => [s.id, s.student_id]))

  // ── Per-student aggregates ─────────────────────────────────────────────────
  interface StudentAgg {
    studentId: string
    name: string
    correct: number
    total: number
    completed: number
  }
  const aggByStudent = new Map<string, StudentAgg>()
  for (const e of enrollments) {
    aggByStudent.set(e.student_id, {
      studentId: e.student_id,
      name: studentNames.get(e.student_id) ?? '—',
      correct: 0,
      total: 0,
      completed: 0,
    })
  }

  if (selectedTagId) {
    // Accuracy scoped to one skill tag, from per-question rows.
    for (const a of answers) {
      const sid = submissionStudent.get(a.submission_id)
      if (!sid) continue
      const agg = aggByStudent.get(sid)
      if (!agg) continue
      const tagged = (tagsByQuestion.get(a.question_id) ?? []).some((tg) => tg.id === selectedTagId)
      if (!tagged) continue
      agg.total += 1
      if (a.is_correct === true) agg.correct += 1
    }
  } else {
    for (const s of bestSubmissions) {
      const agg = aggByStudent.get(s.student_id)
      if (!agg) continue
      agg.correct += s.raw_score ?? 0
      agg.total += s.total_questions ?? 0
    }
  }
  for (const s of bestSubmissions) {
    const agg = aggByStudent.get(s.student_id)
    if (agg) agg.completed += 1
  }

  const studentStats = Array.from(aggByStudent.values()).map((a) => ({
    ...a,
    accuracy: a.total > 0 ? Math.round((a.correct / a.total) * 100) : null,
    completionPct: instances.length > 0 ? Math.round((a.completed / instances.length) * 100) : 0,
  }))

  const byAccuracy = [...studentStats]
    .filter((s) => s.accuracy !== null)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))
  const byCompletion = [...studentStats].sort((a, b) => b.completionPct - a.completionPct)

  // ── Skill accuracy split by subject ────────────────────────────────────────
  const tagStats = new Map<string, { name: string; subject: string; correct: number; total: number }>()
  const subjectByQuestion = new Map<string, string>()
  for (const a of answers) {
    if (a.questions?.subject) subjectByQuestion.set(a.question_id, a.questions.subject)
  }
  for (const a of answers) {
    for (const tg of tagsByQuestion.get(a.question_id) ?? []) {
      const subject = subjectByQuestion.get(a.question_id) ?? 'reading_writing'
      const cur = tagStats.get(tg.id) ?? { name: tg.name, subject, correct: 0, total: 0 }
      cur.total += 1
      if (a.is_correct === true) cur.correct += 1
      tagStats.set(tg.id, cur)
    }
  }
  const skillRows = Array.from(tagStats.values())
    .map((s) => ({ ...s, pct: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct)
  const rwSkills = skillRows.filter((s) => s.subject === 'reading_writing')
  const mathSkills = skillRows.filter((s) => s.subject === 'math')

  // ── Completion buckets per instance ────────────────────────────────────────
  const now = Date.now()
  const submittedStudentsByInstance = new Map<string, Set<string>>()
  for (const s of bestSubmissions) {
    const set = submittedStudentsByInstance.get(s.instance_id) ?? new Set<string>()
    set.add(s.student_id)
    submittedStudentsByInstance.set(s.instance_id, set)
  }
  const instanceRows = instances.map((inst) => {
    const done = submittedStudentsByInstance.get(inst.id)?.size ?? 0
    const remaining = Math.max(0, enrollments.length - done)
    const isPast = new Date(inst.deadline).getTime() <= now
    return {
      id: inst.id,
      title: inst.assignments?.title ?? '—',
      deadline: inst.deadline,
      done,
      pending: isPast ? 0 : remaining,
      missed: isPast ? remaining : 0,
    }
  })
  const totals = instanceRows.reduce(
    (acc, r) => ({ done: acc.done + r.done, pending: acc.pending + r.pending, missed: acc.missed + r.missed }),
    { done: 0, pending: 0, missed: 0 }
  )

  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })

  const tierLabels: Record<Tier, string> = {
    excellent: t('tierExcellent'),
    target: t('tierTarget'),
    watch: t('tierWatch'),
    danger: t('tierDanger'),
  }

  const selectedTagName = allTags.find((tg) => tg.id === selectedTagId)?.name ?? null

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <AnalyticsFilters
        classes={classRows}
        tags={allTags}
        selectedClassId={selectedClassId}
        selectedTagId={selectedTagId}
        from={from}
        to={to}
      />

      <ThresholdsEditor initial={thresholds} />

      {/* ── Completion totals ─────────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { value: totals.done, label: t('bucketDone'), cls: 'text-emerald-600 bg-emerald-50' },
          { value: totals.pending, label: t('bucketPending'), cls: 'text-amber-600 bg-amber-50' },
          { value: totals.missed, label: t('bucketMissed'), cls: 'text-red-600 bg-red-50' },
        ].map((chip) => (
          <div key={chip.label} className="rounded-2xl border border-hairline-light bg-white p-5 shadow-sm">
            <p className={`inline-block rounded-lg px-2 py-0.5 text-xs font-bold ${chip.cls}`}>{chip.label}</p>
            <p className="mt-2 text-3xl font-bold text-ink tabular-nums">{chip.value}</p>
            <p className="mt-0.5 text-xs text-mute-light">{t('bucketUnit')}</p>
          </div>
        ))}
      </section>

      {/* ── Student status tiers ──────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-hairline-light bg-white shadow-sm">
        <div className="border-b border-hairline-light px-5 py-4">
          <h2 className="text-lg font-bold text-ink">
            {selectedTagName ? t('statusTableTitleTag', { tag: selectedTagName }) : t('statusTableTitle')}
          </h2>
          <p className="mt-0.5 text-sm text-mute-light">{t('statusTableDesc')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-soft text-left text-xs font-bold uppercase tracking-wide text-mute-light">
                <th className="px-5 py-3">{t('colStudent')}</th>
                <th className="px-5 py-3">{t('colAccuracy')}</th>
                <th className="px-5 py-3">{t('colCompleted')}</th>
                <th className="px-5 py-3">{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light">
              {[...studentStats]
                .sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1))
                .map((s) => (
                  <tr key={s.studentId}>
                    <td className="px-5 py-3 font-medium text-ink">{s.name}</td>
                    <td className="px-5 py-3">
                      {s.accuracy === null ? (
                        <span className="text-mute-light">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-soft">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${s.accuracy}%` }} />
                          </div>
                          <span className="font-semibold tabular-nums">{s.accuracy}%</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-mute-light">
                      {s.completed}/{instances.length} · {s.completionPct}%
                    </td>
                    <td className="px-5 py-3">
                      {s.accuracy === null ? (
                        <span className="rounded-full border border-ash-light px-2.5 py-1 text-xs font-semibold text-mute-light">
                          {t('tierNoData')}
                        </span>
                      ) : (
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tierBadge[tierOf(s.accuracy, thresholds)]}`}>
                          {tierLabels[tierOf(s.accuracy, thresholds)]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              {studentStats.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-mute-light">{t('noStudents')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Top students ──────────────────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        {[
          { title: t('topAccuracyTitle'), rows: byAccuracy.slice(0, 5), metric: (s: (typeof byAccuracy)[number]) => `${s.accuracy}%` },
          { title: t('topCompletionTitle'), rows: byCompletion.slice(0, 5), metric: (s: (typeof byCompletion)[number]) => `${s.completionPct}%` },
        ].map((card) => (
          <div key={card.title} className="rounded-2xl border border-hairline-light bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink">{card.title}</h2>
            <ol className="mt-3 space-y-2">
              {card.rows.map((s, i) => (
                <li key={s.studentId} className="flex items-center gap-3 text-sm">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-surface-soft text-mute-light'}`}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{s.name}</span>
                  <span className="font-bold tabular-nums text-primary">{card.metric(s)}</span>
                </li>
              ))}
              {card.rows.length === 0 && <li className="text-sm text-mute-light">{t('noData')}</li>}
            </ol>
          </div>
        ))}
      </section>

      {/* ── Skill accuracy by subject ─────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        {[
          { title: t('skillRwTitle'), rows: rwSkills },
          { title: t('skillMathTitle'), rows: mathSkills },
        ].map((card) => (
          <div key={card.title} className="rounded-2xl border border-hairline-light bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink">{card.title}</h2>
            <p className="mt-0.5 text-xs text-mute-light">{t('skillDesc')}</p>
            <div className="mt-4 space-y-3">
              {card.rows.map((s) => (
                <div key={s.name}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-ink">{s.name}</span>
                    <span className="font-semibold tabular-nums text-mute-light">
                      {s.correct}/{s.total} · {s.pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-soft">
                    <div
                      className={`h-full rounded-full ${s.pct >= thresholds.target_pct ? 'bg-emerald-500' : s.pct >= thresholds.watch_pct ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${s.pct}%` }}
                    />
                  </div>
                </div>
              ))}
              {card.rows.length === 0 && <p className="text-sm text-mute-light">{t('noData')}</p>}
            </div>
          </div>
        ))}
      </section>

      {/* ── Per-assignment completion ─────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-hairline-light bg-white shadow-sm">
        <div className="border-b border-hairline-light px-5 py-4">
          <h2 className="text-lg font-bold text-ink">{t('completionTableTitle')}</h2>
          <p className="mt-0.5 text-sm text-mute-light">{t('completionTableDesc')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-soft text-left text-xs font-bold uppercase tracking-wide text-mute-light">
                <th className="px-5 py-3">{t('colAssignment')}</th>
                <th className="px-5 py-3">{t('colDeadline')}</th>
                <th className="px-5 py-3">{t('bucketDone')}</th>
                <th className="px-5 py-3">{t('bucketPending')}</th>
                <th className="px-5 py-3">{t('bucketMissed')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light">
              {instanceRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 font-medium text-ink">{r.title}</td>
                  <td className="px-5 py-3 text-mute-light tabular-nums">{fmtDate(r.deadline)}</td>
                  <td className="px-5 py-3 font-semibold text-emerald-600 tabular-nums">{r.done}</td>
                  <td className="px-5 py-3 font-semibold text-amber-600 tabular-nums">{r.pending}</td>
                  <td className="px-5 py-3 font-semibold text-red-600 tabular-nums">{r.missed}</td>
                </tr>
              ))}
              {instanceRows.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-mute-light">{t('noAssignments')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
