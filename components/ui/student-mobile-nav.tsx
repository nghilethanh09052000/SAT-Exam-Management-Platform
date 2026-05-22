'use client'

import { useState } from 'react'
import { Link } from '@/i18n/navigation'
import { LogoutButton } from '@/components/ui/logout-button'

export function StudentMobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className="sm:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-soft transition-colors text-mute-light"
        onClick={() => setOpen((v) => !v)}
        aria-label="Mở menu"
      >
        {open ? (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="sm:hidden fixed inset-0 z-20"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Dropdown menu */}
          <div className="sm:hidden absolute top-14 left-0 right-0 z-30 bg-canvas-light border-b border-hairline-light shadow-lg py-2">
            <Link
              href="/student"
              onClick={() => setOpen(false)}
              className="flex items-center px-4 py-3 text-sm font-medium text-ink hover:bg-surface-soft transition-colors"
            >
              Trang chủ
            </Link>
            <Link
              href="/student/assignments"
              onClick={() => setOpen(false)}
              className="flex items-center px-4 py-3 text-sm font-medium text-ink hover:bg-surface-soft transition-colors"
            >
              Bài kiểm tra
            </Link>
            <Link
              href="/student/error-log"
              onClick={() => setOpen(false)}
              className="flex items-center px-4 py-3 text-sm font-medium text-ink hover:bg-surface-soft transition-colors"
            >
              Sổ Tay Lỗi Sai
            </Link>
            <div className="border-t border-hairline-light mt-1 pt-1">
              <LogoutButton variant="full" />
            </div>
          </div>
        </>
      )}
    </>
  )
}
