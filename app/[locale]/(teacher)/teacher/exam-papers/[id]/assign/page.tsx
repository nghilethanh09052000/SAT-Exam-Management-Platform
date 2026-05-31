import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { AssignPracticeTestForm } from './assign-practice-test-form'

type CourseWithHierarchy = {
  id: string
  title: string
  classes: Array<{
    id: string
    title: string
    course_id: string
    archived_at: string | null
    weeks: Array<{ id: string; title: string; class_id: string; order: number }>
  }>
}

export default async function AssignPracticeTestPage({
  params,
}: {
  params: { id: string; locale: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.examPapers')
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? ''

  const { data: paper } = await supabase
    .from('exam_papers')
    .select('id, title, created_by')
    .eq('id', params.id)
    .is('archived_at', null)
    .single()

  if (!paper) notFound()

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  const isAdmin = (profileData as { role?: string } | null)?.role === 'admin'
  if (!isAdmin && (paper as { created_by: string }).created_by !== userId) notFound()

  const today = new Date().toISOString().slice(0, 10)
  let coursesQuery = supabase
    .from('courses')
    .select('id, title, classes(id, title, course_id, archived_at, weeks(id, title, class_id, order))')
    .is('archived_at', null)
    .gte('end_date', today)
    .order('title')
  if (!isAdmin) coursesQuery = coursesQuery.eq('teacher_id', userId)

  const { data } = await coursesQuery
  const hierarchy = (data as CourseWithHierarchy[] | null) ?? []
  const courses = hierarchy.map((course) => ({ id: course.id, title: course.title }))
  const classes = hierarchy.flatMap((course) =>
    (course.classes ?? [])
      .filter((cls) => cls.archived_at === null)
      .map((cls) => ({ id: cls.id, title: cls.title, course_id: cls.course_id }))
  )
  const weeks = hierarchy
    .flatMap((course) => (course.classes ?? []).flatMap((cls) => cls.weeks ?? []))
    .sort((a, b) => a.order - b.order)

  return (
    <div>
      <PageHeader
        title={t('assignTitle')}
        breadcrumbs={[
          { label: t('breadcrumb'), href: '/teacher/exam-papers' },
          { label: (paper as { title: string }).title, href: `/teacher/exam-papers/${params.id}` },
          { label: t('assignBreadcrumb') },
        ]}
        description={(paper as { title: string }).title}
      />
      {classes.length === 0 ? (
        <EmptyState title={t('assignEmptyClasses')} description={t('assignEmptyClassesDesc')} />
      ) : (
        <AssignPracticeTestForm practiceTestId={params.id} courses={courses} classes={classes} weeks={weeks} />
      )}
    </div>
  )
}
