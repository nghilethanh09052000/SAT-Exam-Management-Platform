'use client'

import { useState, useEffect, useCallback } from 'react'

interface TimerProps {
  totalSeconds: number
  onExpire: () => void
}

export function Timer({ totalSeconds, onExpire }: TimerProps) {
  const [remaining, setRemaining] = useState(totalSeconds)
  const [visible, setVisible] = useState(true)

  const handleExpire = useCallback(onExpire, [onExpire])

  useEffect(() => {
    if (remaining <= 0) {
      handleExpire()
      return
    }
    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(id)
          handleExpire()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [handleExpire, remaining])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const isLow = remaining < 300 // < 5 minutes

  return (
    <button
      onClick={() => setVisible((v) => !v)}
      className={[
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-display font-bold transition-colors',
        isLow
          ? 'text-warning bg-red-50'
          : 'text-ink bg-surface-soft',
      ].join(' ')}
      title={visible ? 'Ẩn đồng hồ' : 'Hiện đồng hồ'}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      {visible
        ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : '--:--'}
    </button>
  )
}
