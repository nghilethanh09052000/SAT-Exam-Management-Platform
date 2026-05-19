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
        'flex flex-col items-center gap-1.5 text-black transition-colors',
        isLow
          ? 'text-warning'
          : 'text-black',
      ].join(' ')}
      title={visible ? 'Ẩn đồng hồ' : 'Hiện đồng hồ'}
    >
      <span className="text-[26px] font-bold leading-none">
        {visible
          ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
          : '--:--'}
      </span>
      <span className="rounded-full border-2 border-current px-3.5 py-0.5 text-[13px] font-bold leading-tight">
        {visible ? 'Hide' : 'Show'}
      </span>
    </button>
  )
}
