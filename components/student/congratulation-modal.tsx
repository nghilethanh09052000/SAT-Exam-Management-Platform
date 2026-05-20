'use client'

import { useEffect, useRef } from 'react'

interface CongratulationModalProps {
  open: boolean
  onClose: () => void
  score: { correct: number; total: number }
  streak: { current: number; longest: number; isNewDay: boolean; isMilestone: boolean }
  exerciseTitle: string
}

function Confetti() {
  const colors = ['#4f7cff', '#ffd15c', '#22c55e', '#f97316', '#7c4dff', '#ec4899']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 24 }).map((_, i) => {
        const color = colors[i % colors.length]
        const left = `${(i * 4.2 + 2) % 100}%`
        const delay = `${(i * 0.12).toFixed(2)}s`
        const size = i % 3 === 0 ? 'h-3 w-3' : i % 3 === 1 ? 'h-2 w-4' : 'h-2 w-2'
        return (
          <div
            key={i}
            className={`absolute -top-4 ${size} animate-confetti rounded-sm opacity-90`}
            style={{ left, animationDelay: delay, background: color }}
          />
        )
      })}
    </div>
  )
}

export function CongratulationModal({ open, onClose, score, streak, exerciseTitle }: CongratulationModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const isPerfect = pct === 100
  const isGood = pct >= 80

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#18203a]/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-2xl shadow-indigo-200/50 animate-pop-in">
        <Confetti />

        {/* Top gradient */}
        <div className={`h-2 w-full ${isPerfect ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400' : 'bg-gradient-to-r from-[#4f7cff] via-[#7c4dff] to-[#4f7cff]'}`} />

        <div className="relative p-8">
          {/* Big emoji */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#eef3ff] to-[#f5f0ff] text-5xl shadow-inner">
            {isPerfect ? '🏆' : isGood ? '🎉' : '💪'}
          </div>

          <h2 className="mt-5 text-center text-2xl font-black text-[#252837]">
            {isPerfect ? 'Hoàn hảo!' : isGood ? 'Xuất sắc!' : 'Cố gắng lên!'}
          </h2>
          <p className="mt-2 text-center text-sm font-semibold text-[#7b8295]">
            {exerciseTitle}
          </p>

          {/* Score */}
          <div className="mt-6 rounded-2xl bg-gradient-to-br from-[#f5f8ff] to-[#f0f4ff] p-5 text-center">
            <p className="text-5xl font-black text-[#4f7cff]">{pct}%</p>
            <p className="mt-1 text-sm font-bold text-[#7b8295]">
              {score.correct}/{score.total} câu đúng
            </p>
            <div className="mx-auto mt-3 h-2.5 max-w-[180px] overflow-hidden rounded-full bg-white/80">
              <div
                className={`h-full rounded-full transition-all duration-700 ${isPerfect ? 'bg-gradient-to-r from-amber-400 to-yellow-300' : 'bg-gradient-to-r from-[#4f7cff] to-[#7c4dff]'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Streak */}
          {streak.isNewDay && (
            <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 p-4">
              <span className="text-3xl">🔥</span>
              <div>
                <p className="font-black text-orange-700">
                  {streak.current} ngày liên tiếp!
                </p>
                {streak.isMilestone && (
                  <p className="text-sm font-bold text-orange-600">
                    🎯 Mốc {streak.current} ngày — tuyệt vời!
                  </p>
                )}
                {!streak.isMilestone && streak.current > 1 && (
                  <p className="text-sm font-semibold text-orange-500">
                    Tiếp tục duy trì streak nhé!
                  </p>
                )}
                {streak.current === 1 && (
                  <p className="text-sm font-semibold text-orange-500">
                    Ngày đầu tiên — hãy quay lại ngày mai!
                  </p>
                )}
              </div>
            </div>
          )}

          {streak.longest > 1 && streak.current === streak.longest && (
            <p className="mt-3 text-center text-xs font-bold text-[#7c4dff]">
              🏅 Kỷ lục cá nhân: {streak.longest} ngày liên tiếp!
            </p>
          )}

          <button
            onClick={onClose}
            className="mt-6 w-full rounded-2xl bg-gradient-to-r from-[#4f7cff] to-[#7c4dff] py-4 text-base font-black text-white shadow-lg shadow-indigo-300/40 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-300/50 active:translate-y-0"
          >
            Tiếp tục luyện tập 💪
          </button>
        </div>
      </div>
    </div>
  )
}
