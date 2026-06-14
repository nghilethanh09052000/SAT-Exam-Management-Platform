import { createServerClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { notFound, redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { PrintButton } from '../../students/[studentId]/extension-editor'
import { getAuthContext, hasPermission, inAssignedClass } from '@/lib/authz'

interface PageProps {
  params: { locale: string; id: string; classId: string; instanceId: string }
}

// Whole-class scoreboard for one assignment set ("xuất bản điểm 1 set cho
// nguyên lớp"). Print-friendly so the teacher can publish/share it.
export default async function ClassScoreboardPage({ params }: PageProps) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.scoreboard')
  const auth = await getAuthContext(createServerClient())
  if (!auth) redirect(`/${params.locale}/login`)
  const { profile } = auth
  if (profile.role !== 'admin' && profile.role !== 'teacher') notFound()
  if (!hasPermission(profile, 'performance:view') || !inAssignedClass(profile, params.classId)) notFound()
  const db = serviceClient()

  type InstanceRow = {
    id: string
    deadline: string
    class_id: string
    assignments: { title: string } | null
    classes: { title: string; course_id: string; courses: { title: string; teacher_id: string } | null } | null
  }
  const { data: instRaw } = await db
    .from('assignment_instances')
    .select('id, deadline, class_id, assignments(title), classes(title, course_id, courses(title, teacher_id))')
    .eq('id', params.instanceId)
    .eq('class_id', params.classId)
    .single()
  const inst = instRaw as InstanceRow | null
  if (!inst || inst.classes?.course_id !== params.id) notFound()

  type EnrollmentRow = { student_id: string; profiles: { full_name: string } | null }
  type SubmissionRow = {
    student_id: string
    raw_score: number | null
    total_questions: number | null
    time_spent_seconds: number | null
    submitted_at: string | null
  }
  const [enrollRes, subsRes] = await Promise.all([
    db.from('enrollments').select('student_id, profiles(full_name)').eq('class_id', params.classId),
    db
      .from('submissions')
      .select('student_id, raw_score, total_questions, time_spent_seconds, submitted_at')
      .eq('instance_id', params.instanceId)
      .eq('status', 'submitted'),
  ])
  const enrollments = (enrollRes.data as EnrollmentRow[] | null) ?? []
  const submissions = (subsRes.data as SubmissionRow[] | null) ?? []

  const bestByStudent = new Map<string, SubmissionRow>()
  for (const s of submissions) {
    const prev = bestByStudent.get(s.student_id)
    if (!prev || (s.raw_score ?? 0) > (prev.raw_score ?? 0)) bestByStudent.set(s.student_id, s)
  }

  const rows = enrollments
    .map((e) => {
      const best = bestByStudent.get(e.student_id) ?? null
      const pct =
        best && best.total_questions
          ? Math.round(((best.raw_score ?? 0) / best.total_questions) * 100)
          : null
      return { studentId: e.student_id, name: e.profiles?.full_name ?? '—', best, pct }
    })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))

  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'
  const fmt = (d: string) =>
    new Date(d).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
  const fmtTime = (sec: number | null) => {
    if (!sec) return '—'
    const m = Math.floor(sec / 60)
    return `${m}:${String(sec % 60).padStart(2, '0')}`
  }

  const submittedCount = rows.filter((r) => r.best).length
  const avgPct = (() => {
    const withPct = rows.filter((r) => r.pct !== null)
    if (withPct.length === 0) return null
    return Math.round(withPct.reduce((s, r) => s + (r.pct ?? 0), 0) / withPct.length)
  })()

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
          <h1 className="text-2xl font-bold text-ink md:text-3xl">{inst.assignments?.title ?? '—'}</h1>
          <p className="mt-1 text-sm text-mute-light">
            {inst.classes?.courses?.title} · {inst.classes?.title} · {t('deadline', { time: fmt(inst.deadline) })}
          </p>
        </div>
        <PrintButton label={t('print')} />
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-hairline-light bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-mute-light">{t('submitted')}</p>
          <p className="mt-1 text-3xl font-bold text-ink tabular-nums">{submittedCount}/{rows.length}</p>
        </div>
        <div className="rounded-2xl border border-hairline-light bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-mute-light">{t('classAverage')}</p>
          <p className="mt-1 text-3xl font-bold text-ink tabular-nums">{avgPct === null ? '—' : `${avgPct}%`}</p>
        </div>
        <div className="rounded-2xl border border-hairline-light bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-mute-light">{t('topScore')}</p>
          <p className="mt-1 text-3xl font-bold text-ink tabular-nums">
            {rows[0]?.pct !== null && rows[0]?.pct !== undefined ? `${rows[0].pct}%` : '—'}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-hairline-light bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-soft text-left text-xs font-bold uppercase tracking-wide text-mute-light">
                <th className="px-5 py-3">#</th>
                <th className="px-5 py-3">{t('colStudent')}</th>
                <th className="px-5 py-3">{t('colScore')}</th>
                <th className="px-5 py-3">{t('colAccuracy')}</th>
                <th className="px-5 py-3">{t('colTime')}</th>
                <th className="px-5 py-3">{t('colSubmittedAt')}</th>
                <th className="px-5 py-3 print:hidden">{t('colDetail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light">
              {rows.map((r, i) => (
                <tr key={r.studentId}>
                  <td className="px-5 py-3 tabular-nums text-mute-light">{i + 1}</td>
                  <td className="px-5 py-3 font-medium text-ink">{r.name}</td>
                  <td className="px-5 py-3 font-semibold tabular-nums text-ink">
                    {r.best ? `${r.best.raw_score ?? 0}/${r.best.total_questions ?? 0}` : t('notSubmitted')}
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    {r.pct === null ? (
                      <span className="text-mute-light">—</span>
                    ) : (
                      <span className={`font-semibold ${r.pct >= 70 ? 'text-emerald-600' : r.pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{r.pct}%</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-mute-light tabular-nums">{fmtTime(r.best?.time_spent_seconds ?? null)}</td>
                  <td className="px-5 py-3 text-mute-light tabular-nums">{r.best?.submitted_at ? fmt(r.best.submitted_at) : '—'}</td>
                  <td className="px-5 py-3 print:hidden">
                    <Link
                      href={`/teacher/courses/${params.id}/classes/${params.classId}/students/${r.studentId}`}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold text-primary hover:bg-navy-tint"
                    >
                      {t('viewStudent')}
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-6 text-center text-mute-light">{t('noStudents')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
