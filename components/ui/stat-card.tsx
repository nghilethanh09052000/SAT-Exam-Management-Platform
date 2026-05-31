'use client'

import { useEffect, useRef, useState } from 'react'

type StatColor = 'blue' | 'violet' | 'amber' | 'emerald' | 'pink' | 'cyan' | 'rose'

interface StatCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  trend?: string
  trendUp?: boolean
  color?: StatColor
  /** delay in ms for staggered entrance animation */
  delay?: number
}

const colorMap: Record<StatColor, {
  gradient: string
  glow: string
}> = {
  blue:    { gradient: 'from-[#53685e] to-[#3f584d]', glow: 'shadow-[#53685e]/25' },
  violet:  { gradient: 'from-[#8f7f67] to-[#5f594c]', glow: 'shadow-[#5f594c]/25' },
  amber:   { gradient: 'from-[#d8c28a] to-[#b9914e]', glow: 'shadow-[#b9914e]/25' },
  emerald: { gradient: 'from-[#7da678] to-[#53685e]', glow: 'shadow-[#7da678]/25' },
  pink:    { gradient: 'from-[#c97862] to-[#9d5b4d]', glow: 'shadow-[#c97862]/25' },
  cyan:    { gradient: 'from-[#6f7f78] to-[#4e6159]', glow: 'shadow-[#6f7f78]/25' },
  rose:    { gradient: 'from-[#c97862] to-[#8d463b]', glow: 'shadow-[#c97862]/25' },
}

/** Animated counter that ticks up on mount */
function AnimatedNumber({ target }: { target: number }) {
  const [display, setDisplay] = useState(0)
  const raf = useRef<number>(0)

  useEffect(() => {
    const duration = 800
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(eased * target))
      if (progress < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target])

  return <>{display.toLocaleString('vi-VN')}</>
}

export function StatCard({ label, value, icon, trend, trendUp = true, color, delay = 0 }: StatCardProps) {
  /* ── Colorless fallback (used by teacher dashboard) ── */
  if (!color) {
    return (
      <div className="rounded-2xl border border-[#e7e0d2] bg-white/90 p-5 shadow-[0_12px_30px_rgba(67,57,39,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(67,57,39,0.10)]">
        <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-[#7a7164] font-medium">{label}</p>
          <p className="text-3xl font-display font-bold text-[#25231d] tabular-nums">
            {typeof value === 'number' ? <AnimatedNumber target={value} /> : value}
          </p>
          {trend && <p className="text-xs text-[#8b8275]">{trend}</p>}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-[#eee4cc] flex items-center justify-center text-[#6f5b25] shrink-0">
            {icon}
          </div>
        )}
        </div>
      </div>
    )
  }

  const c = colorMap[color]

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[#e7e0d2] bg-white/90 p-5 text-[#25231d] shadow-[0_12px_30px_rgba(67,57,39,0.07)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(67,57,39,0.12)] animate-pop-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="relative flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[#7a7164]">{label}</p>
          <p className="text-4xl font-display font-bold leading-none tabular-nums">
            {typeof value === 'number' ? <AnimatedNumber target={value} /> : value}
          </p>
          {trend && (
            <p className="text-xs font-medium flex items-center gap-1 text-[#7a7164]">
              {trendUp ? '↑' : '↓'} {trend}
            </p>
          )}
        </div>
        {icon && (
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${c.gradient} shadow-lg ${c.glow} flex items-center justify-center shrink-0 text-white`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
