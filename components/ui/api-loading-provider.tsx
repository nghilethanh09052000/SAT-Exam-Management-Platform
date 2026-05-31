'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { LoadingSpinner } from '@/components/ui/loading'

const SHOW_DELAY_MS = 120
const MIN_VISIBLE_MS = 250

// Paths that run silently in the background and should never trigger the
// global spinner. They have their own per-component loading states or are
// fire-and-forget (auto-save, progress bookmark, submit polling).
const SILENT_API_PATTERNS = [
  /^\/api\/submission-answers$/,           // auto-save during test (debounced, fire-and-forget)
  /^\/api\/submissions\/[^/]+$/,           // GET polling + PATCH progress bookmark
  /^\/api\/submissions\/[^/]+\/submit$/,   // submit has its own button loading state
  /^\/api\/questions\/[^/]+$/,             // question detail modals have their own loading state
  /^\/api\/free-test\/answers$/,           // free-test auto-save
  /^\/api\/free-test\/attempts\/[^/]+\/submit$/, // free-test submit
]

function isTrackedApiRequest(input: RequestInfo | URL) {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url

  try {
    const url = new URL(rawUrl, window.location.origin)
    if (url.origin !== window.location.origin) return false
    if (!url.pathname.startsWith('/api/')) return false
    if (SILENT_API_PATTERNS.some((pattern) => pattern.test(url.pathname))) return false
    return true
  } catch {
    return false
  }
}

export function ApiLoadingProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('common')
  const [pendingCount, setPendingCount] = useState(0)
  const [visible, setVisible] = useState(false)
  const shownAtRef = useRef<number | null>(null)

  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input, init) => {
      if (!isTrackedApiRequest(input)) {
        return originalFetch(input, init)
      }

      setPendingCount((count) => count + 1)

      try {
        return await originalFetch(input, init)
      } finally {
        setPendingCount((count) => Math.max(0, count - 1))
      }
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  useEffect(() => {
    if (pendingCount > 0) {
      const timer = window.setTimeout(() => {
        shownAtRef.current = Date.now()
        setVisible(true)
      }, SHOW_DELAY_MS)

      return () => window.clearTimeout(timer)
    }

    const shownAt = shownAtRef.current
    if (!shownAt) {
      setVisible(false)
      return
    }

    const elapsed = Date.now() - shownAt
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed)
    const timer = window.setTimeout(() => {
      shownAtRef.current = null
      setVisible(false)
    }, remaining)

    return () => window.clearTimeout(timer)
  }, [pendingCount])

  return (
    <>
      {children}
      {visible ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex justify-center px-4"
          aria-live="polite"
          aria-label={t('processingLabel')}
        >
          <div className="flex items-center gap-3 rounded-full border border-primary/15 bg-white/95 px-4 py-2 text-sm font-semibold text-ink shadow-lg shadow-black/10 backdrop-blur">
            <LoadingSpinner className="h-4 w-4" label={t('processingLabel')} />
            <span>{t('processing')}</span>
          </div>
        </div>
      ) : null}
    </>
  )
}
