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
  iconBg: string
  trendColor: string
}> = {
  blue:    { gradient: 'from-blue-500 to-blue-700',       glow: 'shadow-blue-500/40',    iconBg: 'bg-white/20', trendColor: 'text-blue-100'   },
  violet:  { gradient: 'from-violet-500 to-purple-700',   glow: 'shadow-violet-500/40',  iconBg: 'bg-white/20', trendColor: 'text-violet-100' },
  amber:   { gradient: 'from-amber-400 to-orange-600',    glow: 'shadow-amber-500/40',   iconBg: 'bg-white/20', trendColor: 'text-amber-100'  },
  emerald: { gradient: 'from-emerald-400 to-teal-600',    glow: 'shadow-emerald-500/40', iconBg: 'bg-white/20', trendColor: 'text-emerald-100'},
  pink:    { gradient: 'from-pink-500 to-rose-600',       glow: 'shadow-pink-500/40',    iconBg: 'bg-white/20', trendColor: 'text-pink-100'   },
  cyan:    { gradient: 'from-cyan-400 to-sky-600',        glow: 'shadow-cyan-500/40',    iconBg: 'bg-white/20', trendColor: 'text-cyan-100'   },
  rose:    { gradient: 'from-rose-500 to-red-700',        glow: 'shadow-rose-500/40',    iconBg: 'bg-white/20', trendColor: 'text-rose-100'   },
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
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start justify-between gap-4
                      hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
        <div className="space-y-1">
          <p className="text-sm text-mute-light font-medium">{label}</p>
          <p className="text-3xl font-display font-bold text-ink">
            {typeof value === 'number' ? <AnimatedNumber target={value} /> : value}
          </p>
          {trend && <p className="text-xs text-mute-light">{trend}</p>}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            {icon}
          </div>
        )}
      </div>
    )
  }

  const c = colorMap[color]

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${c.gradient}
                  shadow-lg ${c.glow} p-5 text-white
                  hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-default
                  animate-pop-in`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Decorative circles */}
      <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -bottom-8 -right-2 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-white/80">{label}</p>
          <p className="text-4xl font-display font-bold leading-none">
            {typeof value === 'number' ? <AnimatedNumber target={value} /> : value}
          </p>
          {trend && (
            <p className={`text-xs font-medium flex items-center gap-1 ${c.trendColor}`}>
              {trendUp ? '↑' : '↓'} {trend}
            </p>
          )}
        </div>
        {icon && (
          <div className={`w-11 h-11 rounded-xl ${c.iconBg} backdrop-blur-sm flex items-center justify-center shrink-0 text-white`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
