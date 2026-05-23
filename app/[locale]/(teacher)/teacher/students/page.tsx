import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { TeacherStudentsClient, type TeacherStudent } from './students-client'

export default async function TeacherStudentsPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile as { role: string } | null)?.role
  if (role !== 'teacher' && role !== 'admin') redirect('/login')

  const raw = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  let courseIds: string[] = []
  if (role === 'admin') {
    const { data: courses } = await raw.from('courses').select('id')
    courseIds = ((courses ?? []) as { id: string }[]).map((course) => course.id)
  } else {
    const { data: courses } = await raw.from('courses').select('id').eq('teacher_id', user.id)
    courseIds = ((courses ?? []) as { id: string }[]).map((course) => course.id)
  }

  type CourseRelation = { id: string; title: string } | { id: string; title: string }[] | null

  type ClassRow = {
    id: string
    title: string
    course_id: string
    courses: CourseRelation
  }

  type StudentProfile = {
    id: string
    email: string | null
    full_name: string
    phone: string | null
    is_active: boolean
    is_approved: boolean
    created_at: string
    birth_year: number | null
    gender: string | null
    school: string | null
    city: string | null
    target_score: number | null
  }

  type EnrollmentRow = {
    id: string
    student_id: string
    class_id: string
    enrolled_at: string
    profiles: StudentProfile | StudentProfile[] | null
  }

  const { data: classRows } = courseIds.length > 0
    ? await raw
        .from('classes')
        .select('id, title, course_id, courses(id, title)')
        .in('course_id', courseIds)
    : { data: [] }

  const classMap = new Map(
    ((classRows ?? []) as unknown as ClassRow[]).map((classRow) => [classRow.id, classRow])
  )
  const classIds = Array.from(classMap.keys())

  const { data: enrollmentRows } = classIds.length > 0
    ? await raw
        .from('enrollments')
        .select('id, student_id, class_id, enrolled_at, profiles(id, email, full_name, phone, is_active, is_approved, created_at, birth_year, gender, school, city, target_score)')
        .in('class_id', classIds)
        .order('enrolled_at', { ascending: false })
    : { data: [] }

  const rows = ((enrollmentRows ?? []) as unknown as EnrollmentRow[]).filter((row) => row.profiles && classMap.has(row.class_id))
  const getProfile = (profile: EnrollmentRow['profiles']) => Array.isArray(profile) ? profile[0] ?? null : profile

  const studentMap = new Map<string, TeacherStudent>()
  for (const row of rows) {
    const studentProfile = getProfile(row.profiles)
    if (!studentProfile) continue
    if (!studentProfile.is_approved) continue
    const classRow = classMap.get(row.class_id)
    if (!classRow) continue

    const existing = studentMap.get(row.student_id)
    const classInfo = {
      enrollment_id: row.id,
      enrolled_at: row.enrolled_at,
      class_id: classRow.id,
      class_title: classRow.title,
      course_id: classRow.course_id,
      course_title: Array.isArray(classRow.courses)
        ? classRow.courses[0]?.title ?? '—'
        : classRow.courses?.title ?? '—',
    }

    if (existing) {
      existing.enrollments.push(classInfo)
      continue
    }

    studentMap.set(row.student_id, {
      id: studentProfile.id,
      full_name: studentProfile.full_name,
      email: studentProfile.email ?? '',
      phone: studentProfile.phone,
      is_active: studentProfile.is_active,
      created_at: studentProfile.created_at,
      birth_year: studentProfile.birth_year,
      gender: studentProfile.gender,
      school: studentProfile.school,
      city: studentProfile.city,
      target_score: studentProfile.target_score,
      enrollments: [classInfo],
    })
  }

  const students = Array.from(studentMap.values()).sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'))

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Học sinh"
        description="Danh sách học sinh trong các lớp bạn đang phụ trách"
        breadcrumbs={[{ label: 'Học sinh' }]}
      />
      <TeacherStudentsClient students={students} />
    </div>
  )
}
