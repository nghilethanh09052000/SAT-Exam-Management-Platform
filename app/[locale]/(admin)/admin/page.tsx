import { Link } from '@/i18n/navigation'
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui/stat-card'
import { AppIcon } from '@/components/ui/app-icon'

// ── Avatar colour palette keyed by first char code ────────────────────────────
const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-400 to-teal-600',
  'from-amber-400 to-orange-500',
  'from-pink-500 to-rose-600',
  'from-cyan-400 to-sky-600',
]
function avatarGradient(name: string) {
  const idx = (name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

type TFunction = (key: string, values?: Record<string, string | number | Date>) => string

interface LeaderboardStudent {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  accuracy: number
  completed: number
  correct: number
  total: number
}

interface BarDatum {
  label: string
  value: number
}

interface ProgressDatum {
  label: string
  value: number
  detail?: string
}

interface RecentSubmissionRow {
  id: string
  studentName: string
  studentEmail: string
  scoreText: string
  accuracy: number
  submittedAt: string | null
}

type RecentStudentRow = {
  id: string
  email: string | null
  full_name: string
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
}

type LeaderboardProfileRow = {
  id: string
  email: string | null
  full_name: string
  phone: string | null
  avatar_url: string | null
}

function StudentAvatar({
  student,
  size = 'md',
}: {
  student: Pick<LeaderboardStudent, 'name' | 'avatarUrl'>
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const sizeClass = {
    sm: 'h-9 w-9 text-sm',
    md: 'h-11 w-11 text-base',
    lg: 'h-16 w-16 text-xl',
    xl: 'h-24 w-24 text-3xl',
  }[size]

  if (student.avatarUrl) {
    return (
      <img
        src={student.avatarUrl}
        alt={student.name}
        className={`${sizeClass} rounded-2xl object-cover`}
      />
    )
  }

  return (
    <div className={`${sizeClass} rounded-2xl bg-gradient-to-br ${avatarGradient(student.name)} flex items-center justify-center font-black text-white shadow-inner`}>
      {student.name[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function InfoIcon() {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#ded4bd] bg-[#fbf8f0] text-[#7b672c]">
      <AppIcon name="info" className="h-3.5 w-3.5" strokeWidth={2.4} />
    </span>
  )
}

function PanelTitle({
  title,
  icon,
}: {
  title: string
  icon: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ead9] text-[#50451f]">
        {icon}
      </span>
      <h2 className="text-[19px] font-black text-[#25231d]">
        {title}
      </h2>
      <InfoIcon />
    </div>
  )
}

function Medal({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#efe4c7] text-[#6f5b25]">
        <AppIcon name="trophy" className="h-[18px] w-[18px]" strokeWidth={2.4} />
      </span>
    )
  }
  return <span className="text-lg font-medium tabular-nums text-[#38342b]">{rank}</span>
}

function StudentIdentity({ student }: { student: Pick<LeaderboardStudent, 'name' | 'email' | 'avatarUrl'> }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <StudentAvatar student={student} />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-black leading-tight text-[#303238]">{student.name}</p>
        <p className="truncate text-xs font-semibold text-[#969ba3]">{student.email}</p>
      </div>
    </div>
  )
}

function AccuracyLeaderboard({ students, t }: { students: LeaderboardStudent[]; t: TFunction }) {
  const top = students.slice(0, 3)
  const first = top[0]
  const second = top[1]
  const third = top[2]
  const rest = students.slice(3, 7)

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e7e0d2] bg-white/90 shadow-[0_14px_36px_rgba(67,57,39,0.08)]">
      <div className="p-5 pb-0">
        <PanelTitle
          title={t('accuracyLeaderTitle')}
          icon={<AppIcon name="bar-chart" className="h-5 w-5" />}
        />
      </div>

      {students.length === 0 ? (
        <div className="px-5 pb-8 text-center text-sm text-mute-light">{t('noSubmissions')}</div>
      ) : (
        <>
          <div className="relative h-[260px] bg-gradient-to-b from-white to-[#f6f1e7] px-3 sm:px-5">
            {second && (
              <div className="absolute bottom-0 left-[8%] flex w-[28%] flex-col items-center">
                <div className="mb-2 rounded-2xl border-[4px] border-[#d7d1c3] bg-white shadow-lg">
                  <StudentAvatar student={second} size="lg" />
                </div>
                <p className="mb-1 text-[17px] font-black text-[#928673]">{second.accuracy.toFixed(1)}%</p>
                <div className="flex h-[74px] w-full flex-col items-center justify-center rounded-t-md bg-[#5d6f68] px-2 text-center text-white shadow-lg">
                  <p className="line-clamp-2 text-sm font-black leading-tight">{second.name}</p>
                  <p className="mt-1 max-w-full truncate text-[11px] font-semibold text-white/55">{second.email}</p>
                </div>
              </div>
            )}

            {first && (
              <div className="absolute bottom-0 left-1/2 z-10 flex w-[36%] -translate-x-1/2 flex-col items-center">
                <div className="relative mb-3">
                  <div className="absolute -right-2 -top-4 rotate-12 rounded-xl bg-[#d8c28a] p-1.5 text-[#3c3215] shadow-lg">
                    <AppIcon name="trophy" className="h-4 w-4" />
                  </div>
                  <div className="rounded-3xl border-[5px] border-[#d8c28a] bg-white shadow-xl">
                    <StudentAvatar student={first} size="xl" />
                  </div>
                </div>
                <p className="mb-2 text-[18px] font-black text-[#8a742b]">{first.accuracy.toFixed(1)}%</p>
                <div className="flex h-[116px] w-full flex-col items-center justify-center rounded-t-md bg-[#3f584d] px-3 text-center text-white shadow-xl">
                  <p className="line-clamp-2 text-sm font-black leading-tight">{first.name}</p>
                  <p className="mt-1 max-w-full truncate text-[11px] font-semibold text-white/55">{first.email}</p>
                </div>
              </div>
            )}

            {third && (
              <div className="absolute bottom-0 right-[8%] flex w-[28%] flex-col items-center">
                <div className="relative mb-2 rounded-2xl border-[4px] border-[#c89b5a] bg-white shadow-lg">
                  <StudentAvatar student={third} size="lg" />
                </div>
                <p className="mb-1 text-[17px] font-black text-[#b47a42]">{third.accuracy.toFixed(1)}%</p>
                <div className="flex h-[68px] w-full flex-col items-center justify-center rounded-t-md bg-[#6f695a] px-2 text-center text-white shadow-lg">
                  <p className="line-clamp-2 text-sm font-black leading-tight">{third.name}</p>
                  <p className="mt-1 max-w-full truncate text-[11px] font-semibold text-white/55">{third.email}</p>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-4">
            {rest.map((student, index) => {
              const rank = index + 4
              return (
                <div
                  key={student.id}
                  className={['grid grid-cols-[34px_minmax(0,1fr)_64px] items-center gap-3 px-3 py-2.5 sm:grid-cols-[42px_minmax(0,1fr)_70px] sm:px-4', rank % 2 === 1 ? 'bg-[#faf7f0]' : 'bg-white'].join(' ')}
                >
                  <span className="text-lg font-medium text-[#303238]">{rank}</span>
                  <StudentIdentity student={student} />
                  <span className="text-right text-base font-medium tabular-nums text-[#38342b]">{student.accuracy.toFixed(1)}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

function CompletionLeaderboard({ students, t }: { students: LeaderboardStudent[]; t: TFunction }) {
  return (
    <section className="rounded-2xl border border-[#e7e0d2] bg-white/90 p-5 shadow-[0_14px_36px_rgba(67,57,39,0.08)]">
      <PanelTitle
        title={t('completionLeaderTitle')}
        icon={<AppIcon name="clipboard" className="h-5 w-5" />}
      />

      <div className="grid grid-cols-[56px_minmax(0,1fr)_88px] rounded-t-lg bg-[#efe4c7] px-3 py-3 text-xs font-black text-[#38342b] sm:grid-cols-[92px_minmax(0,1fr)_128px] sm:px-5 sm:text-sm">
        <span>{t('colRank')}</span>
        <span>{t('colStudent')}</span>
        <span className="text-center">{t('colCompleted')}</span>
      </div>

      {students.length === 0 ? (
        <div className="py-10 text-center text-sm text-mute-light">{t('noSubmissions')}</div>
      ) : (
        <div>
          {students.slice(0, 7).map((student, index) => {
            const rank = index + 1
            return (
              <div
                key={student.id}
                className={['grid grid-cols-[56px_minmax(0,1fr)_88px] items-center px-3 py-2.5 sm:grid-cols-[92px_minmax(0,1fr)_128px] sm:px-5', rank % 2 === 0 ? 'bg-[#faf7f0]' : 'bg-white'].join(' ')}
              >
                <div className="flex items-center justify-center">
                  <Medal rank={rank} />
                </div>
                <StudentIdentity student={student} />
                <span className="text-center text-lg font-medium tabular-nums text-[#38342b]">{student.completed}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function DashboardPanel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-[#e7e0d2] bg-white/90 p-5 shadow-[0_14px_36px_rgba(67,57,39,0.08)] sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-black text-[#25231d]">{title}</h2>
        {subtitle && <p className="mt-1 text-sm font-medium text-[#7a7164]">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function MiniMetric({
  label,
  value,
  hint,
  color,
}: {
  label: string
  value: string | number
  hint: string
  color: 'blue' | 'emerald' | 'amber' | 'violet'
}) {
  const colors = {
    blue: 'from-[#53685e] to-[#3f584d]',
    emerald: 'from-[#7da678] to-[#53685e]',
    amber: 'from-[#d8c28a] to-[#b9914e]',
    violet: 'from-[#8f7f67] to-[#5f594c]',
  }

  return (
    <div className="rounded-2xl border border-[#e7e0d2] bg-white/90 p-5 text-[#25231d] shadow-[0_14px_36px_rgba(67,57,39,0.08)]">
      <div className={`mb-5 h-1.5 w-16 rounded-full bg-gradient-to-r ${colors[color]}`} />
      <p className="text-sm font-bold text-[#7a7164]">{label}</p>
      <p className="mt-2 text-4xl font-black leading-none tabular-nums">{value}</p>
      <p className="mt-3 text-xs font-semibold text-[#8b8275]">{hint}</p>
    </div>
  )
}

function BarChart({ data }: { data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((item) => item.value))

  return (
    <div className="flex h-72 items-end gap-2 overflow-x-auto pb-1 sm:gap-3">
      {data.map((item) => {
        const height = Math.max(8, (item.value / max) * 100)
        return (
          <div key={item.label} className="flex min-w-[58px] flex-1 flex-col items-center gap-3">
            <div className="flex h-56 w-full items-end rounded-2xl bg-[#f6f1e7] p-2">
              <div
                className="w-full rounded-xl bg-gradient-to-t from-[#53685e] to-[#d8c28a] shadow-[0_8px_18px_rgba(83,104,94,0.18)]"
                style={{ height: `${height}%` }}
                title={`${item.label}: ${item.value}`}
              />
            </div>
            <div className="text-center">
              <p className="text-sm font-black tabular-nums text-[#38342b]">{item.value}</p>
              <p className="text-xs font-semibold text-[#7a7164]">{item.label}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HorizontalBars({ data, suffix = '' }: { data: ProgressDatum[]; suffix?: string }) {
  const max = Math.max(1, ...data.map((item) => item.value))

  return (
    <div className="space-y-4">
      {data.map((item) => {
        const width = Math.max(4, (item.value / max) * 100)
        return (
          <div key={item.label}>
            <div className="mb-1.5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-[#38342b]">{item.label}</p>
                {item.detail && <p className="text-xs font-semibold text-[#7a7164]">{item.detail}</p>}
              </div>
              <p className="text-sm font-black tabular-nums text-[#38342b]">{item.value}{suffix}</p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#f1ead9]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#53685e] to-[#d8c28a]"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AccuracyBands({ data, t }: { data: BarDatum[]; t: TFunction }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const palette = ['bg-[#c97862]', 'bg-[#d8c28a]', 'bg-[#6f7f78]', 'bg-[#7da678]']

  return (
    <div className="space-y-5">
      <div className="flex h-8 overflow-hidden rounded-full bg-[#f1ead9]">
        {data.map((item, index) => (
          <div
            key={item.label}
            className={palette[index % palette.length]}
            style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%` }}
            title={`${item.label}: ${item.value}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {data.map((item, index) => (
          <div key={item.label} className="rounded-2xl bg-[#faf7f0] p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${palette[index % palette.length]}`} />
              <span className="text-sm font-black text-[#38342b]">{item.label}</span>
            </div>
            <p className="text-2xl font-black tabular-nums text-[#25231d]">{item.value}</p>
            <p className="text-xs font-semibold text-[#7a7164]">{t('studentUnit')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecentSubmissions({ rows, t, locale }: { rows: RecentSubmissionRow[]; t: TFunction; locale: string }) {
  if (rows.length === 0) {
    return <div className="py-12 text-center text-sm text-mute-light">{t('noRecentSubmissions')}</div>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e7e0d2]">
      {rows.map((row, index) => (
        <div key={row.id} className={['grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_110px_150px] sm:items-center sm:gap-4 sm:px-5', index % 2 ? 'bg-[#faf7f0]' : 'bg-white'].join(' ')}>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[#38342b]">{row.studentName}</p>
            <p className="truncate text-xs font-semibold text-[#7a7164]">{row.studentEmail}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm font-black tabular-nums text-[#38342b]">{row.scoreText}</p>
            <p className="text-xs font-semibold tabular-nums text-[#7a7164]">{row.accuracy.toFixed(0)}%</p>
          </div>
          <p className="text-left text-xs font-semibold text-[#7a7164] sm:text-right">
            {row.submittedAt ? new Date(row.submittedAt).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US') : '—'}
          </p>
        </div>
      ))}
    </div>
  )
}

function RecentStudentsSection({ students, t, locale }: { students: RecentStudentRow[]; t: TFunction; locale: string }) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-display font-semibold text-ink">
          {t('recentStudentsTitle')}
        </h2>
        <Link
          href="/admin/students"
          className="flex items-center gap-1 text-xs font-medium text-[#6f5b25] transition-colors hover:text-[#3f584d]"
        >
          {t('viewAll')}
          <AppIcon name="chevron-right" className="h-3 w-3" strokeWidth={2.5} />
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e7e0d2] bg-white/90 shadow-[0_14px_36px_rgba(67,57,39,0.08)]">
        {students.length === 0 ? (
          <div className="py-16 text-center text-sm text-mute-light">{t('noStudents')}</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {students.map((s, i) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#faf7f0] sm:flex-nowrap sm:gap-4 sm:px-5 animate-fade-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className={`h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br ${avatarGradient(s.full_name)} flex items-center justify-center text-sm font-bold text-white shadow-md`}>
                  {s.full_name?.[0]?.toUpperCase() ?? '?'}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#25231d]">{s.full_name}</p>
                  <p className="text-xs text-[#7a7164]">{s.phone ?? '—'}</p>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.is_active ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                  <span className={`text-xs font-medium ${s.is_active ? 'text-[#477a45]' : 'text-[#7a7164]'}`}>
                    {s.is_active ? t('statusActive') : t('statusInactive')}
                  </span>
                </div>

                <span className="hidden whitespace-nowrap text-xs text-[#7a7164] sm:block">
                  {new Date(s.created_at).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function formatDuration(seconds: number, minLabel: string) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${minLabel}`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(date: Date) {
  return `T${date.getMonth() + 1}`
}

export default async function AdminDashboard({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('admin.dashboard')
  const locale = await getLocale()
  const supabase = createServerClient()

  const [studentResult, courseResult, assignmentResult, studentsData, activeEnrollResult, allStudentsResult, submissionsResult, coursePerformanceResult] =
    await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('is_approved', true),
      supabase.from('courses').select('id', { count: 'exact', head: true }).is('archived_at', null),
      supabase.from('assignment_instances').select('id', { count: 'exact', head: true }),
      supabase
        .from('profiles')
        .select('id, email, full_name, phone, avatar_url, is_active, created_at')
        .eq('role', 'student')
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('is_active', true).eq('is_approved', true),
      supabase
        .from('profiles')
        .select('id, email, full_name, phone, avatar_url')
        .eq('role', 'student')
        .eq('is_approved', true),
      supabase
        .from('submissions')
        .select('id, student_id, status, raw_score, total_questions, submitted_at, time_spent_seconds')
        .order('submitted_at', { ascending: false }),
      supabase
        .from('submissions')
        .select('id, raw_score, total_questions, assignment_instances(classes(course_id, courses(title)))')
        .eq('status', 'submitted'),
    ])

  const studentCount    = studentResult.count    ?? 0
  const courseCount     = courseResult.count      ?? 0
  const assignmentCount = assignmentResult.count  ?? 0
  const activeCount     = activeEnrollResult.count ?? 0

  const recentStudents: RecentStudentRow[] = studentsData.data ?? []
  type SubmissionRow = {
    id: string
    student_id: string
    status: string
    raw_score: number | null
    total_questions: number | null
    submitted_at: string | null
    time_spent_seconds: number | null
  }
  type CourseSubmissionRow = {
    id: string
    raw_score: number | null
    total_questions: number | null
    assignment_instances: {
      classes: {
        course_id: string
        courses: { title: string } | null
      } | null
    } | null
  }
  const leaderboardProfiles: LeaderboardProfileRow[] = allStudentsResult.data ?? []
  const submissions: SubmissionRow[] = (submissionsResult.data as SubmissionRow[] | null) ?? []
  const submittedSubmissions = submissions.filter((submission) => submission.status === 'submitted')

  const statsByStudent = new Map<string, { completed: number; correct: number; total: number }>()
  for (const submission of submittedSubmissions) {
    if (!submission.total_questions || submission.total_questions <= 0) continue
    const current = statsByStudent.get(submission.student_id) ?? { completed: 0, correct: 0, total: 0 }
    current.completed += 1
    current.correct += submission.raw_score ?? 0
    current.total += submission.total_questions
    statsByStudent.set(submission.student_id, current)
  }

  const leaderboardStudents: LeaderboardStudent[] = leaderboardProfiles
    .map((profile) => {
      const stats = statsByStudent.get(profile.id) ?? { completed: 0, correct: 0, total: 0 }
      return {
        id: profile.id,
        name: profile.full_name,
        email: profile.email ?? profile.phone ?? '—',
        avatarUrl: profile.avatar_url,
        completed: stats.completed,
        correct: stats.correct,
        total: stats.total,
        accuracy: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
      }
    })
    .filter((student) => student.completed > 0)

  const accuracyLeaders = [...leaderboardStudents]
    .sort((a, b) => b.accuracy - a.accuracy || b.completed - a.completed || a.name.localeCompare(b.name))
    .slice(0, 10)
  const completionLeaders = [...leaderboardStudents]
    .sort((a, b) => b.completed - a.completed || b.accuracy - a.accuracy || a.name.localeCompare(b.name))
    .slice(0, 10)

  const averageAccuracy =
    submittedSubmissions.reduce((sum, submission) => {
      if (!submission.total_questions) return sum
      return sum + ((submission.raw_score ?? 0) / submission.total_questions) * 100
    }, 0) / Math.max(1, submittedSubmissions.filter((submission) => submission.total_questions).length)

  const averageTimeSeconds =
    submittedSubmissions.reduce((sum, submission) => sum + (submission.time_spent_seconds ?? 0), 0) /
    Math.max(1, submittedSubmissions.filter((submission) => submission.time_spent_seconds).length)

  const studentIdsWithSubmission = new Set(submittedSubmissions.map((submission) => submission.student_id))
  const completionRate = studentCount > 0 ? Math.round((studentIdsWithSubmission.size / studentCount) * 100) : 0

  const monthStarts = Array.from({ length: 6 }, (_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setHours(0, 0, 0, 0)
    date.setMonth(date.getMonth() - (5 - index))
    return date
  })
  const submissionVolume = monthStarts.map((date) => ({
    label: monthLabel(date),
    value: submittedSubmissions.filter((submission) => {
      if (!submission.submitted_at) return false
      return monthKey(new Date(submission.submitted_at)) === monthKey(date)
    }).length,
  }))

  const accuracyBands = [
    { label: '<50%', value: leaderboardStudents.filter((student) => student.accuracy < 50).length },
    { label: '50–74%', value: leaderboardStudents.filter((student) => student.accuracy >= 50 && student.accuracy < 75).length },
    { label: '75–89%', value: leaderboardStudents.filter((student) => student.accuracy >= 75 && student.accuracy < 90).length },
    { label: '90%+', value: leaderboardStudents.filter((student) => student.accuracy >= 90).length },
  ]

  const QUICK_ACTIONS = [
    {
      href: '/admin/students',
      label: t('importStudents'),
      sub: t('importStudentsSub'),
      accent: 'bg-[#d8c28a]',
      icon: <AppIcon name="plus" className="h-5 w-5" />,
    },
    {
      href: '/admin/courses',
      label: t('createCourse'),
      sub: t('createCourseSub'),
      accent: 'bg-[#53685e]',
      icon: <AppIcon name="book" className="h-5 w-5" />,
    },
    {
      href: '/teacher/questions/upload',
      label: t('uploadQuestions'),
      sub: t('uploadQuestionsSub'),
      accent: 'bg-[#7da678]',
      icon: <AppIcon name="upload" className="h-5 w-5" />,
    },
    {
      href: '/teacher/assignments',
      label: t('createAssignment'),
      sub: t('createAssignmentSub'),
      accent: 'bg-[#c97862]',
      icon: <AppIcon name="clipboard" className="h-5 w-5" />,
    },
  ]

  const courseSubmissionRows = (coursePerformanceResult.data as CourseSubmissionRow[] | null) ?? []
  const courseStats = new Map<string, { correct: number; total: number; submissions: number }>()
  for (const row of courseSubmissionRows) {
    const title = row.assignment_instances?.classes?.courses?.title ?? t('unassignedCourse')
    if (!row.total_questions) continue
    const current = courseStats.get(title) ?? { correct: 0, total: 0, submissions: 0 }
    current.correct += row.raw_score ?? 0
    current.total += row.total_questions
    current.submissions += 1
    courseStats.set(title, current)
  }
  const coursePerformance = Array.from(courseStats.entries())
    .map(([label, stats]) => ({
      label,
      value: Math.round((stats.correct / Math.max(1, stats.total)) * 100),
      detail: t('courseSubmissions', { count: stats.submissions }),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const funnelData: ProgressDatum[] = [
    { label: t('funnelStudents'), value: studentCount, detail: t('funnelStudentsDetail') },
    { label: t('funnelActive'), value: activeCount, detail: t('funnelActiveDetail') },
    { label: t('funnelSubmittedOnce'), value: studentIdsWithSubmission.size, detail: t('funnelSubmittedDetail', { rate: completionRate }) },
    { label: t('funnelTotalSubmitted'), value: submittedSubmissions.length, detail: t('funnelTotalDetail') },
  ]

  const profileById = new Map(leaderboardStudents.map((student) => [student.id, student]))
  const recentSubmissions: RecentSubmissionRow[] = submittedSubmissions.slice(0, 8).map((submission) => {
    const student = profileById.get(submission.student_id)
    const total = submission.total_questions ?? 0
    const raw = submission.raw_score ?? 0
    return {
      id: submission.id,
      studentName: student?.name ?? t('colStudent'),
      studentEmail: student?.email ?? '—',
      scoreText: total > 0 ? `${raw}/${total}` : '—',
      accuracy: total > 0 ? (raw / total) * 100 : 0,
      submittedAt: submission.submitted_at,
    }
  })

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-[#332f24] bg-[#25231d] p-5 text-white shadow-[0_22px_54px_rgba(67,57,39,0.24)] sm:p-6">
        <div className="relative">
          <p className="text-sm font-medium text-white/70 mb-1">
            {t('welcomeBack')}
          </p>
          <h1 className="text-2xl md:text-3xl font-display font-bold">{t('title')}</h1>
          <p className="mt-1 text-white/60 text-sm">{t('subtitle')}</p>
        </div>

        {/* Mini stats strip */}
        <div className="relative mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: t('statActiveStudents'), value: activeCount },
            { label: t('statOpenCourses'), value: courseCount },
            { label: t('statAssignments'), value: assignmentCount },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-white/[0.08] px-4 py-3 ring-1 ring-white/10">
              <p className="text-2xl font-bold tabular-nums">{s.value}</p>
              <p className="text-xs text-white/60">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Operating metrics ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric
          label={t('metricSubmissions')}
          value={submittedSubmissions.length}
          hint={t('metricSubmissionsHint')}
          color="blue"
        />
        <MiniMetric
          label={t('metricAccuracy')}
          value={`${Math.round(averageAccuracy)}%`}
          hint={t('metricAccuracyHint')}
          color="emerald"
        />
        <MiniMetric
          label={t('metricParticipation')}
          value={`${completionRate}%`}
          hint={t('metricParticipationHint', { submitted: studentIdsWithSubmission.size, total: studentCount })}
          color="violet"
        />
        <MiniMetric
          label={t('metricAvgTime')}
          value={formatDuration(averageTimeSeconds, t('minuteUnit'))}
          hint={t('metricAvgTimeHint')}
          color="amber"
        />
      </div>

      <RecentStudentsSection students={recentStudents} t={t} locale={locale} />

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardPanel title={t('chartSubmissionsByMonth')} subtitle={t('chartSubmissionsByMonthSub')}>
          <BarChart data={submissionVolume} />
        </DashboardPanel>

        <DashboardPanel title={t('chartAccuracyDist')} subtitle={t('chartAccuracyDistSub')}>
          <AccuracyBands data={accuracyBands} t={t} />
        </DashboardPanel>

        <DashboardPanel title={t('chartLearningFunnel')} subtitle={t('chartLearningFunnelSub')}>
          <HorizontalBars data={funnelData} />
        </DashboardPanel>

        <DashboardPanel title={t('chartCoursePerf')} subtitle={t('chartCoursePerfSub')}>
          {coursePerformance.length > 0 ? (
            <HorizontalBars data={coursePerformance} suffix="%" />
          ) : (
            <div className="py-12 text-center text-sm text-mute-light">{t('noCourseData')}</div>
          )}
        </DashboardPanel>
      </div>

      <DashboardPanel title={t('recentSubmissions')} subtitle={t('recentSubmissionsSub')}>
        <RecentSubmissions rows={recentSubmissions} t={t} locale={locale} />
      </DashboardPanel>

      {/* ── Leaderboards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-7 2xl:grid-cols-2">
        <AccuracyLeaderboard students={accuracyLeaders} t={t} />
        <CompletionLeaderboard students={completionLeaders} t={t} />
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={t('totalStudentsLabel')}
          value={studentCount}
          color="blue"
          delay={0}
          trend={t('activeStudentsTrend', { count: activeCount })}
          icon={
            <AppIcon name="users" className="h-5 w-5" />
          }
        />
        <StatCard
          label={t('openCoursesLabel')}
          value={courseCount}
          color="violet"
          delay={80}
          icon={
            <AppIcon name="book" className="h-5 w-5" />
          }
        />
        <StatCard
          label={t('totalAssignmentsLabel')}
          value={assignmentCount}
          color="amber"
          delay={160}
          icon={
            <AppIcon name="clipboard" className="h-5 w-5" />
          }
        />
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-[#7a7164] uppercase tracking-wider mb-3">
          {t('quickActionsTitle')}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action, i) => (
            <Link
              key={action.href}
              href={action.href}
              className="group relative overflow-hidden rounded-2xl border border-[#e7e0d2] bg-white/90 p-4 text-[#25231d] shadow-[0_14px_36px_rgba(67,57,39,0.08)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(67,57,39,0.12)] focus:outline-none focus:ring-2 focus:ring-[#d8c28a] animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="relative">
                <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${action.accent} text-white`}>
                  {action.icon}
                </div>
                <p className="font-semibold text-sm leading-tight">{action.label}</p>
                <p className="text-xs text-[#7a7164] mt-0.5">{action.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

    </div>
  )
}
