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

export default async function NewAssignmentPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [questionsResult, coursesResult, classesResult, weeksResult] = await Promise.all([
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
      .from('classes')
      .select('id, title, course_id')
      .is('archived_at', null)
      .order('title'),
    supabase
      .from('weeks')
      .select('id, title, class_id, order')
      .order('order'),
  ])

  const questions: QuestionRow[] = (questionsResult.data as QuestionRow[] | null) ?? []
  const courses: CourseRow[] = (coursesResult.data as CourseRow[] | null) ?? []
  const classes: ClassRow[] = (classesResult.data as ClassRow[] | null) ?? []
  const weeks: WeekRow[] = (weeksResult.data as WeekRow[] | null) ?? []

  return (
    <NewAssignmentWizard
      questions={questions}
      courses={courses}
      classes={classes}
      weeks={weeks}
    />
  )
}
