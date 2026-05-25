import { Link } from '@/i18n/navigation'
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui/stat-card'

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
        className={`${sizeClass} rounded-full object-cover`}
      />
    )
  }

  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br ${avatarGradient(student.name)} flex items-center justify-center font-black text-white shadow-inner`}>
      {student.name[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function InfoIcon() {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#93b2ff] text-sm font-black text-[#6f97ff]">
      i
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
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f7fb] text-[#2f3137]">
        {icon}
      </span>
      <h2 className="text-[19px] font-black tracking-[-0.02em] text-[#202228]">
        {title}
      </h2>
      <InfoIcon />
    </div>
  )
}

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-3xl leading-none">🥇</span>
  if (rank === 2) return <span className="text-3xl leading-none">🥈</span>
  if (rank === 3) return <span className="text-3xl leading-none">🥉</span>
  return <span className="text-lg font-medium text-[#303238]">{rank}</span>
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
    <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
      <div className="p-5 pb-0">
        <PanelTitle
          title={t('accuracyLeaderTitle')}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 20V10m7 10V4m7 16v-7M3 20h18M8 8l4-4 4 4" />
            </svg>
          }
        />
      </div>

      {students.length === 0 ? (
        <div className="px-5 pb-8 text-center text-sm text-mute-light">{t('noSubmissions')}</div>
      ) : (
        <>
          <div className="relative h-[260px] bg-gradient-to-b from-white to-[#f5f8ff] px-5">
            {second && (
              <div className="absolute bottom-0 left-[8%] flex w-[28%] flex-col items-center">
                <div className="mb-2 rounded-full border-[4px] border-[#d7d9de] bg-white shadow-lg">
                  <StudentAvatar student={second} size="lg" />
                </div>
                <p className="mb-1 text-[17px] font-black text-[#b8bbc0]">{second.accuracy.toFixed(1)}%</p>
                <div className="flex h-[74px] w-full flex-col items-center justify-center rounded-t-[6px] bg-[#5d8be8] px-2 text-center text-white shadow-lg">
                  <p className="line-clamp-2 text-sm font-black leading-tight">{second.name}</p>
                  <p className="mt-1 max-w-full truncate text-[11px] font-semibold text-white/55">{second.email}</p>
                </div>
              </div>
            )}

            {first && (
              <div className="absolute bottom-0 left-1/2 z-10 flex w-[36%] -translate-x-1/2 flex-col items-center">
                <div className="relative mb-3">
                  <span className="absolute -left-9 top-5 text-4xl text-[#d8b849]">❦</span>
                  <span className="absolute -right-9 top-5 scale-x-[-1] text-4xl text-[#d8b849]">❦</span>
                  <span className="absolute -right-3 -top-4 rotate-12 text-3xl">👑</span>
                  <div className="rounded-full border-[5px] border-[#e8c84e] bg-white shadow-xl">
                    <StudentAvatar student={first} size="xl" />
                  </div>
                </div>
                <p className="mb-2 text-[18px] font-black text-[#d8b849]">{first.accuracy.toFixed(1)}%</p>
                <div className="flex h-[116px] w-full flex-col items-center justify-center rounded-t-[6px] bg-[#5f8fe9] px-3 text-center text-white shadow-xl">
                  <p className="line-clamp-2 text-sm font-black leading-tight">{first.name}</p>
                  <p className="mt-1 max-w-full truncate text-[11px] font-semibold text-white/55">{first.email}</p>
                </div>
              </div>
            )}

            {third && (
              <div className="absolute bottom-0 right-[8%] flex w-[28%] flex-col items-center">
                <div className="relative mb-2 rounded-full border-[4px] border-[#c98a27] bg-white shadow-lg">
                  <span className="absolute -right-3 -top-3 rotate-12 text-2xl">👑</span>
                  <StudentAvatar student={third} size="lg" />
                </div>
                <p className="mb-1 text-[17px] font-black text-[#b47a42]">{third.accuracy.toFixed(1)}%</p>
                <div className="flex h-[68px] w-full flex-col items-center justify-center rounded-t-[6px] bg-[#5d8be8] px-2 text-center text-white shadow-lg">
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
                  className={['grid grid-cols-[42px_1fr_70px] items-center gap-3 px-4 py-2.5', rank % 2 === 1 ? 'bg-[#f7f9fc]' : 'bg-white'].join(' ')}
                >
                  <span className="text-lg font-medium text-[#303238]">{rank}</span>
                  <StudentIdentity student={student} />
                  <span className="text-right text-base font-medium text-[#303238]">{student.accuracy.toFixed(1)}</span>
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
    <section className="rounded-[24px] bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
      <PanelTitle
        title={t('completionLeaderTitle')}
        icon={
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M8 5h8a2 2 0 012 2v12H6V7a2 2 0 012-2zm-3 7H3a2 2 0 00-2 2v3a2 2 0 002 2h3m15-7h-2v7h2a2 2 0 002-2v-3a2 2 0 00-2-2z" />
          </svg>
        }
      />

      <div className="grid grid-cols-[92px_1fr_128px] rounded-t-[8px] bg-[#d7e7ff] px-5 py-3 text-sm font-black text-[#303238]">
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
                className={['grid grid-cols-[92px_1fr_128px] items-center px-5 py-2.5', rank % 2 === 0 ? 'bg-[#f7f9fc]' : 'bg-white'].join(' ')}
              >
                <div className="flex items-center justify-center">
                  <Medal rank={rank} />
                </div>
                <StudentIdentity student={student} />
                <span className="text-center text-lg font-medium text-[#303238]">{student.completed}</span>
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
    <section className="rounded-[24px] bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
      <div className="mb-5">
        <h2 className="text-xl font-black tracking-[-0.02em] text-[#202228]">{title}</h2>
        {subtitle && <p className="mt-1 text-sm font-medium text-[#969ba3]">{subtitle}</p>}
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
    blue: 'from-blue-500 to-indigo-600 shadow-blue-500/25',
    emerald: 'from-emerald-400 to-teal-600 shadow-emerald-500/25',
    amber: 'from-amber-400 to-orange-500 shadow-amber-500/25',
    violet: 'from-violet-500 to-purple-600 shadow-violet-500/25',
  }

  return (
    <div className={`rounded-[22px] bg-gradient-to-br ${colors[color]} p-5 text-white shadow-lg`}>
      <p className="text-sm font-bold text-white/75">{label}</p>
      <p className="mt-2 text-4xl font-black leading-none">{value}</p>
      <p className="mt-3 text-xs font-semibold text-white/65">{hint}</p>
    </div>
  )
}

function BarChart({ data }: { data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((item) => item.value))

  return (
    <div className="flex h-72 items-end gap-3">
      {data.map((item) => {
        const height = Math.max(8, (item.value / max) * 100)
        return (
          <div key={item.label} className="flex flex-1 flex-col items-center gap-3">
            <div className="flex h-56 w-full items-end rounded-2xl bg-[#f5f7fb] p-2">
              <div
                className="w-full rounded-xl bg-gradient-to-t from-[#4d7cff] to-[#9bb8ff] shadow-[0_8px_18px_rgba(77,124,255,0.22)]"
                style={{ height: `${height}%` }}
                title={`${item.label}: ${item.value}`}
              />
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-[#303238]">{item.value}</p>
              <p className="text-xs font-semibold text-[#969ba3]">{item.label}</p>
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
                <p className="text-sm font-black text-[#303238]">{item.label}</p>
                {item.detail && <p className="text-xs font-semibold text-[#969ba3]">{item.detail}</p>}
              </div>
              <p className="text-sm font-black text-[#303238]">{item.value}{suffix}</p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#eef2f8]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#4d7cff] to-[#88a9ff]"
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
  const palette = ['bg-red-400', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-400']

  return (
    <div className="space-y-5">
      <div className="flex h-8 overflow-hidden rounded-full bg-[#eef2f8]">
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
          <div key={item.label} className="rounded-2xl bg-[#f7f9fc] p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${palette[index % palette.length]}`} />
              <span className="text-sm font-black text-[#303238]">{item.label}</span>
            </div>
            <p className="text-2xl font-black text-[#202228]">{item.value}</p>
            <p className="text-xs font-semibold text-[#969ba3]">{t('studentUnit')}</p>
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
    <div className="overflow-hidden rounded-2xl border border-[#eef1f6]">
      {rows.map((row, index) => (
        <div key={row.id} className={['grid grid-cols-[1fr_110px_150px] items-center gap-4 px-5 py-4', index % 2 ? 'bg-[#f8fafc]' : 'bg-white'].join(' ')}>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[#303238]">{row.studentName}</p>
            <p className="truncate text-xs font-semibold text-[#969ba3]">{row.studentEmail}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-[#303238]">{row.scoreText}</p>
            <p className="text-xs font-semibold text-[#969ba3]">{row.accuracy.toFixed(0)}%</p>
          </div>
          <p className="text-right text-xs font-semibold text-[#969ba3]">
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
          className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          {t('viewAll')}
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="h-3 w-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {students.length === 0 ? (
          <div className="py-16 text-center text-sm text-mute-light">{t('noStudents')}</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {students.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50/70 animate-fade-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className={`h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br ${avatarGradient(s.full_name)} flex items-center justify-center text-sm font-bold text-white shadow-md`}>
                  {s.full_name?.[0]?.toUpperCase() ?? '?'}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{s.full_name}</p>
                  <p className="text-xs text-mute-light">{s.phone ?? '—'}</p>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.is_active ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                  <span className={`text-xs font-medium ${s.is_active ? 'text-emerald-600' : 'text-mute-light'}`}>
                    {s.is_active ? t('statusActive') : t('statusInactive')}
                  </span>
                </div>

                <span className="hidden whitespace-nowrap text-xs text-mute-light sm:block">
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
      gradient: 'from-blue-500 to-indigo-600',
      shadow: 'shadow-blue-500/30',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      ),
    },
    {
      href: '/admin/courses',
      label: t('createCourse'),
      sub: t('createCourseSub'),
      gradient: 'from-violet-500 to-purple-600',
      shadow: 'shadow-violet-500/30',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      href: '/teacher/questions/upload',
      label: t('uploadQuestions'),
      sub: t('uploadQuestionsSub'),
      gradient: 'from-emerald-400 to-teal-600',
      shadow: 'shadow-emerald-500/30',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      ),
    },
    {
      href: '/teacher/assignments',
      label: t('createAssignment'),
      sub: t('createAssignmentSub'),
      gradient: 'from-amber-400 to-orange-500',
      shadow: 'shadow-amber-500/30',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
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
    <div className="space-y-8 animate-fade-in">
      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 p-6 text-white shadow-xl shadow-indigo-500/25">
        {/* Decorative blobs */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 rounded-full bg-white/5 blur-xl pointer-events-none" />

        <div className="relative">
          <p className="text-sm font-medium text-white/70 mb-1">
            {t('welcomeBack')} 👋
          </p>
          <h1 className="text-2xl md:text-3xl font-display font-bold">{t('title')}</h1>
          <p className="mt-1 text-white/60 text-sm">{t('subtitle')}</p>
        </div>

        {/* Mini stats strip */}
        <div className="relative mt-5 flex gap-6 flex-wrap">
          {[
            { label: t('statActiveStudents'), value: activeCount },
            { label: t('statOpenCourses'), value: courseCount },
            { label: t('statAssignments'), value: assignmentCount },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-2xl font-bold">{s.value}</p>
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
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label={t('openCoursesLabel')}
          value={courseCount}
          color="violet"
          delay={80}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
        <StatCard
          label={t('totalAssignmentsLabel')}
          value={assignmentCount}
          color="amber"
          delay={160}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-mute-light uppercase tracking-wider mb-3">
          {t('quickActionsTitle')}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((action, i) => (
            <Link
              key={action.href}
              href={action.href}
              className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${action.gradient}
                          text-white p-4 shadow-lg ${action.shadow}
                          hover:shadow-xl hover:-translate-y-1 transition-all duration-200
                          animate-fade-up`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10 transition-transform duration-300 group-hover:scale-150" />
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
                  {action.icon}
                </div>
                <p className="font-semibold text-sm leading-tight">{action.label}</p>
                <p className="text-xs text-white/65 mt-0.5">{action.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

    </div>
  )
}
