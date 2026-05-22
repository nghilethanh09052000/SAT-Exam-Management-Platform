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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course, index) => {
            const tones = [
              'from-blue-500 to-indigo-600',
              'from-violet-500 to-purple-600',
              'from-cyan-500 to-sky-600',
              'from-emerald-400 to-teal-500',
            ]
            const tone = tones[index % tones.length]
            return (
              <Link
                key={course.id}
                href={`/teacher/courses/${course.id}`}
                className="group relative overflow-hidden rounded-3xl border border-white/70 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl animate-fade-up"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${tone}`} />
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-slate-100/80 transition-transform duration-300 group-hover:scale-125" />
                <div className="relative">
                  <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${tone} text-white shadow-sm`}>
                    <span className="text-base font-bold">{classCountMap[course.id] ?? 0}</span>
                  </div>
                  <h3 className="font-display font-semibold text-ink truncate group-hover:text-primary transition-colors">
                    {course.title}
                  </h3>
                  <div className="mt-3 space-y-1 text-sm text-mute-light">
                    <p>
                      {new Date(course.start_date).toLocaleDateString('vi-VN')} —{' '}
                      {new Date(course.end_date).toLocaleDateString('vi-VN')}
                    </p>
                    <p>{classCountMap[course.id] ?? 0} lớp đang quản lý</p>
                  </div>
                  <p className="mt-5 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Xem khóa học →
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
