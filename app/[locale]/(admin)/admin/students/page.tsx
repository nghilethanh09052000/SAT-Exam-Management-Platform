import { getTranslations, setRequestLocale } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { AdminStudentsClient } from './students-client'

export default async function AdminStudentsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('admin.students')
  const supabase = createServerClient()

  // Fetch profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, is_active, created_at, birth_year, gender, school, city, facebook_url, threads_url, hobbies, target_score, source')
    .eq('role', 'student')
    .eq('is_approved', true)
    .order('created_at', { ascending: false })

  type ProfileRow = {
    id: string
    email: string | null
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
    email: p.email ?? '',
  }))

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
      end_date: c.end_date,
      expires_at: c.expires_at,
      classes: c.classes
        .filter((cl) => !cl.archived_at)
        .map((cl) => ({ id: cl.id, title: cl.title })),
    }))
    .filter((c) => c.classes.length > 0)

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={<span className="text-sm text-mute-light">{t('count', { count: students.length })}</span>}
      />
      <AdminStudentsClient students={students} courses={courses} />
    </div>
  )
}
