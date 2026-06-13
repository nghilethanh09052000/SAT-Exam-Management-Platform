'use client'

/**
 * GradingScreen — production-only fallback.
 *
 * Only shown when the student lands on /results while the submission is still
 * 'grading' (i.e. the Vercel Queue worker hasn't finished yet).
 *
 * In local dev this screen should never appear because the submit route runs
 * grading synchronously and returns 200 (not 202), so the test interface
 * navigates directly to /results after grading is already done.
 *
 * Polls GET /api/submissions/[id] every 1 s for up to 20 s.
 * After that, shows a retry button — hard reload so RSC re-fetches from DB.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LoadingSpinner } from '@/components/ui/loading'

interface Props {
  submissionId: string
  instanceId: string
}

const MAX_ATTEMPTS = 20   // 20 × 1 s = 20 s

export function GradingScreen({ submissionId, instanceId }: Props) {
  const router = useRouter()
  const t = useTranslations('student.test')
  const [timedOut, setTimedOut] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    let count = 0
    intervalRef.current = setInterval(async () => {
      count++
      if (count >= MAX_ATTEMPTS) {
        clearInterval(intervalRef.current!)
        setTimedOut(true)
        return
      }
      try {
        const res  = await fetch(`/api/submissions/${submissionId}`)
        const json = await res.json()
        if (json.data?.status === 'submitted') {
          clearInterval(intervalRef.current!)
          // Hard reload: RSC re-runs and renders ResultsClient instead
          window.location.reload()
        }
      } catch {
        // network blip — keep polling
      }
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [submissionId])

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="relative w-full max-w-sm animate-fade-up overflow-hidden rounded-[32px] border border-white/80 bg-white/90 p-8 text-center shadow-sm shadow-blue-100/70 backdrop-blur">
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-[#7c4dff]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-14 -left-8 h-40 w-40 rounded-full bg-[#65d6c4]/20 blur-3xl" />
        <div className="relative space-y-5">
          {!timedOut ? (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-[#4f7cff] to-[#7c4dff] text-white shadow-lg shadow-indigo-500/25">
                <LoadingSpinner className="h-8 w-8" label={t('gradingTitle')} />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-ink">{t('gradingTitle')}</h1>
                <p className="mt-2 text-sm font-semibold text-[#778095]">{t('gradingDesc')}</p>
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#fff4e6] text-3xl">⏳</div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-ink">{t('gradingTimeoutTitle')}</h1>
                <p className="mt-2 text-sm font-semibold text-[#778095]">{t('gradingTimeoutDesc')}</p>
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#4f7cff] to-[#7c4dff] text-base font-black text-white shadow-lg shadow-indigo-500/20 transition-transform duration-200 hover:scale-[1.02] active:scale-95"
              >
                {t('reload')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
