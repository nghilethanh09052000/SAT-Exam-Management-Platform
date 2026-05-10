import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import type { Course } from '@/types'

export default async function AdminCoursesPage() {
  const supabase = createServerClient()

  const { data } = await supabase
    .from('courses')
    .select('id, title, start_date, end_date, archived_at, created_at')
    .order('created_at', { ascending: false })

  const courses: Pick<Course, 'id' | 'title' | 'start_date' | 'end_date' | 'archived_at' | 'created_at'>[] = data ?? []

  const tableData: Record<string, unknown>[] = courses.map((c) => ({
    id: c.id,
    title: c.title,
    start_date: c.start_date,
    end_date: c.end_date,
    archived_at: c.archived_at,
    created_at: c.created_at,
  }))

  return (
    <div>
      <PageHeader
        title="Khóa học"
        description="Xem tất cả khóa học trong hệ thống"
      />
      <DataTable
        columns={[
          { key: 'title', header: 'Tên khóa học' },
          {
            key: 'start_date',
            header: 'Bắt đầu',
            render: (row) =>
              new Date(String(row.start_date)).toLocaleDateString('vi-VN'),
          },
          {
            key: 'end_date',
            header: 'Kết thúc',
            render: (row) =>
              new Date(String(row.end_date)).toLocaleDateString('vi-VN'),
          },
          {
            key: 'archived_at',
            header: 'Trạng thái',
            render: (row) =>
              row.archived_at ? (
                <Badge variant="muted">Đã lưu trữ</Badge>
              ) : (
                <Badge variant="success">Đang hoạt động</Badge>
              ),
          },
        ]}
        data={tableData}
        keyField="id"
        emptyMessage="Chưa có khóa học nào"
      />
    </div>
  )
}
