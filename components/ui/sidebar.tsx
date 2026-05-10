'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

interface SidebarProps {
  items: NavItem[]
  bottomItems?: NavItem[]
}

export function Sidebar({ items, bottomItems = [] }: SidebarProps) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/admin' || href === '/teacher') {
      return pathname === href
    }
    return pathname.startsWith(href)
  }

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-canvas-dark text-on-dark shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <span className="font-display font-bold text-sm text-white">S</span>
        </div>
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
                ? 'bg-primary text-white'
                : 'text-on-dark-mute hover:bg-white/10 hover:text-white',
            ].join(' ')}
          >
            <span className="w-5 h-5 shrink-0">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Bottom nav */}
      {bottomItems.length > 0 && (
        <div className="px-3 py-4 border-t border-white/10 space-y-1">
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
    </aside>
  )
}
