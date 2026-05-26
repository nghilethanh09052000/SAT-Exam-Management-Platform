import { Sidebar } from '@/components/ui/sidebar'
import { cookies } from 'next/headers'
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

  // Read display info from the role cache cookie — middleware already verified
  // the session and populated this on every request, so no HTTPS call needed here.
  const cookieStore = cookies()
  const raw = cookieStore.get('gd_role_cache')?.value
  const cached = raw ? (() => { try { return JSON.parse(raw) } catch { return null } })() : null

  const isAdmin = cached?.role === 'admin'
  const displayName = cached?.full_name ?? cached?.email ?? (isAdmin ? 'Admin' : 'Teacher')
  const initial = displayName[0]?.toUpperCase() ?? (isAdmin ? 'A' : 'T')
  const [tNav, tCommon] = await Promise.all([
    getTranslations('nav'),
    getTranslations('common'),
  ])
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
        roleLabel={isAdmin ? tCommon('admin') : tCommon('teacher')}
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
