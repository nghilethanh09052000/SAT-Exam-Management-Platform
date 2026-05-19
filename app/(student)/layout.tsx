import { createServerClient } from '@/lib/supabase/server'
import { StudentSidebar } from '@/components/ui/student-sidebar'
import { redirect } from 'next/navigation'

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profileResult = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()
  const profile = profileResult.data as { full_name: string; avatar_url: string | null } | null
  const displayName = profile?.full_name ?? user.email ?? 'Học viên'

  return (
    <div className="min-h-screen overflow-hidden bg-[#f5f7ff]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(96,165,250,0.20),transparent_28%),radial-gradient(circle_at_82%_8%,rgba(251,191,36,0.20),transparent_26%),radial-gradient(circle_at_78%_78%,rgba(45,212,191,0.18),transparent_28%)]" />
      <StudentSidebar
        userDisplayName={displayName}
        userEmail={user.email}
        userInitial={displayName[0]?.toUpperCase() ?? 'S'}
      />
      <main className="relative min-h-screen px-4 pb-10 pt-20 sm:px-6 lg:ml-[292px] lg:px-10 lg:pt-8">
        <div className="mx-auto max-w-[1500px]">{children}</div>
      </main>
    </div>
  )
}
