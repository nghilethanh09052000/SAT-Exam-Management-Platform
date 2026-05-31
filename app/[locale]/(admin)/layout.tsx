import { Sidebar } from '@/components/ui/sidebar'
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher'
import { cookies } from 'next/headers'
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

  const cookieStore = cookies()
  const raw = cookieStore.get('gd_role_cache')?.value
  const cached = raw ? (() => { try { return JSON.parse(raw) } catch { return null } })() : null

  const displayName = cached?.full_name ?? cached?.email ?? 'Admin'
  const initial = displayName[0]?.toUpperCase() ?? 'A'
  const t = await getTranslations('nav')

  return (
    <div className="flex h-screen overflow-hidden bg-[#f6f4ef]">
      <Sidebar items={adminNavItems(t)} userDisplayName={displayName} userInitial={initial} roleLabel="Admin" />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <div className="h-14 lg:hidden shrink-0" />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 md:px-8 lg:py-8">
          <div className="mx-auto max-w-[1500px]">{children}</div>
        </main>
      </div>

      <AssistantLauncher role="admin" />
    </div>
  )
}
