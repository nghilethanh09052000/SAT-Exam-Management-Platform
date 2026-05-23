import { Sidebar } from '@/components/ui/sidebar'
import { getCachedUser, getCachedProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { adminNavItems, teacherNavItems } from '@/lib/nav-items'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function TeacherLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const { locale } = params
  setRequestLocale(locale)
  const [user, profile] = await Promise.all([getCachedUser(), getCachedProfile()])
  if (!user) redirect(`/${locale}/login`)

  const isAdmin = profile?.role === 'admin'
  const displayName = profile?.full_name ?? user.email ?? (isAdmin ? 'Admin' : 'Teacher')
  const initial = displayName[0]?.toUpperCase() ?? (isAdmin ? 'A' : 'T')
  const tNav = await getTranslations('nav')
  const navItems = isAdmin ? adminNavItems(tNav) : teacherNavItems(tNav)

  const wrapperCls = 'flex h-screen overflow-hidden'
  const wrapperStyle = isAdmin
    ? { background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0fdf4 100%)' }
    : { background: 'linear-gradient(135deg, #eef4ff 0%, #f7f5ff 45%, #f5fbff 100%)' }

  return (
    <div className={wrapperCls} style={wrapperStyle}>
      <Sidebar
        items={navItems}
        userDisplayName={displayName}
        userInitial={initial}
        roleLabel={isAdmin ? 'Admin' : 'Giáo viên'}
      />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <div className="h-14 lg:hidden shrink-0" />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
