import { getCachedUser, getCachedProfile } from '@/lib/supabase/server'
import { StudentShell } from '@/components/ui/student-shell'
import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function StudentLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const { locale } = params
  setRequestLocale(locale)
  const [user, profile, t] = await Promise.all([getCachedUser(), getCachedProfile(), getTranslations('student.sidebar')])
  if (!user) redirect(`/${locale}/login`)

  const displayName = profile?.full_name ?? user.email ?? t('roleLabel')

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
