import Link from 'next/link'
import Image from 'next/image'
import { createServerClient } from '@/lib/supabase/server'
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

  return (
    <div className="min-h-screen bg-surface-soft">
      {/* Top header */}
      <header className="h-14 bg-canvas-light border-b border-hairline-light sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="SAT Platform" width={28} height={28} className="rounded-full" />
            <span className="font-display font-bold text-ink">SAT Platform</span>
          </div>

          {/* Nav */}
          <nav className="hidden sm:flex items-center gap-1">
            <Link
              href="/student"
              className="px-4 py-2 rounded-full text-sm font-medium text-mute-light hover:text-ink hover:bg-surface-soft transition-colors"
            >
              Trang chủ
            </Link>
            <Link
              href="/student/error-log"
              className="px-4 py-2 rounded-full text-sm font-medium text-mute-light hover:text-ink hover:bg-surface-soft transition-colors"
            >
              Sổ Tay Lỗi Sai
            </Link>
          </nav>

          {/* Profile */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-sm text-mute-light">
              {profile?.full_name ?? user.email}
            </span>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
              {(profile?.full_name ?? user.email ?? 'S')[0].toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
