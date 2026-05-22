import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

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
  schedule_text: string
  created_at: string
}

interface EnrollmentRow {
  id: string
  class_id: string
  student_id: string
  enrolled_at: string
  profiles: {
    id: string
    full_name: string
    phone: string | null
    is_active: boolean
  } | null
}

export default async function CourseDetailPage({ params }: PageProps) {
  const supabase = createServerClient()
  const raw = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const courseResult = await supabase
    .from('courses')
    .select('id, title, start_date, end_date, teacher_id, created_at')
    .eq('id', params.id)
    .single()

  const course = courseResult.data as CourseRow | null
  if (!course) notFound()

  const classesResult = await supabase
    .from('classes')
    .select('id, title, schedule_text, created_at')
    .eq('course_id', params.id)
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  const classes: ClassRow[] = (classesResult.data as ClassRow[] | null) ?? []

  // Get enrollment counts per class
  const classIds = classes.map((c) => c.id)
  const enrollmentsResult = classIds.length > 0
    ? await raw
        .from('enrollments')
        .select('id, class_id, student_id, enrolled_at, profiles(id, full_name, phone, is_active)')
        .in('class_id', classIds)
        .order('enrolled_at', { ascending: true })
    : { data: [] as EnrollmentRow[] }

  const enrollments: EnrollmentRow[] = (enrollmentsResult.data as EnrollmentRow[] | null) ?? []

  const enrollmentMap: Record<string, number> = {}
  for (const e of enrollments) {
    enrollmentMap[e.class_id] = (enrollmentMap[e.class_id] ?? 0) + 1
  }

  const classMap = new Map(classes.map((cls) => [cls.id, cls]))

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
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls, index) => (
              <Link
                key={cls.id}
                href={`/teacher/courses/${params.id}/classes/${cls.id}`}
                className="animate-fade-up"
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <Card className="group relative overflow-hidden border border-white/70 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500" />
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-display font-semibold text-ink">
                      {cls.title}
                    </h3>
                    <Badge variant="info">
                      {enrollmentMap[cls.id] ?? 0} học sinh
                    </Badge>
                  </div>
                  <p className="text-sm text-mute-light">
                    {cls.schedule_text}
                  </p>
                </Card>
              </Link>
            ))}
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-display font-semibold text-ink">
                  Học sinh trong khóa học
                </h2>
                <p className="text-sm text-mute-light">
                  {enrollments.length} lượt ghi danh trong {classes.length} lớp
                </p>
              </div>
            </div>

            {enrollments.length === 0 ? (
              <Card className="p-5">
                <p className="text-sm text-mute-light">Chưa có học sinh nào được ghi danh.</p>
              </Card>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm animate-fade-up">
                <div className="grid grid-cols-[minmax(180px,2fr)_minmax(160px,1.5fr)_120px_120px] gap-0 bg-surface-soft px-4 py-3 text-xs font-semibold uppercase tracking-wide text-mute-light">
                  <span>Học sinh</span>
                  <span>Lớp</span>
                  <span>Số điện thoại</span>
                  <span>Trạng thái</span>
                </div>
                <div className="divide-y divide-hairline-light">
                  {enrollments.map((enrollment) => {
                    const cls = classMap.get(enrollment.class_id)
                    return (
                      <div
                        key={enrollment.id}
                        className="grid grid-cols-[minmax(180px,2fr)_minmax(160px,1.5fr)_120px_120px] gap-0 px-4 py-3 text-sm"
                      >
                        <span className="font-medium text-ink">
                          {enrollment.profiles?.full_name ?? 'Không rõ'}
                        </span>
                        <Link
                          href={`/teacher/courses/${params.id}/classes/${enrollment.class_id}`}
                          className="truncate text-primary hover:underline"
                        >
                          {cls?.title ?? '—'}
                        </Link>
                        <span className="text-mute-light">
                          {enrollment.profiles?.phone ?? '—'}
                        </span>
                        <span className={enrollment.profiles?.is_active ? 'text-emerald-700' : 'text-gray-500'}>
                          {enrollment.profiles?.is_active ? 'Hoạt động' : 'Vô hiệu'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
