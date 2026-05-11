'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

export interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

interface SidebarProps {
  items: NavItem[]
  bottomItems?: NavItem[]
  userDisplayName?: string
  userInitial?: string
}

export function Sidebar({ items, bottomItems = [], userDisplayName, userInitial = '?' }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createBrowserClient()

  function isActive(href: string) {
    if (href === '/admin' || href === '/teacher') {
      return pathname === href
    }
    return pathname.startsWith(href)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-canvas-dark text-on-dark shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <Image src="/logo.jpg" alt="SAT Platform" width={32} height={32} className="rounded-full shadow-md shadow-primary/25" />
        <span className="font-display font-bold text-white text-lg tracking-tight">
          SAT Platform
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={[
              'flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-colors',
              isActive(item.href)
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'text-on-dark-mute hover:bg-white/10 hover:text-white',
            ].join(' ')}
          >
            <span className="w-5 h-5 shrink-0">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Bottom nav (extra links) */}
      {bottomItems.length > 0 && (
        <div className="px-3 border-t border-white/10 space-y-1 pt-3">
          {bottomItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-primary text-white'
                  : 'text-on-dark-mute hover:bg-white/10 hover:text-white',
              ].join(' ')}
            >
              <span className="w-5 h-5 shrink-0">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      )}

      {/* User + logout */}
      <div className="px-4 py-4 border-t border-white/10">
        {userDisplayName && (
          <div className="flex items-center gap-3 px-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
              {userInitial}
            </div>
            <span className="text-xs text-on-dark-mute truncate">{userDisplayName}</span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium text-on-dark-mute hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Đăng xuất
        </button>
      </div>
    </aside>
  )
}
