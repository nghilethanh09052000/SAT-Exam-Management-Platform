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
    .select('id, full_name, phone, is_active, created_at')
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
  }

  const students = ((profiles ?? []) as ProfileRow[]).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    phone: p.phone,
    is_active: p.is_active,
    created_at: p.created_at,
    email: emailMap[p.id] ?? '',
  }))

  // Fetch courses with their classes so the import modal can offer a class picker
  const { data: coursesData } = await supabase
    .from('courses')
    .select('id, title, classes(id, title)')
    .is('archived_at', null)
    .order('title')

  type CourseWithClasses = {
    id: string
    title: string
    classes: { id: string; title: string }[]
  }
  const courses: CourseWithClasses[] = ((coursesData ?? []) as CourseWithClasses[]).filter(
    (c) => c.classes && c.classes.length > 0
  )

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
