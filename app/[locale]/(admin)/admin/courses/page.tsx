import { setRequestLocale } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { AdminCoursesClient } from './courses-client'

interface CourseRow {
  id: string
  title: string
  start_date: string
  end_date: string
  archived_at: string | null
  created_at: string
  teacher_id: string
  profiles: { full_name: string } | null
  student_count: number
  class_count: number
  week_count: number
  assignment_count: number
  revenue_text: string
}

export default async function AdminCoursesPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const supabase = createServerClient()

  const { data } = await supabase
    .from('courses')
    .select('id, title, start_date, end_date, archived_at, created_at, teacher_id, profiles(full_name)')
    .order('created_at', { ascending: false })

  const baseCourses = (data as Omit<CourseRow, 'student_count' | 'class_count' | 'week_count' | 'assignment_count' | 'revenue_text'>[] | null) ?? []
  const courseIds = baseCourses.map((course) => course.id)

  type ClassRow = { id: string; course_id: string }
  type EnrollmentRow = { student_id: string; classes: { course_id: string } | null }
  type WeekRow = { id: string; classes: { course_id: string } | null }
  type AssignmentInstanceRow = { id: string; classes: { course_id: string } | null }

  const classesResult = courseIds.length > 0
    ? await supabase
        .from('classes')
        .select('id, course_id')
        .in('course_id', courseIds)
    : { data: [] as ClassRow[] }

  const enrollmentsResult = courseIds.length > 0
    ? await supabase
        .from('enrollments')
        .select('student_id, classes(course_id)')
        .in('classes.course_id', courseIds)
    : { data: [] as EnrollmentRow[] }

  const weeksResult = courseIds.length > 0
    ? await supabase
        .from('weeks')
        .select('id, classes(course_id)')
        .in('classes.course_id', courseIds)
    : { data: [] as WeekRow[] }

  const assignmentInstancesResult = courseIds.length > 0
    ? await supabase
        .from('assignment_instances')
        .select('id, classes(course_id)')
        .in('classes.course_id', courseIds)
    : { data: [] as AssignmentInstanceRow[] }

  const classes = (classesResult.data as ClassRow[] | null) ?? []
  const enrollments = (enrollmentsResult.data as EnrollmentRow[] | null) ?? []
  const weeks = (weeksResult.data as WeekRow[] | null) ?? []
  const assignmentInstances = (assignmentInstancesResult.data as AssignmentInstanceRow[] | null) ?? []

  const classCountByCourse = new Map<string, number>()
  for (const klass of classes) {
    classCountByCourse.set(klass.course_id, (classCountByCourse.get(klass.course_id) ?? 0) + 1)
  }

  const studentsByCourse = new Map<string, Set<string>>()
  for (const enrollment of enrollments) {
    const courseId = enrollment.classes?.course_id
    if (!courseId) continue
    const set = studentsByCourse.get(courseId) ?? new Set<string>()
    set.add(enrollment.student_id)
    studentsByCourse.set(courseId, set)
  }

  const weekCountByCourse = new Map<string, number>()
  for (const week of weeks) {
    const courseId = week.classes?.course_id
    if (!courseId) continue
    weekCountByCourse.set(courseId, (weekCountByCourse.get(courseId) ?? 0) + 1)
  }

  const assignmentCountByCourse = new Map<string, number>()
  for (const instance of assignmentInstances) {
    const courseId = instance.classes?.course_id
    if (!courseId) continue
    assignmentCountByCourse.set(courseId, (assignmentCountByCourse.get(courseId) ?? 0) + 1)
  }

  const courses: CourseRow[] = baseCourses.map((course) => ({
    ...course,
    student_count: studentsByCourse.get(course.id)?.size ?? 0,
    class_count: classCountByCourse.get(course.id) ?? 0,
    week_count: weekCountByCourse.get(course.id) ?? 0,
    assignment_count: assignmentCountByCourse.get(course.id) ?? 0,
    revenue_text: '-',
  }))

  // Get teacher profiles for the create course form
  const { data: teacherData } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'teacher')
    .order('full_name')
  const teachers: { id: string; full_name: string }[] = (teacherData as { id: string; full_name: string }[] | null) ?? []

  return (
    <div className="min-h-full">
      <AdminCoursesClient courses={courses} teachers={teachers} />
    </div>
  )
}
