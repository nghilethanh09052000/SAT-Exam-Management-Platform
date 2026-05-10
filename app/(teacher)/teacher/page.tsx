import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'

interface AssignmentRow {
  id: string
  deadline: string
  published_at: string | null
  assignment_id: string
  assignments: { title: string } | null
  classes: { title: string } | null
}

export default async function TeacherDashboard() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [courseResult, questionResult, instancesResult] = await Promise.all([
    supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .is('archived_at', null)
      .eq('teacher_id', user?.id ?? ''),
    supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .is('archived_at', null)
      .eq('created_by', user?.id ?? ''),
    supabase
      .from('assignment_instances')
      .select('id, deadline, published_at, assignment_id, class_id, assignments(title), classes(title)')
      .order('deadline', { ascending: true })
      .limit(10),
  ])

  const courseCount = courseResult.count
  const questionCount = questionResult.count
  const assignments: AssignmentRow[] = (instancesResult.data as AssignmentRow[] | null) ?? []

  // Count open assignments (deadline in future)
  const now = new Date().toISOString()
  const openCount = assignments.filter((a) => a.deadline > now).length

  const tableData: Record<string, unknown>[] = assignments.map((a) => ({
    id: a.id,
    title: a.assignments?.title ?? '—',
    class_name: a.classes?.title ?? '—',
    deadline: a.deadline,
    published_at: a.published_at,
  }))

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        description="Chào mừng bạn trở lại SAT Platform"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard
          label="Khóa học hoạt động"
          value={courseCount ?? 0}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
        <StatCard
          label="Bài tập đang mở"
          value={openCount}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          label="Câu hỏi trong ngân hàng"
          value={questionCount ?? 0}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Tổng bài tập"
          value={assignments.length}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />
      </div>

      {/* Recent assignments */}
      <div>
        <h2 className="text-lg font-display font-semibold text-ink mb-4">
          Bài tập gần đây
        </h2>
        <DataTable
          columns={[
            { key: 'title', header: 'Tên bài tập' },
            { key: 'class_name', header: 'Lớp' },
            {
              key: 'deadline',
              header: 'Hạn nộp',
              render: (row) =>
                new Date(String(row.deadline)).toLocaleDateString('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
            },
            {
              key: 'published_at',
              header: 'Trạng thái',
              render: (row) => {
                const deadline = String(row.deadline)
                const isExpired = deadline < now
                if (isExpired) return <Badge variant="muted">Đã hết hạn</Badge>
                if (!row.published_at) return <Badge variant="warning">Chưa xuất bản</Badge>
                return <Badge variant="success">Đang mở</Badge>
              },
            },
          ]}
          data={tableData}
          keyField="id"
          emptyMessage="Chưa có bài tập nào"
        />
      </div>
    </div>
  )
}
