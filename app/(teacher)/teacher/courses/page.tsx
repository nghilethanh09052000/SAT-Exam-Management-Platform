import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'

interface CourseRow {
  id: string
  title: string
  start_date: string
  end_date: string
  created_at: string
}

interface ClassRow {
  id: string
  course_id: string
}

export default async function TeacherCoursesPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const coursesResult = await supabase
    .from('courses')
    .select('id, title, start_date, end_date, created_at')
    .eq('teacher_id', user?.id ?? '')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  const courses: CourseRow[] = (coursesResult.data as CourseRow[] | null) ?? []

  // Get class counts per course
  const courseIds = courses.map((c) => c.id)
  const classesResult = courseIds.length > 0
    ? await supabase
        .from('classes')
        .select('id, course_id')
        .in('course_id', courseIds)
        .is('archived_at', null)
    : { data: [] as ClassRow[] }

  const classes: ClassRow[] = (classesResult.data as ClassRow[] | null) ?? []

  const classCountMap: Record<string, number> = {}
  for (const cls of classes) {
    classCountMap[cls.course_id] = (classCountMap[cls.course_id] ?? 0) + 1
  }

  return (
    <div>
      <PageHeader
        title="Khóa học"
        description="Quản lý tất cả khóa học của bạn"
        action={
          <Link href="/teacher/courses/new">
            <Button>Tạo khóa học mới</Button>
          </Link>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          title="Chưa có khóa học nào"
          description="Tạo khóa học đầu tiên để bắt đầu quản lý lớp học"
          action={
            <Link href="/teacher/courses/new">
              <Button>Tạo khóa học mới</Button>
            </Link>
          }
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => (
            <Link key={course.id} href={`/teacher/courses/${course.id}`}>
              <Card className="p-6 hover:shadow-sm transition-shadow cursor-pointer">
                <h3 className="font-display font-semibold text-ink mb-2 truncate">
                  {course.title}
                </h3>
                <div className="text-sm text-mute-light space-y-1">
                  <p>
                    {new Date(course.start_date).toLocaleDateString('vi-VN')} —{' '}
                    {new Date(course.end_date).toLocaleDateString('vi-VN')}
                  </p>
                  <p>{classCountMap[course.id] ?? 0} lớp</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
