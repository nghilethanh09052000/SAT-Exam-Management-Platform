import { createServerClient } from '@/lib/supabase/server'
import { StudentShell } from '@/components/ui/student-shell'
import { redirect } from 'next/navigation'

export default async function StudentLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const { locale } = params
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const profileResult = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()
  const profile = profileResult.data as { full_name: string; avatar_url: string | null } | null
  const displayName = profile?.full_name ?? user.email ?? 'Học viên'

  return (
    <StudentShell
      userDisplayName={displayName}
      userEmail={user.email}
      userInitial={displayName[0]?.toUpperCase() ?? 'S'}
    >
      {children}
    </StudentShell>
  )
}
