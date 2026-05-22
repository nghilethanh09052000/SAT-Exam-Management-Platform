import { createClient } from '@supabase/supabase-js'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { AdminUsersClient, type StaffAccount } from './users-client'
import type { Database } from '@/types/database'

export default async function AdminUsersPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('admin.users')
  const supabase = createServerClient()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, is_active, created_at')
    .in('role', ['admin', 'teacher'])
    .order('created_at', { ascending: false })

  const adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { data: authUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  const authMap = new Map((authUsers?.users ?? []).map((user) => [user.id, user]))

  type ProfileRow = {
    id: string
    full_name: string
    phone: string | null
    role: 'admin' | 'teacher'
    is_active: boolean
    created_at: string
  }

  const users: StaffAccount[] = ((profiles ?? []) as ProfileRow[]).map((profile) => {
    const authUser = authMap.get(profile.id)
    return {
      id: profile.id,
      full_name: profile.full_name,
      phone: profile.phone,
      role: profile.role,
      is_active: profile.is_active,
      created_at: profile.created_at,
      email: authUser?.email ?? '',
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
    }
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title={t('title')}
        description={t('description')}
        breadcrumbs={[{ label: t('title') }]}
      />
      <AdminUsersClient users={users} />
    </div>
  )
}
