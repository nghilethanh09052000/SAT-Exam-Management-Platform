import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { AdminCoursesClient } from './courses-client'

interface CourseRow {
  id: string
  title: string
  start_date: string
  end_date: string
  archived_at: string | null
  created_at: string
  teacher_id: string
  profiles: { full_name: string } | null
}

export default async function AdminCoursesPage() {
  const supabase = createServerClient()

  const { data } = await supabase
    .from('courses')
    .select('id, title, start_date, end_date, archived_at, created_at, teacher_id, profiles(full_name)')
    .order('created_at', { ascending: false })

  const courses: CourseRow[] = (data as CourseRow[] | null) ?? []

  return (
    <div>
      <PageHeader
        title="Khóa học"
        description="Xem và quản lý tất cả khóa học trong hệ thống"
      />
      <AdminCoursesClient courses={courses} />
    </div>
  )
}
