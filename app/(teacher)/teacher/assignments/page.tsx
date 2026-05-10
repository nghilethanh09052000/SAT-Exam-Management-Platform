import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'

interface AssignmentRow {
  id: string
  title: string
  created_at: string
  archived_at: string | null
}

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
        <div className="space-y-2">
          {assignments.map((a) => (
            <Link
              key={a.id}
              href={`/teacher/assignments/${a.id}`}
              className="flex items-center gap-4 px-5 py-4 bg-surface-card rounded-card hover:bg-surface-soft transition-colors block"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{a.title}</p>
                <p className="text-xs text-mute-light mt-1">
                  {new Date(a.created_at).toLocaleDateString('vi-VN')}
                </p>
              </div>
              <Badge variant="default">Ngân hàng</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
