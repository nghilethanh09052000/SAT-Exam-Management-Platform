import { createServerClient } from '@/lib/supabase/server'
import { NewAssignmentWizard } from './new-assignment-wizard'

interface QuestionRow {
  id: string
  type: string
  content: string
  difficulty: string | null
}

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

export default async function NewAssignmentPage({
  searchParams,
}: {
  searchParams?: { class_id?: string; week_id?: string }
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [questionsResult, coursesResult, tagsResult] = await Promise.all([
    supabase
      .from('questions')
      .select('id, type, content, difficulty')
      .eq('created_by', user?.id ?? '')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('courses')
      .select('id, title')
      .eq('teacher_id', user?.id ?? '')
      .is('archived_at', null)
      .order('title'),
    supabase
      .from('tags')
      .select('id, subject, name')
      .order('subject')
      .order('name'),
  ])

  const questions: QuestionRow[] = (questionsResult.data as QuestionRow[] | null) ?? []
  const courses: CourseRow[] = (coursesResult.data as CourseRow[] | null) ?? []
  const courseIds = courses.map((course) => course.id)
  const classesResult = courseIds.length > 0
    ? await supabase
        .from('classes')
        .select('id, title, course_id')
        .in('course_id', courseIds)
        .is('archived_at', null)
        .order('title')
    : { data: [] as ClassRow[] }
  const classes: ClassRow[] = (classesResult.data as ClassRow[] | null) ?? []
  const classIds = classes.map((cls) => cls.id)
  const weeksResult = classIds.length > 0
    ? await supabase
        .from('weeks')
        .select('id, title, class_id, order')
        .in('class_id', classIds)
        .order('order')
    : { data: [] as WeekRow[] }
  const weeks: WeekRow[] = (weeksResult.data as WeekRow[] | null) ?? []
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
      questions={questions}
      courses={courses}
      classes={classes}
      weeks={weeks}
      tags={tags}
      initialClassId={initialClassId}
      initialWeekId={initialWeekId}
    />
  )
}
