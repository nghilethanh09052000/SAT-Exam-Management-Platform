import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import type { Profile } from '@/types'

export default async function AdminDashboard() {
  const supabase = createServerClient()

  const [
    studentResult,
    courseResult,
    assignmentResult,
    studentsData,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student'),
    supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .is('archived_at', null),
    supabase
      .from('assignment_instances')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('id, full_name, phone, is_active, created_at')
      .eq('role', 'student')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const studentCount = studentResult.count
  const courseCount = courseResult.count
  const assignmentCount = assignmentResult.count

  type StudentRow = Pick<Profile, 'id' | 'full_name' | 'phone' | 'is_active' | 'created_at'>
  const recentStudents: StudentRow[] = studentsData.data ?? []

  const tableData: Record<string, unknown>[] = recentStudents.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    phone: s.phone,
    is_active: s.is_active,
    created_at: s.created_at,
  }))

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        description="Quản lý toàn bộ hệ thống SAT Platform"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        <StatCard
          label="Tổng học sinh"
          value={studentCount ?? 0}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label="Khóa học đang hoạt động"
          value={courseCount ?? 0}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
        <StatCard
          label="Tổng bài tập"
          value={assignmentCount ?? 0}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
      </div>

      {/* Recent students */}
      <div>
        <h2 className="text-lg font-display font-semibold text-ink mb-4">
          Học sinh mới đăng ký
        </h2>
        <DataTable
          columns={[
            { key: 'full_name', header: 'Họ tên' },
            {
              key: 'phone',
              header: 'Điện thoại',
              render: (row) => (row.phone as string | null) ?? '—',
            },
            {
              key: 'is_active',
              header: 'Trạng thái',
              render: (row) =>
                row.is_active ? (
                  <Badge variant="success">Đang hoạt động</Badge>
                ) : (
                  <Badge variant="error">Đã vô hiệu</Badge>
                ),
            },
            {
              key: 'created_at',
              header: 'Ngày đăng ký',
              render: (row) =>
                new Date(String(row.created_at)).toLocaleDateString('vi-VN'),
            },
          ]}
          data={tableData}
          keyField="id"
          emptyMessage="Chưa có học sinh nào"
        />
      </div>
    </div>
  )
}
