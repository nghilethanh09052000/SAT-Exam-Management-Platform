import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { ClassDetailClient } from './class-detail-client'

interface PageProps {
  params: { id: string; classId: string }
}

interface ClassRow {
  id: string
  title: string
  schedule_text: string | null
  start_date: string
  end_date: string
  course_id: string
}

interface CourseRow {
  id: string
  title: string
}

interface WeekRow {
  id: string
  title: string
  order: number
}

interface InstanceRow {
  id: string
  week_id: string
  deadline: string
  published_at: string | null
  title: string
}

export default async function ClassDetailPage({ params }: PageProps) {
  const supabase = createServerClient()

  const [clsResult, courseResult] = await Promise.all([
    supabase
      .from('classes')
      .select('id, title, schedule_text, start_date, end_date, course_id')
      .eq('id', params.classId)
      .single(),
    supabase
      .from('courses')
      .select('id, title')
      .eq('id', params.id)
      .single(),
  ])

  const cls = clsResult.data as ClassRow | null
  const course = courseResult.data as CourseRow | null

  if (!cls) notFound()

  const weeksResult = await supabase
    .from('weeks')
    .select('id, title, order')
    .eq('class_id', params.classId)
    .order('order', { ascending: true })

  const weeks: WeekRow[] = (weeksResult.data as WeekRow[] | null) ?? []
  const weekIds = weeks.map((w) => w.id)

  type RawInstance = {
    id: string
    week_id: string
    deadline: string
    published_at: string | null
    assignments: { title: string } | null
  }
  const instancesResult = weekIds.length > 0
    ? await supabase
        .from('assignment_instances')
        .select('id, week_id, deadline, published_at, assignments(title)')
        .in('week_id', weekIds)
        .order('deadline', { ascending: true })
    : { data: [] as RawInstance[] }

  const rawInstances: RawInstance[] = (instancesResult.data as RawInstance[] | null) ?? []

  const instances: InstanceRow[] = rawInstances.map((i) => ({
    id: i.id,
    week_id: i.week_id,
    deadline: i.deadline,
    published_at: i.published_at,
    title: i.assignments?.title ?? '—',
  }))

  return (
    <div>
      <PageHeader
        title={cls.title}
        description={cls.schedule_text ?? undefined}
        breadcrumbs={[
          { label: 'Khóa học', href: '/teacher/courses' },
          { label: course?.title ?? '...', href: `/teacher/courses/${params.id}` },
          { label: cls.title },
        ]}
      />

      <ClassDetailClient
        classId={params.classId}
        courseId={params.id}
        weeks={weeks}
        instances={instances}
      />
    </div>
  )
}
