import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Link } from '@/i18n/navigation'

interface ExamPaperRow {
  id: string
  title: string
  source: string | null
  year: number | null
  description: string | null
  is_public: boolean
  created_at: string
}

const PAPER_THEMES = [
  { icon: 'from-blue-500 to-indigo-600', halo: 'bg-blue-50', border: 'hover:shadow-blue-100' },
  { icon: 'from-violet-500 to-purple-600', halo: 'bg-violet-50', border: 'hover:shadow-violet-100' },
  { icon: 'from-emerald-400 to-teal-500', halo: 'bg-emerald-50', border: 'hover:shadow-emerald-100' },
  { icon: 'from-amber-400 to-orange-500', halo: 'bg-amber-50', border: 'hover:shadow-amber-100' },
]

export default async function ExamPapersPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .single()
  const isAdmin = (profileData as { role: string } | null)?.role === 'admin'

  const baseQuery = supabase
    .from('exam_papers')
    .select('id, title, source, year, description, is_public, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  const { data } = isAdmin
    ? await baseQuery
    : await baseQuery.eq('created_by', user?.id ?? '')

  const papers: ExamPaperRow[] = (data as ExamPaperRow[] | null) ?? []

  return (
    <div>
      <PageHeader
        title="Ngân Hàng Đề Thi"
        description={`${papers.length} đề thi`}
        action={
          <Link href="/teacher/exam-papers/new">
            <Button>Tạo đề thi mới</Button>
          </Link>
        }
      />

      {papers.length === 0 ? (
        <EmptyState
          title="Chưa có đề thi nào"
          description="Tạo đề thi SAT đầu tiên từ ngân hàng câu hỏi"
          action={
            <Link href="/teacher/exam-papers/new">
              <Button>Tạo đề thi mới</Button>
            </Link>
          }
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {papers.map((p, i) => {
            const theme = PAPER_THEMES[i % PAPER_THEMES.length]
            return (
            <Link
              key={p.id}
              href={`/teacher/exam-papers/${p.id}`}
              className={`group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${theme.border} animate-fade-up`}
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br from-white/10 to-slate-100/70" />
              <div className="relative">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${theme.halo}`}>
                    <div className={`h-8 w-8 rounded-xl bg-gradient-to-br ${theme.icon} text-white flex items-center justify-center shadow-sm`}>
                      <span className="text-xs font-bold">SAT</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="info">Đề thi</Badge>
                    {p.is_public && <Badge variant="success">Public</Badge>}
                  </div>
                </div>
                <p className="text-sm font-semibold text-ink truncate group-hover:text-primary transition-colors">{p.title}</p>
                <p className="text-xs text-mute-light mt-2">
                  {[p.source, p.year].filter(Boolean).join(' · ')}
                  {(p.source || p.year) ? ' · ' : ''}
                  {new Date(p.created_at).toLocaleDateString('vi-VN')}
                </p>
                {p.description && (
                  <p className="text-xs text-mute-light mt-2 line-clamp-2">{p.description}</p>
                )}
              </div>
            </Link>
          )})}
        </div>
      )}
    </div>
  )
}
