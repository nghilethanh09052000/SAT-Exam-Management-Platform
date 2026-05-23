import { Sidebar } from '@/components/ui/sidebar'
import { getCachedUser, getCachedProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { adminNavItems } from '@/lib/nav-items'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function AdminLayout({
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

  const displayName = profile?.full_name ?? user.email ?? 'Admin'
  const initial = displayName[0]?.toUpperCase() ?? 'A'
  const t = await getTranslations('nav')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0fdf4 100%)' }}>
      <Sidebar items={adminNavItems(t)} userDisplayName={displayName} userInitial={initial} roleLabel="Admin" />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <div className="h-14 lg:hidden shrink-0" />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-8">{children}</main>
      </div>
    </div>
  )
}
