import { Sidebar } from '@/components/ui/sidebar'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { adminNavItems, teacherNavItems } from '@/lib/nav-items'

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profileResult = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()
  const profile = profileResult.data as { full_name: string; role: string } | null

  const isAdmin = profile?.role === 'admin'
  const displayName = profile?.full_name ?? user.email ?? (isAdmin ? 'Admin' : 'Giáo viên')
  const initial = displayName[0]?.toUpperCase() ?? (isAdmin ? 'A' : 'T')
  const navItems = isAdmin ? adminNavItems : teacherNavItems

  const wrapperCls = isAdmin ? 'flex min-h-screen' : 'flex min-h-screen'
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

      <div className="flex-1 flex flex-col min-w-0">
        {/* Spacer for mobile topbar (h-14 = 56px, matches fixed topbar height) */}
        <div className="h-14 lg:hidden shrink-0" />
        <main className="flex-1 p-4 md:p-8 overflow-auto">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
