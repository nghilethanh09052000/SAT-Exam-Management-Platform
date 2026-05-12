import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'

interface ExamPaperRow {
  id: string
  title: string
  source: string | null
  year: number | null
  description: string | null
  created_at: string
}

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
    .select('id, title, source, year, description, created_at')
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
        <div className="space-y-2">
          {papers.map((p) => (
            <Link
              key={p.id}
              href={`/teacher/exam-papers/${p.id}`}
              className="flex items-center gap-4 px-5 py-4 bg-surface-card rounded-card hover:bg-surface-soft transition-colors block"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{p.title}</p>
                <p className="text-xs text-mute-light mt-1">
                  {[p.source, p.year].filter(Boolean).join(' · ')}
                  {(p.source || p.year) ? ' · ' : ''}
                  {new Date(p.created_at).toLocaleDateString('vi-VN')}
                </p>
                {p.description && (
                  <p className="text-xs text-mute-light mt-0.5 truncate max-w-xl">{p.description}</p>
                )}
              </div>
              <Badge variant="info">Đề thi</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
