'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { LoadingOverlay, LoadingSpinner } from '@/components/ui/loading'
import { NotificationBell } from '@/components/ui/notification-bell'
import { useAsyncAction } from '@/hooks/use-async'

type StudentSidebarProps = {
  userDisplayName: string
  userEmail?: string | null
  userInitial: string
}

type NavItemDef = {
  key: string
  href: string
  soon?: boolean
  icon: ReactNode
}

type NavGroupDef = {
  titleKey?: string
  items: NavItemDef[]
}

const navGroups: NavGroupDef[] = [
  {
    items: [
      {
        key: 'console',
        href: '/student',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10" />
          </svg>
        ),
      },
    ],
  },
  {
    titleKey: 'groupLearn',
    items: [
      {
        key: 'courses',
        href: '/student/coursework',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a2 2 0 0 1 2-2h11v16H6a2 2 0 0 0-2 2zM17 3h1a2 2 0 0 1 2 2v12" />
          </svg>
        ),
      },
      {
        key: 'aiTutor',
        href: '#coming-soon',
        soon: true,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 4h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8l-4 3v-3a3 3 0 0 1-1-2V7a3 3 0 0 1 3-3z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h.01M15 10h.01" />
          </svg>
        ),
      },
      {
        key: 'vocab',
        href: '#coming-soon',
        soon: true,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
          </svg>
        ),
      },
    ],
  },
  {
    titleKey: 'groupPractice',
    items: [
      {
        key: 'questionBank',
        href: '#coming-soon',
        soon: true,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v13H7zM14 3v5h5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 12a1.5 1.5 0 1 1 2 1.3c-.6.3-1 .7-1 1.4M12 17h.01" />
          </svg>
        ),
      },
      {
        key: 'practiceSets',
        href: '/student/practice',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4 2 9l10 5 10-5zM6 11v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
          </svg>
        ),
      },
      {
        key: 'challenge',
        href: '#coming-soon',
        soon: true,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 21V4a1 1 0 0 1 1-1h11l-2.5 4L17 11H6" />
          </svg>
        ),
      },
    ],
  },
  {
    titleKey: 'groupProgress',
    items: [
      {
        key: 'errorLog',
        href: '/student/error-log',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 6 6M15 9l-6 6" />
          </svg>
        ),
      },
      {
        key: 'myStats',
        href: '/student/results',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a9 9 0 1 0 9 9h-9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v9h9" />
          </svg>
        ),
      },
      {
        key: 'confidenceList',
        href: '/student/confidence',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z" />
          </svg>
        ),
      },
    ],
  },
  {
    titleKey: 'groupOther',
    items: [
      {
        key: 'leaderboard',
        href: '#coming-soon',
        soon: true,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
          </svg>
        ),
      },
      {
        key: 'store',
        href: '#coming-soon',
        soon: true,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h16l-1 11H5zM4 9l1.5-5h13L20 9M9 13v3M15 13v3" />
          </svg>
        ),
      },
      {
        key: 'colleges',
        href: '#coming-soon',
        soon: true,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10 12 4l9 6M5 10v9M19 10v9M9 19v-5h6v5M3 21h18" />
          </svg>
        ),
      },
      {
        key: 'discord',
        href: '#coming-soon',
        soon: true,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 6a18 18 0 0 1 8 0l1 2a13 13 0 0 1 3 9 14 14 0 0 1-4 2l-1-2m-7 0-1 2a14 14 0 0 1-4-2 13 13 0 0 1 3-9zM9 14h.01M15 14h.01" />
          </svg>
        ),
      },
    ],
  },
]

export function StudentSidebar({ userDisplayName, userEmail, userInitial }: StudentSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [soonMessage, setSoonMessage] = useState('')
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    setNavigatingTo(null)
  }, [pathname])
  const router = useRouter()
  const locale = useLocale()
  const tNav = useTranslations('nav')
  const tSidebar = useTranslations('student.sidebar')
  const tCommon = useTranslations('common')
  const supabase = createBrowserClient()

  const { loading: loggingOut, run: handleLogout } = useAsyncAction(async () => {
    await supabase.auth.signOut()
    router.push(`/${locale}/login`)
    router.refresh()
  })

  function isActive(href: string) {
    if (href === '#coming-soon') return false
    const localePath = `/${locale}${href}`
    if (href === '/student') return pathname === localePath
    return pathname === localePath || Boolean(pathname?.startsWith(`${localePath}/`))
  }

  function showSoon(label: string) {
    setSoonMessage(tSidebar('comingSoon', { label }))
    window.setTimeout(() => setSoonMessage(''), 1800)
    setMobileOpen(false)
  }

  function renderNavItem(item: NavItemDef, index: number) {
    const label = tNav(item.key)
    const active = isActive(item.href)
    const isSoon = Boolean(item.soon)
    const isNavigating = navigatingTo === item.href
    return (
      <Link
        key={item.key}
        href={item.href}
        onClick={(event) => {
          if (isSoon) {
            event.preventDefault()
            showSoon(label)
            return
          }
          setMobileOpen(false)
          if (!active) setNavigatingTo(item.href)
        }}
        className={[
          'group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-bold transition-all duration-300',
          active
            ? 'border-[3px] border-black bg-gradient-to-r from-[#4f7cff] via-[#6d5dfc] to-[#8b5cf6] text-white shadow-xl shadow-indigo-500/25'
            : 'text-[#505566] hover:-translate-y-0.5 hover:bg-[#f3f6ff] hover:text-[#2f43c9]',
        ].join(' ')}
        style={{ animationDelay: `${index * 45}ms` }}
      >
        <span
          className={[
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300',
            active
              ? 'bg-white/[0.22] text-white'
              : 'bg-white text-[#6472f4] shadow-sm shadow-blue-100 group-hover:bg-[#e8edff]',
          ].join(' ')}
        >
          {isNavigating ? <LoadingSpinner className="h-5 w-5" /> : <span className="h-5 w-5">{item.icon}</span>}
        </span>
        <span className="truncate">{label}</span>
        {isSoon && (
          <span className="ml-auto rounded-full bg-[#eef3ff] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#6472f4] group-hover:bg-white">
            Soon
          </span>
        )}
        {active && <span className="ml-auto h-2 w-2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)]" />}
      </Link>
    )
  }

  const panel = (
    <aside className="flex h-full w-[292px] flex-col border-r border-white/70 bg-white/[0.88] shadow-[18px_0_60px_rgba(80,100,160,0.12)] backdrop-blur-xl">
      <div className="px-6 pb-4 pt-6">
        <Link href="/" className="flex items-center gap-3 rounded-2xl transition-opacity hover:opacity-85" aria-label="GD SAT Platform homepage">
          <div className="relative">
            <Image src="/logo.jpg" alt="GD SAT Platform" width={48} height={48} className="rounded-2xl shadow-lg shadow-blue-500/15" />
            <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]" />
          </div>
          <div>
            <p className="text-[18px] font-black tracking-tight text-[#20232d]">GD SAT Platform</p>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6b7cff]">Student</p>
          </div>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
        {navGroups.map((group, groupIndex) => (
          <div key={group.titleKey ?? `group-${groupIndex}`} className="space-y-1">
            {group.titleKey && (
              <p className="px-4 pb-1 pt-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#9aa1b4]">
                {tSidebar(group.titleKey)}
              </p>
            )}
            {group.items.map((item, itemIndex) => renderNavItem(item, groupIndex * 4 + itemIndex))}
          </div>
        ))}
      </nav>

      {soonMessage && (
        <div className="mx-4 mb-3 rounded-2xl border border-[#dfe6ff] bg-[#f3f6ff] px-4 py-3 text-sm font-bold text-[#4f68f5] shadow-sm animate-fade-in">
          {soonMessage}
        </div>
      )}

      <div className="mt-auto border-t border-[#edf0f7] p-4">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher variant="light" />
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-[#f7f9ff] p-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5b7cfa] to-[#7c4dff] text-base font-black text-white shadow-lg shadow-indigo-400/25">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-[#242735]">{userDisplayName}</p>
            <p className="truncate text-xs font-medium text-[#8a91a3]">{userEmail ?? tCommon('student')}</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#8b90a0] transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={tCommon('logout')}
            title={tCommon('logout')}
          >
            {loggingOut ? (
              <LoadingSpinner className="h-5 w-5" label={tCommon('logout')} />
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <>
      {loggingOut && <LoadingOverlay label={tCommon('logout')} />}
      <div className="lg:hidden fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/70 bg-white/[0.88] px-4 shadow-sm backdrop-blur-xl">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#4f68f5]"
          aria-label={tCommon('openMenu')}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Link href="/" className="flex items-center gap-2 rounded-xl transition-opacity hover:opacity-85" aria-label="GD SAT Platform homepage">
          <Image src="/logo.jpg" alt="GD SAT Platform" width={34} height={34} className="rounded-xl" />
          <span className="font-black text-[#20232d]">GD SAT Platform</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5b7cfa] to-[#7c4dff] text-sm font-black text-white">
            {userInitial}
          </div>
        </div>
      </div>

      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block">{panel}</div>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-[#18203a]/45 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-[60] lg:hidden">
            {panel}
          </div>
        </>
      )}
    </>
  )
}
