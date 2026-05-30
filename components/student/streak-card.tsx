'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

interface DailyActivity {
  activity_date: string
  exercises_completed: number
}

interface StreakData {
  current_streak: number
  longest_streak: number
  last_activity_date: string | null
  total_days_active: number
}

interface StreakCardProps {
  streak: StreakData
  activity: DailyActivity[]
}

function buildHeatmapGrid(activity: DailyActivity[]) {
  const activityMap = new Map<string, number>()
  for (const a of activity) {
    activityMap.set(a.activity_date, a.exercises_completed)
  }

  // Build 53 complete weeks (~1 year) ending today (Sun→Sat columns)
  const WEEKS = 53
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun
  // Start from the Sunday (WEEKS-1) weeks ago
  const start = new Date(today)
  start.setDate(today.getDate() - dayOfWeek - (WEEKS - 1) * 7)

  const weeks: { date: string; count: number }[][] = []
  let current = new Date(start)

  for (let w = 0; w < WEEKS; w++) {
    const week: { date: string; count: number }[] = []
    for (let d = 0; d < 7; d++) {
      const iso = current.toISOString().slice(0, 10)
      const isFuture = current > today
      week.push({ date: iso, count: isFuture ? -1 : (activityMap.get(iso) ?? 0) })
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
  }

  return weeks
}

function cellColor(count: number) {
  if (count < 0) return 'bg-[#edf0f7]' // future
  if (count === 0) return 'bg-[#edf0f7]'
  if (count === 1) return 'bg-[#b3c6ff]'
  if (count === 2) return 'bg-[#7099ff]'
  if (count >= 3) return 'bg-[#4f7cff]'
  return 'bg-[#edf0f7]'
}

const DAY_INDICES = [0, 1, 3, 5]

export function StreakCard({ streak, activity }: StreakCardProps) {
  const t = useTranslations('student.streak')
  const DAY_LABELS = [t('daySun'), t('dayMon'), t('dayWed'), t('dayFri')]
  const weeks = useMemo(() => buildHeatmapGrid(activity), [activity])

  const isActiveToday = streak.last_activity_date === new Date().toISOString().slice(0, 10)

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-sm shadow-blue-100/70 backdrop-blur">
      {/* background glow */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#4f7cff]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-[#ffd15c]/15 blur-3xl" />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6d7cff]">{t('subtitle')}</p>
          <h2 className="mt-1 text-2xl font-black text-[#252837]">{t('title')}</h2>
        </div>
        {isActiveToday && (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            {t('activeToday')}
          </span>
        )}
      </div>

      {/* Streak stats */}
      <div className="relative mt-5 grid grid-cols-3 gap-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4f7cff] to-[#7c4dff] p-4 text-white shadow-lg shadow-indigo-300/30">
          <p className="text-3xl font-black leading-none">{streak.current_streak}</p>
          <p className="mt-1 text-xs font-bold opacity-80">{t('current')}</p>
          <svg className="absolute right-3 top-3 h-5 w-5 opacity-90" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2s5 4 5 9a5 5 0 1 1-10 0c0-2 1-3.5 2.5-5C9.5 8 11 9 11 11c1-2 1-5 1-9z" />
          </svg>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#fff7e6] to-[#ffecd1] p-4">
          <p className="text-3xl font-black leading-none text-[#e06c00]">{streak.longest_streak}</p>
          <p className="mt-1 text-xs font-bold text-[#c46500]">{t('longest')}</p>
          <svg className="absolute right-3 top-3 h-5 w-5 text-[#e0890c]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
          </svg>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7] p-4">
          <p className="text-3xl font-black leading-none text-[#16a34a]">{streak.total_days_active}</p>
          <p className="mt-1 text-xs font-bold text-[#15803d]">{t('activeDays')}</p>
          <svg className="absolute right-3 top-3 h-5 w-5 text-[#1aa64a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5h14v15H5zM8 3v4M16 3v4M5 10h14" />
          </svg>
        </div>
      </div>

      {/* GitHub-style heatmap */}
      <div className="relative mt-6">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#8a91a3]">{t('recentWeeks')}</p>
        <div className="flex gap-1">
          {/* Day labels */}
          <div className="flex w-5 flex-col gap-1 pr-1">
            {Array.from({ length: 7 }).map((_, d) => {
              const labelIdx = DAY_INDICES.indexOf(d)
              return (
                <div key={d} className="h-3 text-[9px] font-bold leading-3 text-[#9aa2b6]">
                  {labelIdx >= 0 ? DAY_LABELS[labelIdx] : ''}
                </div>
              )
            })}
          </div>

          {/* Cells */}
          <div className="flex flex-1 gap-1 overflow-x-auto pb-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((cell) => (
                  <div
                    key={cell.date}
                    title={cell.count >= 0 ? `${cell.date}: ${t('exercisesCompleted', { count: cell.count })}` : cell.date}
                    className={`h-3 w-3 shrink-0 rounded-sm transition-transform hover:scale-125 ${cellColor(cell.count)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-[#9aa2b6]">{t('less')}</span>
          {['bg-[#edf0f7]', 'bg-[#b3c6ff]', 'bg-[#7099ff]', 'bg-[#4f7cff]'].map((c) => (
            <div key={c} className={`h-2.5 w-2.5 rounded-sm ${c}`} />
          ))}
          <span className="text-[10px] font-bold text-[#9aa2b6]">{t('more')}</span>
        </div>
      </div>
    </div>
  )
}
