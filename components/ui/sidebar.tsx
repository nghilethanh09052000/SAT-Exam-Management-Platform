'use client'

import { useState, useEffect } from 'react'
import { Link } from '@/i18n/navigation'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LanguageSwitcher } from '@/components/ui/language-switcher'

export interface NavItem {
  label: string
  href?: string
  icon: React.ReactNode
  children?: NavItem[]
  color?: string   // tailwind bg class for the icon dot, e.g. 'bg-blue-500'
}

interface SidebarProps {
  items: NavItem[]
  bottomItems?: NavItem[]
  userDisplayName?: string
  userInitial?: string
  roleLabel?: string
}

export function Sidebar({ items, bottomItems = [], userDisplayName, userInitial = '?', roleLabel = 'Admin' }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [loggingOut, setLoggingOut] = useState(false)
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    setNavigatingTo(null)
  }, [pathname])
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('common')
  const supabase = createBrowserClient()

  function isActive(href: string) {
    const localePath = `/${locale}${href}`
    if (href === '/admin' || href === '/teacher') return pathname === localePath
    return pathname.startsWith(localePath)
  }

  function isItemActive(item: NavItem): boolean {
    if (item.href && isActive(item.href)) return true
    return item.children?.some(isItemActive) ?? false
  }

  function isGroupOpen(item: NavItem) {
    return openGroups[item.label] ?? isItemActive(item)
  }

  async function handleLogout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.push(`/${locale}/login`)
    router.refresh()
  }

  return (
    <>
      {loggingOut && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-white/70">{t('logout')}…</span>
          </div>
        </div>
      )}

      {/* ── Mobile topbar ─────────────────────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-[#0d0d1a] flex items-center gap-3 px-4 border-b border-white/5 shadow-lg">
        <button
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all"
          aria-label={t('openMenu')}
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Image src="/logo.jpg" alt="GD SAT Platform" width={28} height={28} className="rounded-full ring-2 ring-violet-500/40" />
        <span className="font-display font-bold text-white tracking-tight">GD SAT Platform</span>
      </div>

      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar panel ─────────────────────────────────────────────────── */}
      <aside
        className={[
          'flex h-screen flex-col w-64 shrink-0 text-white',
          'fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out',
          'lg:fixed lg:translate-x-0 lg:z-40',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        style={{
          background: 'linear-gradient(180deg, #0d0d1a 0%, #111128 50%, #0d0d1a 100%)',
          borderRight: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {/* Mobile header inside sidebar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="GD SAT Platform" width={28} height={28} className="rounded-full ring-2 ring-violet-500/40" />
            <span className="font-display font-bold text-white">GD SAT Platform</span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-white/50"
            aria-label={t('closeMenu')}
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Logo */}
        <div className="hidden lg:flex items-center gap-3 px-5 py-5 border-b border-white/5">
          <div className="relative">
            <Image src="/logo.jpg" alt="GD SAT Platform" width={34} height={34} className="rounded-xl ring-2 ring-violet-500/50 shadow-lg shadow-violet-500/30" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0d0d1a]" />
          </div>
          <div>
            <span className="font-display font-bold text-white text-base tracking-tight leading-none">GD SAT Platform</span>
            <p className="text-[10px] text-violet-400/80 font-medium tracking-wider uppercase">{roleLabel}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
          {/* Nav items */}
          <nav className="px-3 py-4 space-y-0.5">
            {items.map((item, idx) => {
              const active = isItemActive(item)
              const groupOpen = item.children ? isGroupOpen(item) : false

              if (item.children) {
                return (
                  <div key={item.label} style={{ animationDelay: `${idx * 40}ms` }}>
                    <button
                      type="button"
                      onClick={() => setOpenGroups((prev) => ({ ...prev, [item.label]: !groupOpen }))}
                      className={[
                        'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-200',
                        active
                          ? 'bg-white/10 text-white'
                          : 'text-white/55 hover:bg-white/8 hover:text-white',
                      ].join(' ')}
                      aria-expanded={groupOpen}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-violet-300 shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
                      )}
                      <span className={[
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200',
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-white/5 text-white/50 group-hover:bg-white/10 group-hover:text-white/80',
                      ].join(' ')}>
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                      <svg
                        className={[
                          'ml-auto h-3.5 w-3.5 transition-transform duration-200',
                          groupOpen ? 'rotate-90 opacity-70' : 'opacity-40',
                        ].join(' ')}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    {groupOpen && (
                      <div className="ml-7 mt-1 space-y-0.5 border-l border-white/10 pl-3">
                        {item.children.map((child) => {
                          if (!child.href) return null
                          const childActive = isActive(child.href)
                          const isChildNavigating = navigatingTo === child.href
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => {
                                setMobileOpen(false)
                                if (!childActive) setNavigatingTo(child.href!)
                              }}
                              className={[
                                'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200',
                                childActive
                                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20'
                                  : 'text-white/50 hover:bg-white/8 hover:text-white',
                              ].join(' ')}
                            >
                              <span className={[
                                'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
                                childActive ? 'bg-white/20 text-white' : 'bg-white/5 text-white/45 group-hover:text-white/75',
                              ].join(' ')}>
                                {isChildNavigating ? (
                                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                ) : child.icon}
                              </span>
                              <span className="truncate">{child.label}</span>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              }

              if (!item.href) return null
              const isNavigating = navigatingTo === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    setMobileOpen(false)
                    if (!active) setNavigatingTo(item.href!)
                  }}
                  className={[
                    'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                    active
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25'
                      : 'text-white/55 hover:text-white hover:bg-white/8',
                  ].join(' ')}
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-violet-300 rounded-full shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
                  )}
                  <span className={[
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200',
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-white/5 text-white/50 group-hover:bg-white/10 group-hover:text-white/80',
                  ].join(' ')}>
                    {isNavigating ? (
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                  {!active && !isNavigating && (
                    <svg className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-40 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </Link>
              )
            })}
          </nav>

          {bottomItems.length > 0 && (
            <div className="px-3 border-t border-white/5 pt-2 pb-1 space-y-0.5">
              {bottomItems.map((item) => {
                if (!item.href) return null
                const active = isActive(item.href)
                const isNavigating = navigatingTo === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setMobileOpen(false)
                      if (!active) setNavigatingTo(item.href!)
                    }}
                    className={[
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                      active
                        ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white'
                        : 'text-white/55 hover:text-white hover:bg-white/8',
                    ].join(' ')}
                  >
                    <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      {isNavigating ? (
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : item.icon}
                    </span>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* User + logout */}
        <div className="shrink-0 px-3 py-4 border-t border-white/5 bg-[#0d0d1a]/95 backdrop-blur-sm">
          <div className="flex justify-end px-2 mb-3">
            <LanguageSwitcher variant="dark" />
          </div>
          {userDisplayName && (
            <div className="flex items-center gap-2.5 px-2 mb-3">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-md shadow-violet-500/30">
                {userInitial}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate leading-none">{userDisplayName}</p>
                <p className="text-[10px] text-white/35 mt-0.5">{roleLabel}</p>
              </div>
              {/* Online dot */}
              <span className="w-2 h-2 bg-emerald-400 rounded-full shrink-0 ml-auto shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            </div>
          )}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="w-8 h-8 rounded-lg bg-white/5 group-hover:bg-rose-500/15 flex items-center justify-center shrink-0 transition-colors">
              {loggingOut ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              )}
            </span>
            {t('logout')}
          </button>
        </div>
      </aside>
    </>
  )
}
