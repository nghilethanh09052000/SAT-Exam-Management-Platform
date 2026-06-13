import { getCachedUser, getCachedProfile } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { notFound, redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { ExtensionEditor, PrintButton } from './extension-editor'

interface PageProps {
  params: { locale: string; id: string; classId: string; studentId: string }
}

// Per-student performance report ("sổ liên lạc"): every assigned set with the
// best score, plus skill breakdown and per-student deadline extensions.
export default async function StudentReportPage({ params }: PageProps) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.studentReport')
  const user = await getCachedUser()
  if (!user) redirect(`/${params.locale}/login`)
  const profile = await getCachedProfile()
  // Same audience as the class-detail page that links here: any staff member.
  // (Per-course scoping arrives with the RBAC build.)
  if (profile?.role !== 'admin' && profile?.role !== 'teacher') notFound()
  const db = serviceClient()

  // Ownership: the class must belong to this course; the course to this
  // teacher (admins skip the teacher check).
  type ClassRow = { id: string; title: string; course_id: string; courses: { title: string; teacher_id: string } | null }
  const { data: classRaw } = await db
    .from('classes')
    .select('id, title, course_id, courses(title, teacher_id)')
    .eq('id', params.classId)
    .eq('course_id', params.id)
    .single()
  const cls = classRaw as ClassRow | null
  if (!cls) notFound()

  type StudentRow = { id: string; full_name: string; email: string | null; target_score: number | null }
  const [{ data: studentRaw }, { data: enrollmentRaw }] = await Promise.all([
    db.from('profiles').select('id, full_name, email, target_score').eq('id', params.studentId).single(),
    db.from('enrollments').select('student_id').eq('class_id', params.classId).eq('student_id', params.studentId).maybeSingle(),
  ])
  const student = studentRaw as StudentRow | null
  if (!student || !enrollmentRaw) notFound()

  // Instances + this student's submissions + extensions
  type InstanceRow = { id: string; deadline: string; assignments: { title: string } | null }
  type SubmissionRow = {
    id: string
    instance_id: string
    raw_score: number | null
    total_questions: number | null
    time_spent_seconds: number | null
    submitted_at: string | null
    attempt_number: number
  }
  type ExtensionRow = { instance_id: string; extended_deadline: string }

  const [instancesRes, subsRes, extRes] = await Promise.all([
    db
      .from('assignment_instances')
      .select('id, deadline, assignments(title)')
      .eq('class_id', params.classId)
      .not('published_at', 'is', null)
      .order('deadline', { ascending: true }),
    db
      .from('submissions')
      .select('id, instance_id, raw_score, total_questions, time_spent_seconds, submitted_at, attempt_number')
      .eq('student_id', params.studentId)
      .eq('status', 'submitted'),
    db
      .from('assignment_extensions')
      .select('instance_id, extended_deadline')
      .eq('student_id', params.studentId),
  ])

  const instances = (instancesRes.data as InstanceRow[] | null) ?? []
  const submissions = (subsRes.data as SubmissionRow[] | null) ?? []
  const extensions = new Map(
    ((extRes.data as ExtensionRow[] | null) ?? []).map((e) => [e.instance_id, e.extended_deadline])
  )

  const instanceIds = new Set(instances.map((i) => i.id))
  const bestByInstance = new Map<string, SubmissionRow>()
  for (const s of submissions) {
    if (!instanceIds.has(s.instance_id)) continue
    const prev = bestByInstance.get(s.instance_id)
    if (!prev || (s.raw_score ?? 0) > (prev.raw_score ?? 0)) bestByInstance.set(s.instance_id, s)
  }

  // Skill breakdown from the best submissions' answers
  const bestIds = Array.from(bestByInstance.values()).map((s) => s.id)
  type AnswerRow = { question_id: string; is_correct: boolean | null }
  type TagLinkRow = { question_id: string; tags: { name: string } | null }
  let answers: AnswerRow[] = []
  let tagLinks: TagLinkRow[] = []
  if (bestIds.length > 0) {
    const { data: answersRaw } = await db
      .from('submission_answers')
      .select('question_id, is_correct')
      .in('submission_id', bestIds)
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

  // Summary
  const totCorrect = Array.from(bestByInstance.values()).reduce((s, b) => s + (b.raw_score ?? 0), 0)
  const totQuestions = Array.from(bestByInstance.values()).reduce((s, b) => s + (b.total_questions ?? 0), 0)
  const avgAccuracy = totQuestions > 0 ? Math.round((totCorrect / totQuestions) * 100) : null

  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'
  const fmt = (d: string) =>
    new Date(d).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
  const fmtTime = (sec: number | null) => {
    if (!sec) return '—'
    const m = Math.floor(sec / 60)
    return `${m}:${String(sec % 60).padStart(2, '0')}`
  }

  const now = Date.now()

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href={`/teacher/courses/${params.id}/classes/${params.classId}`}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-mute-light hover:text-primary print:hidden"
          >
            ← {t('backToClass')}
          </Link>
          <h1 className="text-2xl font-bold text-ink md:text-3xl">{student.full_name}</h1>
          <p className="mt-1 text-sm text-mute-light">
            {cls.courses?.title} · {cls.title}
            {student.target_score ? ` · ${t('goal', { score: student.target_score })}` : ''}
          </p>
        </div>
        <PrintButton label={t('print')} />
      </header>

      {/* Summary chips */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-hairline-light bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-mute-light">{t('avgAccuracy')}</p>
          <p className="mt-1 text-3xl font-bold text-ink tabular-nums">{avgAccuracy === null ? '—' : `${avgAccuracy}%`}</p>
        </div>
        <div className="rounded-2xl border border-hairline-light bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-mute-light">{t('setsDone')}</p>
          <p className="mt-1 text-3xl font-bold text-ink tabular-nums">{bestByInstance.size}/{instances.length}</p>
        </div>
        <div className="rounded-2xl border border-hairline-light bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-mute-light">{t('questionsCorrect')}</p>
          <p className="mt-1 text-3xl font-bold text-ink tabular-nums">{totCorrect}/{totQuestions}</p>
        </div>
      </section>

      {/* Per-assignment results + extensions */}
      <section className="overflow-hidden rounded-2xl border border-hairline-light bg-white shadow-sm">
        <div className="border-b border-hairline-light px-5 py-4">
          <h2 className="text-lg font-bold text-ink">{t('resultsTitle')}</h2>
          <p className="mt-0.5 text-sm text-mute-light">{t('resultsDesc')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-soft text-left text-xs font-bold uppercase tracking-wide text-mute-light">
                <th className="px-5 py-3">{t('colSet')}</th>
                <th className="px-5 py-3">{t('colDeadline')}</th>
                <th className="px-5 py-3">{t('colScore')}</th>
                <th className="px-5 py-3">{t('colAccuracy')}</th>
                <th className="px-5 py-3">{t('colTime')}</th>
                <th className="px-5 py-3">{t('colStatus')}</th>
                <th className="px-5 py-3 print:hidden">{t('colExtension')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light">
              {instances.map((inst) => {
                const best = bestByInstance.get(inst.id)
                const ext = extensions.get(inst.id) ?? null
                const effectiveDeadline = ext && ext > inst.deadline ? ext : inst.deadline
                const pct =
                  best && best.total_questions
                    ? Math.round(((best.raw_score ?? 0) / best.total_questions) * 100)
                    : null
                const missed = !best && new Date(effectiveDeadline).getTime() <= now
                return (
                  <tr key={inst.id}>
                    <td className="px-5 py-3 font-medium text-ink">{inst.assignments?.title ?? '—'}</td>
                    <td className="px-5 py-3 text-mute-light tabular-nums">
                      {fmt(inst.deadline)}
                      {ext && (
                        <span className="mt-0.5 block text-xs font-semibold text-primary">
                          {t('extendedTo', { time: fmt(ext) })}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-semibold tabular-nums text-ink">
                      {best ? `${best.raw_score ?? 0}/${best.total_questions ?? 0}` : '—'}
                    </td>
                    <td className="px-5 py-3 tabular-nums">
                      {pct === null ? (
                        <span className="text-mute-light">—</span>
                      ) : (
                        <span className={`font-semibold ${pct >= 70 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-mute-light tabular-nums">{fmtTime(best?.time_spent_seconds ?? null)}</td>
                    <td className="px-5 py-3">
                      {best ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{t('statusDone')}</span>
                      ) : missed ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">{t('statusMissed')}</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{t('statusPending')}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 print:hidden">
                      <ExtensionEditor
                        instanceId={inst.id}
                        studentId={params.studentId}
                        currentExtension={ext}
                      />
                    </td>
                  </tr>
                )
              })}
              {instances.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-6 text-center text-mute-light">{t('noSets')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Skill breakdown */}
      <section className="rounded-2xl border border-hairline-light bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-ink">{t('skillTitle')}</h2>
        <p className="mt-0.5 text-sm text-mute-light">{t('skillDesc')}</p>
        <div className="mt-4 space-y-3">
          {skills.map((s) => (
            <div key={s.name}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-ink">{s.name}</span>
                <span className="font-semibold tabular-nums text-mute-light">{s.correct}/{s.total} · {s.pct}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-soft">
                <div
                  className={`h-full rounded-full ${s.pct >= 70 ? 'bg-emerald-500' : s.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${s.pct}%` }}
                />
              </div>
            </div>
          ))}
          {skills.length === 0 && <p className="text-sm text-mute-light">{t('noData')}</p>}
        </div>
      </section>
    </div>
  )
}
