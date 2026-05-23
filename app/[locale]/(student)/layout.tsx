import { getCachedUser, getCachedProfile } from '@/lib/supabase/server'
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
  const [user, profile] = await Promise.all([getCachedUser(), getCachedProfile()])
  if (!user) redirect(`/${locale}/login`)

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
