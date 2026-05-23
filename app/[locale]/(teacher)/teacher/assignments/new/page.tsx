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

  // Single round-trip: 5 parallel queries instead of the previous 4+ sequential ones.
  // - questions: minimal fields only (no joins to options/answers)
  // - mcIds / saIds: tiny ID-only queries to check which questions have valid answers
  // - coursesHierarchy: replaces the 3-step courses→classes→weeks waterfall
  const [questionsResult, mcIdsResult, saIdsResult, coursesResult, tagsResult] = await Promise.all([
    supabase
      .from('questions')
      .select('id, type, content, difficulty')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('question_options')
      .select('question_id')
      .eq('is_correct', true),
    supabase
      .from('question_accepted_answers')
      .select('question_id')
      .neq('answer_text', ''),
    supabase
      .from('courses')
      .select('id, title, classes(id, title, course_id, archived_at, weeks(id, title, class_id, order))')
      .eq('teacher_id', userId)
      .is('archived_at', null)
      .order('title'),
    supabase
      .from('tags')
      .select('id, subject, name')
      .order('subject')
      .order('name'),
  ])

  // Build Sets for O(1) lookup — avoids the previous bug where PostgREST's
  // per-relation row limit could truncate question_options mid-question and
  // cause valid questions to be silently filtered out.
  const validMcIds = new Set((mcIdsResult.data ?? []).map((r) => r.question_id))
  const validSaIds = new Set((saIdsResult.data ?? []).map((r) => r.question_id))

  const questions: QuestionRow[] = (questionsResult.data ?? []).filter((q) => {
    if (q.type === 'multiple_choice') return validMcIds.has(q.id)
    if (q.type === 'short_answer') return validSaIds.has(q.id)
    return false
  })

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
