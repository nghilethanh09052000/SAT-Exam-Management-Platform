import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { AdminStudentsClient } from './students-client'
import type { Database } from '@/types/database'

export default async function AdminStudentsPage() {
  const supabase = createServerClient()

  // Fetch profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, phone, is_active, created_at, birth_year, gender, school, city, facebook_url, threads_url, hobbies, target_score, source')
    .eq('role', 'student')
    .order('created_at', { ascending: false })

  // Fetch emails from auth.users via service role (profiles don't store email)
  const adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { data: authUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = Object.fromEntries(
    (authUsers?.users ?? []).map((u) => [u.id, u.email ?? ''])
  )

  type ProfileRow = {
    id: string
    full_name: string
    phone: string | null
    is_active: boolean
    created_at: string
    birth_year: number | null
    gender: string | null
    school: string | null
    city: string | null
    facebook_url: string | null
    threads_url: string | null
    hobbies: string | null
    target_score: number | null
    source: string | null
  }

  const students = ((profiles ?? []) as ProfileRow[]).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    phone: p.phone,
    is_active: p.is_active,
    created_at: p.created_at,
    birth_year: p.birth_year,
    gender: p.gender,
    school: p.school,
    city: p.city,
    facebook_url: p.facebook_url,
    threads_url: p.threads_url,
    hobbies: p.hobbies,
    target_score: p.target_score,
    source: p.source,
    email: emailMap[p.id] ?? '',
    enrollments: [] as {
      id: string
      enrolled_at: string
      class_id: string
      class_title: string
      course_id: string
      course_title: string
    }[],
  }))

  const studentIds = students.map((s) => s.id)
  const { data: enrollmentRows } = studentIds.length > 0
    ? await adminClient
        .from('enrollments')
        .select('id, student_id, class_id, enrolled_at, classes(id, title, course_id, courses(id, title))')
        .in('student_id', studentIds)
        .order('enrolled_at', { ascending: false })
    : { data: [] }

  type EnrollmentJoinRow = {
    id: string
    student_id: string
    class_id: string
    enrolled_at: string
    classes: {
      id: string
      title: string
      course_id: string
      courses: { id: string; title: string } | null
    } | null
  }

  const enrollmentMap = new Map<string, StudentEnrollment[]>()
  type StudentEnrollment = {
    id: string
    enrolled_at: string
    class_id: string
    class_title: string
    course_id: string
    course_title: string
  }
  for (const row of ((enrollmentRows ?? []) as EnrollmentJoinRow[])) {
    const entry: StudentEnrollment = {
      id: row.id,
      enrolled_at: row.enrolled_at,
      class_id: row.class_id,
      class_title: row.classes?.title ?? '—',
      course_id: row.classes?.course_id ?? '',
      course_title: row.classes?.courses?.title ?? '—',
    }
    const existing = enrollmentMap.get(row.student_id) ?? []
    existing.push(entry)
    enrollmentMap.set(row.student_id, existing)
  }

  for (const student of students) {
    student.enrollments = enrollmentMap.get(student.id) ?? []
  }

  // Fetch active courses with their active classes so add/import flows can offer a class picker.
  const { data: coursesData } = await supabase
    .from('courses')
    .select('id, title, end_date, expires_at, classes(id, title, archived_at)')
    .is('archived_at', null)
    .order('title')

  type CourseWithClasses = {
    id: string
    title: string
    end_date: string
    expires_at: string | null
    classes: { id: string; title: string; archived_at: string | null }[]
  }
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const courses = ((coursesData ?? []) as CourseWithClasses[])
    .filter((c) => c.end_date >= today && (!c.expires_at || c.expires_at >= now) && c.classes && c.classes.length > 0)
    .map((c) => ({
      id: c.id,
      title: c.title,
      classes: c.classes
        .filter((cl) => !cl.archived_at)
        .map((cl) => ({ id: cl.id, title: cl.title })),
    }))
    .filter((c) => c.classes.length > 0)

  return (
    <div>
      <PageHeader
        title="Học sinh"
        description="Quản lý tài khoản học sinh"
        action={<span className="text-sm text-mute-light">{students.length} học sinh</span>}
      />
      <AdminStudentsClient students={students} courses={courses} />
    </div>
  )
}
