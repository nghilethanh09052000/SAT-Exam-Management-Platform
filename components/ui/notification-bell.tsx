'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

type NotificationBellProps = {
  className?: string
}

export function NotificationBell({ className = '' }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const t = useTranslations('student.notifications')

  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t('ariaLabel')}
        aria-expanded={open}
        title={t('ariaLabel')}
        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70 bg-white/[0.88] text-[#4f68f5] shadow-[0_8px_24px_rgba(80,100,160,0.12)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-[#2f43c9]"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-4-5.7V5a2 2 0 1 0-4 0v.3A6 6 0 0 0 6 11v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0m6 0H9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-[0_20px_60px_rgba(80,100,160,0.22)] backdrop-blur-xl animate-fade-in">
          <div className="border-b border-[#eef0f7] px-4 py-3">
            <p className="text-sm font-black text-[#242735]">{t('title')}</p>
          </div>
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3f6ff] text-[#6472f4]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-4-5.7V5a2 2 0 1 0-4 0v.3A6 6 0 0 0 6 11v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0m6 0H9" />
              </svg>
            </div>
            <p className="text-sm font-medium leading-relaxed text-[#697083]">{t('empty')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
