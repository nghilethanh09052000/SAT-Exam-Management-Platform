'use client'

import { Link } from '@/i18n/navigation'

export interface StudentTab {
  key: string
  label: string
  icon: React.ReactNode
}

interface StudentTabBarProps {
  basePath: string
  tabs: StudentTab[]
  activeKey: string
}

// Segmented control that switches the active tab via the ?tab= query param.
// Each tab is a Link so the server component re-renders the active panel with
// its own data — no client data fetching.
export function StudentTabBar({ basePath, tabs, activeKey }: StudentTabBarProps) {
  return (
    <div className="flex w-full gap-1.5 overflow-x-auto rounded-[20px] border border-white/80 bg-white/80 p-1.5 shadow-sm shadow-blue-100/60 backdrop-blur">
      {tabs.map((tab) => {
        const active = tab.key === activeKey
        return (
          <Link
            key={tab.key}
            href={`${basePath}?tab=${tab.key}`}
            scroll={false}
            className={[
              'flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-black transition-all duration-300',
              active
                ? 'bg-gradient-to-r from-[#4f7cff] via-[#6d5dfc] to-[#8b5cf6] text-white shadow-lg shadow-indigo-500/25'
                : 'text-[#6a7286] hover:bg-[#f0f4ff] hover:text-[#4f68f5]',
            ].join(' ')}
          >
            <span className="h-4 w-4 shrink-0">{tab.icon}</span>
            <span className="truncate">{tab.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
