import { cookies } from 'next/headers'
import { StudentShell } from '@/components/ui/student-shell'
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

  const [t, cookieStore] = await Promise.all([
    getTranslations('student.sidebar'),
    Promise.resolve(cookies()),
  ])

  const raw = cookieStore.get('gd_role_cache')?.value
  const cached = raw ? (() => { try { return JSON.parse(raw) } catch { return null } })() : null

  const displayName = cached?.full_name ?? cached?.email ?? t('roleLabel')
  const userEmail = cached?.email ?? undefined

  return (
    <StudentShell
      userDisplayName={displayName}
      userEmail={userEmail}
      userInitial={displayName[0]?.toUpperCase() ?? 'S'}
    >
      {children}
    </StudentShell>
  )
}
