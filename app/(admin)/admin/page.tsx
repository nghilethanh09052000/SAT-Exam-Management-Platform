import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import type { Profile } from '@/types'

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

// ── Quick-action card data ─────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    href: '/admin/students',
    label: 'Import học sinh',
    sub: 'Tải danh sách CSV',
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
    label: 'Tạo khóa học',
    sub: 'Mở lớp mới',
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
    label: 'Upload câu hỏi',
    sub: 'Từ file .docx',
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
    label: 'Tạo bài tập',
    sub: 'Giao đề cho học sinh',
    gradient: 'from-amber-400 to-orange-500',
    shadow: 'shadow-amber-500/30',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
]

export default async function AdminDashboard() {
  const supabase = createServerClient()

  const [studentResult, courseResult, assignmentResult, studentsData, activeEnrollResult] =
    await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
      supabase.from('courses').select('id', { count: 'exact', head: true }).is('archived_at', null),
      supabase.from('assignment_instances').select('id', { count: 'exact', head: true }),
      supabase
        .from('profiles')
        .select('id, full_name, phone, is_active, created_at')
        .eq('role', 'student')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('is_active', true),
    ])

  const studentCount    = studentResult.count    ?? 0
  const courseCount     = courseResult.count      ?? 0
  const assignmentCount = assignmentResult.count  ?? 0
  const activeCount     = activeEnrollResult.count ?? 0

  type StudentRow = Pick<Profile, 'id' | 'full_name' | 'phone' | 'is_active' | 'created_at'>
  const recentStudents: StudentRow[] = studentsData.data ?? []

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 p-6 text-white shadow-xl shadow-indigo-500/25">
        {/* Decorative blobs */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 rounded-full bg-white/5 blur-xl pointer-events-none" />

        <div className="relative">
          <p className="text-sm font-medium text-white/70 mb-1">
            Chào mừng trở lại 👋
          </p>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Bảng điều khiển Admin</h1>
          <p className="mt-1 text-white/60 text-sm">Quản lý toàn bộ hệ thống SAT Platform</p>
        </div>

        {/* Mini stats strip */}
        <div className="relative mt-5 flex gap-6 flex-wrap">
          {[
            { label: 'Học sinh đang HĐ', value: activeCount },
            { label: 'Khóa học mở', value: courseCount },
            { label: 'Bài tập', value: assignmentCount },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-white/60">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Tổng học sinh"
          value={studentCount}
          color="blue"
          delay={0}
          trend={`${activeCount} đang hoạt động`}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label="Khóa học đang mở"
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
          label="Tổng bài tập"
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
          Thao tác nhanh
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

      {/* ── Recent students ───────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-display font-semibold text-ink">
            Học sinh mới đăng ký
          </h2>
          <Link
            href="/admin/students"
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
          >
            Xem tất cả
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {recentStudents.length === 0 ? (
            <div className="py-16 text-center text-sm text-mute-light">Chưa có học sinh nào</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recentStudents.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/70 transition-colors animate-fade-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarGradient(s.full_name)} flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-md`}>
                    {s.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>

                  {/* Name + phone */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{s.full_name}</p>
                    <p className="text-xs text-mute-light">{s.phone ?? '—'}</p>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                    <span className={`text-xs font-medium ${s.is_active ? 'text-emerald-600' : 'text-mute-light'}`}>
                      {s.is_active ? 'Hoạt động' : 'Vô hiệu'}
                    </span>
                  </div>

                  {/* Date */}
                  <span className="text-xs text-mute-light whitespace-nowrap hidden sm:block">
                    {new Date(s.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
