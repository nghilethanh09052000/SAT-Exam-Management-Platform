'use client'

import Link from 'next/link'

interface ExerciseCardProps {
  id: string
  title: string
  description: string | null
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
  estimatedMinutes: number
  questionCount: number
  bestScore: { correct: number; total: number } | null
  completedAt: string | null
}

const DIFFICULTY_CONFIG = {
  easy:   { label: 'Dễ',    bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200', dot: 'bg-emerald-400' },
  medium: { label: 'Vừa',   bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200',   dot: 'bg-amber-400'   },
  hard:   { label: 'Khó',   bg: 'bg-rose-50',     text: 'text-rose-700',     border: 'border-rose-200',    dot: 'bg-rose-400'    },
}

const CATEGORY_ICONS: Record<string, string> = {
  math:             '📐',
  reading_writing:  '📖',
  grammar:          '✏️',
  vocabulary:       '🔤',
  general:          '📝',
}

export function ExerciseCard({
  id, title, description, difficulty, category,
  estimatedMinutes, questionCount, bestScore, completedAt,
}: ExerciseCardProps) {
  const diff = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.medium
  const icon = CATEGORY_ICONS[category] ?? '📝'
  const pct = bestScore && bestScore.total > 0
    ? Math.round((bestScore.correct / bestScore.total) * 100)
    : null

  return (
    <Link
      href={`/student/exercises/${id}`}
      className="group relative flex flex-col overflow-hidden rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-sm shadow-blue-100/50 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-100/70"
    >
      {/* top gradient bar based on difficulty */}
      <div className={`absolute inset-x-0 top-0 h-1 rounded-t-[24px] ${
        difficulty === 'easy' ? 'bg-gradient-to-r from-emerald-400 to-teal-400' :
        difficulty === 'medium' ? 'bg-gradient-to-r from-amber-400 to-orange-400' :
        'bg-gradient-to-r from-rose-400 to-pink-500'
      }`} />

      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f0f4ff] text-2xl shadow-sm">
          {icon}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${diff.bg} ${diff.text} ${diff.border}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${diff.dot}`} />
            {diff.label}
          </span>
          {completedAt && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
              ✓ Đã làm
            </span>
          )}
        </div>
      </div>

      <h3 className="mt-3 text-base font-black text-[#252837] transition-colors group-hover:text-[#4f7cff]">
        {title}
      </h3>
      {description && (
        <p className="mt-1 line-clamp-2 text-sm font-medium text-[#7b8295]">{description}</p>
      )}

      <div className="mt-4 flex items-center gap-3 text-xs font-bold text-[#9aa2b6]">
        <span className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6m9-6a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {questionCount} câu
        </span>
        <span className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
          </svg>
          ~{estimatedMinutes} phút
        </span>
      </div>

      {pct !== null && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs font-black">
            <span className="text-[#6a7286]">Điểm tốt nhất</span>
            <span className={pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-rose-600'}>
              {bestScore!.correct}/{bestScore!.total} ({pct}%)
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#edf0f7]">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                pct >= 80 ? 'bg-gradient-to-r from-emerald-400 to-teal-400' :
                pct >= 60 ? 'bg-gradient-to-r from-amber-400 to-orange-400' :
                'bg-gradient-to-r from-rose-400 to-pink-400'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs font-semibold capitalize text-[#9aa2b6]">
          {category.replace('_', ' ')}
        </span>
        <span className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-black transition-all duration-200 group-hover:shadow-md ${
          completedAt
            ? 'bg-[#f0f4ff] text-[#4f7cff] group-hover:bg-[#4f7cff] group-hover:text-white'
            : 'bg-gradient-to-r from-[#4f7cff] to-[#7c4dff] text-white shadow-lg shadow-indigo-300/30'
        }`}>
          {completedAt ? 'Làm lại' : 'Bắt đầu'}
          <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </Link>
  )
}
