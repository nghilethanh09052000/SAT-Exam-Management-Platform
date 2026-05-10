import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'

interface PageProps {
  params: { id: string }
}

interface CourseRow {
  id: string
  title: string
  start_date: string
  end_date: string
  teacher_id: string
  created_at: string
}

interface ClassRow {
  id: string
  title: string
  schedule_text: string | null
  start_date: string
  end_date: string
  created_at: string
}

interface EnrollmentRow {
  id: string
  class_id: string
}

export default async function CourseDetailPage({ params }: PageProps) {
  const supabase = createServerClient()

  const courseResult = await supabase
    .from('courses')
    .select('id, title, start_date, end_date, teacher_id, created_at')
    .eq('id', params.id)
    .single()

  const course = courseResult.data as CourseRow | null
  if (!course) notFound()

  const classesResult = await supabase
    .from('classes')
    .select('id, title, schedule_text, start_date, end_date, created_at')
    .eq('course_id', params.id)
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  const classes: ClassRow[] = (classesResult.data as ClassRow[] | null) ?? []

  // Get enrollment counts per class
  const classIds = classes.map((c) => c.id)
  const enrollmentsResult = classIds.length > 0
    ? await supabase
        .from('enrollments')
        .select('id, class_id')
        .in('class_id', classIds)
    : { data: [] as EnrollmentRow[] }

  const enrollments: EnrollmentRow[] = (enrollmentsResult.data as EnrollmentRow[] | null) ?? []

  const enrollmentMap: Record<string, number> = {}
  for (const e of enrollments) {
    enrollmentMap[e.class_id] = (enrollmentMap[e.class_id] ?? 0) + 1
  }

  return (
    <div>
      <PageHeader
        title={course.title}
        description={`${new Date(course.start_date).toLocaleDateString('vi-VN')} — ${new Date(course.end_date).toLocaleDateString('vi-VN')}`}
        breadcrumbs={[
          { label: 'Khóa học', href: '/teacher/courses' },
          { label: course.title },
        ]}
        action={
          <Link href={`/teacher/courses/${params.id}/classes/new`}>
            <Button>Thêm lớp</Button>
          </Link>
        }
      />

      {classes.length === 0 ? (
        <EmptyState
          title="Chưa có lớp nào"
          description="Thêm lớp học đầu tiên cho khóa học này"
          action={
            <Link href={`/teacher/courses/${params.id}/classes/new`}>
              <Button>Thêm lớp</Button>
            </Link>
          }
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls) => (
            <Link
              key={cls.id}
              href={`/teacher/courses/${params.id}/classes/${cls.id}`}
            >
              <Card className="p-5 hover:shadow-sm transition-shadow cursor-pointer">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-display font-semibold text-ink">
                    {cls.title}
                  </h3>
                  <Badge variant="info">
                    {enrollmentMap[cls.id] ?? 0} học sinh
                  </Badge>
                </div>
                {cls.schedule_text && (
                  <p className="text-sm text-mute-light mb-2">
                    {cls.schedule_text}
                  </p>
                )}
                <p className="text-xs text-ash-light">
                  {new Date(cls.start_date).toLocaleDateString('vi-VN')} —{' '}
                  {new Date(cls.end_date).toLocaleDateString('vi-VN')}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
