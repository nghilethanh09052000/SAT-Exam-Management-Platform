import { Sidebar } from '@/components/ui/sidebar'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { adminNavItems } from '@/lib/nav-items'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profileResult = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()
  const profile = profileResult.data as { full_name: string; role: string } | null

  const displayName = profile?.full_name ?? user.email ?? 'Admin'
  const initial = displayName[0]?.toUpperCase() ?? 'A'

  return (
    <div className="flex min-h-screen" style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0fdf4 100%)' }}>
      <Sidebar items={adminNavItems} userDisplayName={displayName} userInitial={initial} />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-14 lg:hidden shrink-0" />
        <main className="flex-1 p-4 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
