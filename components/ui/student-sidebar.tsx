'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

type StudentSidebarProps = {
  userDisplayName: string
  userEmail?: string | null
  userInitial: string
}

const navItems = [
  {
    label: 'Bảng điều khiển',
    href: '/student',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
      </svg>
    ),
  },
  {
    label: 'Bài kiểm tra',
    href: '/student/assignments',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 3h10l3 3v15H4V3h3z" />
        <path d="M8 9h8M8 13h5M8 17h7" />
      </svg>
    ),
  },
  {
    label: 'Sổ tay lỗi sai',
    href: '/student/error-log',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 4h14v16H5z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </svg>
    ),
  },
  {
    label: 'Lịch học',
    href: '#coming-soon',
    soon: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 5h14v15H5zM8 3v4M16 3v4M5 10h14" />
      </svg>
    ),
  },
  {
    label: 'Thành tích',
    href: '#coming-soon',
    soon: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 20V10M12 20V4M18 20v-7" />
      </svg>
    ),
  },
]

export function StudentSidebar({ userDisplayName, userEmail, userInitial }: StudentSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [soonMessage, setSoonMessage] = useState('')
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createBrowserClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function isActive(href: string, index: number) {
    if (href === '#coming-soon') return false
    if (href === '/student') return pathname === '/student'
    return pathname === href || Boolean(pathname?.startsWith(`${href}/`))
  }

  const panel = (
    <aside className="flex h-full w-[292px] flex-col border-r border-white/70 bg-white/[0.88] shadow-[18px_0_60px_rgba(80,100,160,0.12)] backdrop-blur-xl">
      <div className="px-7 pb-6 pt-7">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Image src="/logo.jpg" alt="GD SAT Platform" width={52} height={52} className="rounded-2xl shadow-lg shadow-blue-500/15" />
            <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]" />
          </div>
          <div>
            <p className="text-[19px] font-black tracking-tight text-[#20232d]">GD SAT Platform</p>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6b7cff]">Student</p>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4">
        {navItems.map((item, index) => {
          const active = isActive(item.href, index)
          const isSoon = Boolean(item.soon)
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={isSoon ? pathname : item.href}
              onClick={(event) => {
                if (isSoon) {
                  event.preventDefault()
                  setSoonMessage(`${item.label} đang được xây dựng`)
                  window.setTimeout(() => setSoonMessage(''), 1800)
                  setMobileOpen(false)
                  return
                }
                setMobileOpen(false)
              }}
              className={[
                'group relative flex items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-bold transition-all duration-300',
                active
                  ? 'border-[3px] border-black bg-gradient-to-r from-[#4f7cff] via-[#6d5dfc] to-[#8b5cf6] text-white shadow-xl shadow-indigo-500/25'
                  : 'text-[#505566] hover:-translate-y-0.5 hover:bg-[#f3f6ff] hover:text-[#2f43c9]',
              ].join(' ')}
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <span
                className={[
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-all duration-300',
                  active
                    ? 'bg-white/[0.22] text-white'
                    : 'bg-white text-[#6472f4] shadow-sm shadow-blue-100 group-hover:bg-[#e8edff]',
                ].join(' ')}
              >
                <span className="h-5 w-5">{item.icon}</span>
              </span>
              <span className="truncate">{item.label}</span>
              {isSoon && (
                <span className="ml-auto rounded-full bg-[#eef3ff] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#6472f4] group-hover:bg-white">
                  Soon
                </span>
              )}
              {active && <span className="ml-auto h-2 w-2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)]" />}
            </Link>
          )
        })}
      </nav>

      {soonMessage && (
        <div className="mx-4 mb-3 rounded-2xl border border-[#dfe6ff] bg-[#f3f6ff] px-4 py-3 text-sm font-bold text-[#4f68f5] shadow-sm animate-fade-in">
          {soonMessage}
        </div>
      )}

      <div className="p-4">
        <div className="rounded-[24px] bg-gradient-to-br from-[#fff7d6] via-[#e7f7ff] to-[#efe9ff] p-4 shadow-inner">
          <p className="text-sm font-black text-[#252837]">Mục tiêu tuần này</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-[#697083]">Hoàn thành bài mới và ghi lại lỗi sai quan trọng.</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-[#ffb84d] via-[#56d7a3] to-[#5b7cfa]" />
          </div>
        </div>
      </div>

      <div className="border-t border-[#edf0f7] p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-[#f7f9ff] p-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5b7cfa] to-[#7c4dff] text-base font-black text-white shadow-lg shadow-indigo-400/25">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-[#242735]">{userDisplayName}</p>
            <p className="truncate text-xs font-medium text-[#8a91a3]">{userEmail ?? 'Học viên'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#8b90a0] transition-colors hover:bg-rose-50 hover:text-rose-500"
            aria-label="Đăng xuất"
            title="Đăng xuất"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <>
      <div className="lg:hidden fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/70 bg-white/[0.88] px-4 shadow-sm backdrop-blur-xl">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#4f68f5]"
          aria-label="Mở menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <Image src="/logo.jpg" alt="GD SAT Platform" width={34} height={34} className="rounded-xl" />
          <span className="font-black text-[#20232d]">GD SAT Platform</span>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5b7cfa] to-[#7c4dff] text-sm font-black text-white">
          {userInitial}
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
