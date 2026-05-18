import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'

interface AssignmentRow {
  id: string
  title: string
  created_at: string
  archived_at: string | null
}

const ASSIGNMENT_THEMES = [
  { icon: 'from-sky-500 to-blue-600', chip: 'bg-sky-50 text-sky-700', glow: 'hover:shadow-sky-100' },
  { icon: 'from-violet-500 to-purple-600', chip: 'bg-violet-50 text-violet-700', glow: 'hover:shadow-violet-100' },
  { icon: 'from-emerald-400 to-teal-500', chip: 'bg-emerald-50 text-emerald-700', glow: 'hover:shadow-emerald-100' },
  { icon: 'from-amber-400 to-orange-500', chip: 'bg-amber-50 text-amber-700', glow: 'hover:shadow-amber-100' },
]

export default async function AssignmentsPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Admin sees all assignments; teacher only sees their own
  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .single()
  const isAdmin = (profileData as { role: string } | null)?.role === 'admin'

  const baseQuery = supabase
    .from('assignments')
    .select('id, title, created_at, archived_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  const { data } = isAdmin
    ? await baseQuery
    : await baseQuery.eq('created_by', user?.id ?? '')

  const assignments: AssignmentRow[] = (data as AssignmentRow[] | null) ?? []

  return (
    <div>
      <PageHeader
        title="Bài tập"
        description={`${assignments.length} bài tập trong ngân hàng`}
        action={
          <Link href="/teacher/assignments/new">
            <Button>Tạo bài tập</Button>
          </Link>
        }
      />

      {assignments.length === 0 ? (
        <EmptyState
          title="Chưa có bài tập nào"
          description="Tạo bài tập đầu tiên để giao cho học sinh"
          action={
            <Link href="/teacher/assignments/new">
              <Button>Tạo bài tập</Button>
            </Link>
          }
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assignments.map((a, i) => {
            const theme = ASSIGNMENT_THEMES[i % ASSIGNMENT_THEMES.length]
            return (
            <Link
              key={a.id}
              href={`/teacher/assignments/${a.id}`}
              className={`group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${theme.glow} animate-fade-up`}
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${theme.icon} text-white shadow-sm`}>
                  <span className="text-base font-bold">✓</span>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${theme.chip}`}>
                  Ngân hàng
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink truncate group-hover:text-primary transition-colors">{a.title}</p>
                <p className="text-xs text-mute-light mt-2">
                  {new Date(a.created_at).toLocaleDateString('vi-VN')}
                </p>
              </div>
              <div className="mt-4 h-px bg-gradient-to-r from-gray-100 via-gray-100 to-transparent" />
              <p className="mt-3 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Xem chi tiết →
              </p>
            </Link>
          )})}
        </div>
      )}
    </div>
  )
}
