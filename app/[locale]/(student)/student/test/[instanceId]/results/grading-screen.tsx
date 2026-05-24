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

interface Props {
  submissionId: string
  instanceId: string
}

const MAX_ATTEMPTS = 20   // 20 × 1 s = 20 s

export function GradingScreen({ submissionId, instanceId }: Props) {
  const router = useRouter()
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
    <div className="min-h-[80vh] flex items-center justify-center bg-[#f0f4ff]">
      <div className="max-w-sm w-full rounded-2xl bg-white shadow-lg p-8 text-center space-y-5">
        {!timedOut ? (
          <>
            <div className="flex justify-center">
              <div className="h-14 w-14 rounded-full border-4 border-[#e0e7ff] border-t-[#3857d6] animate-spin" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#111]">Đang chấm bài…</h1>
              <p className="mt-2 text-sm text-[#555]">
                Hệ thống đang xử lý kết quả. Trang sẽ tự cập nhật sau vài giây.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-center text-4xl">⏳</div>
            <div>
              <h1 className="text-xl font-bold text-[#111]">Chấm bài mất hơn bình thường</h1>
              <p className="mt-2 text-sm text-[#555]">
                Kết quả vẫn chưa sẵn sàng sau 20 giây. Vui lòng tải lại trang hoặc báo giáo viên.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-full bg-[#3857d6] py-2.5 text-sm font-semibold text-white hover:bg-[#263bba] transition-colors"
            >
              Tải lại trang
            </button>
          </>
        )}
      </div>
    </div>
  )
}
