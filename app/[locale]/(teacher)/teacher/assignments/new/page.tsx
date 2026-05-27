import { createServerClient } from '@/lib/supabase/server'
import { NewAssignmentWizard } from './new-assignment-wizard'

interface CourseRow {
  id: string
  title: string
}

interface ClassRow {
  id: string
  title: string
  course_id: string
}

interface WeekRow {
  id: string
  title: string
  class_id: string
  order: number
}

interface TagRow {
  id: string
  subject: string
  name: string
}

// Type for the nested courses+classes+weeks query
interface CourseWithHierarchy {
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

export default async function NewAssignmentPage({
  searchParams,
}: {
  searchParams?: { class_id?: string; week_id?: string }
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? ''

  // Fetch profile to check role (admins see all courses, teachers see only their own)
  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  const isAdmin = (profileData as { role?: string } | null)?.role === 'admin'

  // Two parallel queries: courses hierarchy + tags.
  // Questions are no longer fetched here — the wizard loads them lazily
  // via /api/questions (paginated, server-filtered) so the page renders instantly.
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  let coursesQuery = supabase
    .from('courses')
    .select('id, title, classes(id, title, course_id, archived_at, weeks(id, title, class_id, order))')
    .is('archived_at', null)
    .gte('end_date', today)   // exclude courses whose curriculum has ended
    .order('title')
  if (!isAdmin) coursesQuery = coursesQuery.eq('teacher_id', userId)

  const [coursesResult, tagsResult] = await Promise.all([
    coursesQuery,
    supabase
      .from('tags')
      .select('id, subject, name')
      .order('subject')
      .order('name'),
  ])

  // Flatten the nested courses→classes→weeks into the flat arrays the wizard expects
  const coursesWithHierarchy = (coursesResult.data as CourseWithHierarchy[] | null) ?? []
  const courses: CourseRow[] = coursesWithHierarchy.map((c) => ({ id: c.id, title: c.title }))
  const classes: ClassRow[] = coursesWithHierarchy.flatMap((c) =>
    (c.classes ?? [])
      .filter((cls) => cls.archived_at === null)
      .map((cls) => ({ id: cls.id, title: cls.title, course_id: cls.course_id }))
  )
  const weeks: WeekRow[] = coursesWithHierarchy
    .flatMap((c) => (c.classes ?? []).flatMap((cls) => cls.weeks ?? []))
    .sort((a, b) => a.order - b.order)

  const tags: TagRow[] = (tagsResult.data as TagRow[] | null) ?? []

  const initialClassId = classes.some((cls) => cls.id === searchParams?.class_id)
    ? searchParams?.class_id ?? ''
    : ''
  const initialWeekId = weeks.some(
    (week) => week.id === searchParams?.week_id && week.class_id === initialClassId
  )
    ? searchParams?.week_id ?? ''
    : ''

  return (
    <NewAssignmentWizard
      courses={courses}
      classes={classes}
      weeks={weeks}
      tags={tags}
      initialClassId={initialClassId}
      initialWeekId={initialWeekId}
    />
  )
}
