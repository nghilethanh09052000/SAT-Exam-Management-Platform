import { Sidebar } from '@/components/ui/sidebar'
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher'
import { PermissionsProvider } from '@/components/permissions/permissions-provider'
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
  const permissions: string[] = Array.isArray(cached?.permissions) ? cached.permissions : []
  const displayName = cached?.full_name ?? cached?.email ?? (isAdmin ? 'Admin' : 'Teacher')
  const initial = displayName[0]?.toUpperCase() ?? (isAdmin ? 'A' : 'T')
  const [tNav, tCommon] = await Promise.all([
    getTranslations('nav'),
    getTranslations('common'),
  ])
  const navItems = isAdmin
    ? adminNavItems(tNav)
    : teacherNavItems(tNav).map((item) => item.children
      ? {
          ...item,
          children: item.children.filter((child) =>
            child.href !== '/teacher/questions' || permissions.includes('questions:view')
          ),
        }
      : item
    )

  return (
    <div className="flex h-screen overflow-hidden bg-[#f6f4ef]">
      <Sidebar
        items={navItems}
        userDisplayName={displayName}
        userInitial={initial}
        roleLabel={isAdmin ? tCommon('admin') : tCommon('teacher')}
      />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <div className="h-14 lg:hidden shrink-0" />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 md:px-8 lg:py-8">
          <div className="mx-auto max-w-[1500px]">
            <PermissionsProvider isAdmin={isAdmin} permissions={permissions}>
              {children}
            </PermissionsProvider>
          </div>
        </main>
      </div>

      <AssistantLauncher role={isAdmin ? 'admin' : 'teacher'} />
    </div>
  )
}
