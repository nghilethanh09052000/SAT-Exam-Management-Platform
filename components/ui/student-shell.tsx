'use client'

import { usePathname } from 'next/navigation'
import { useLocale } from 'next-intl'
import { StudentSidebar } from '@/components/ui/student-sidebar'
import { NotificationBell } from '@/components/ui/notification-bell'

interface StudentShellProps {
  children: React.ReactNode
  userDisplayName: string
  userEmail?: string | null
  userInitial: string
}

export function StudentShell({ children, userDisplayName, userEmail, userInitial }: StudentShellProps) {
  const pathname = usePathname()
  const locale = useLocale()

  const isExamRoute = pathname
    ? new RegExp(`^/${locale}/student/test/[^/]+/?$`).test(pathname)
    : false

  if (isExamRoute) {
    return (
      <div className="min-h-screen overflow-hidden bg-white">
        {children}
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#f5f7ff]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(96,165,250,0.20),transparent_28%),radial-gradient(circle_at_82%_8%,rgba(251,191,36,0.20),transparent_26%),radial-gradient(circle_at_78%_78%,rgba(45,212,191,0.18),transparent_28%)]" />
      <StudentSidebar
        userDisplayName={userDisplayName}
        userEmail={userEmail}
        userInitial={userInitial}
      />
      <main className="relative min-h-screen px-4 pb-10 pt-20 sm:px-6 lg:ml-[292px] lg:px-10 lg:pt-8">
        <div className="mx-auto max-w-[1500px]">{children}</div>
      </main>
    </div>
  )
}
