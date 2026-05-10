'use client'

interface NavPanelProps {
  totalQuestions: number
  currentIndex: number
  answeredIndices: Set<number>
  flaggedIndices: Set<number>
  onNavigate: (index: number) => void
}

export function NavPanel({
  totalQuestions,
  currentIndex,
  answeredIndices,
  flaggedIndices,
  onNavigate,
}: NavPanelProps) {
  return (
    <div className="w-56 shrink-0 border-l border-hairline-light bg-surface-card flex flex-col">
      <div className="px-4 py-3 border-b border-hairline-light">
        <p className="text-xs font-semibold text-mute-light uppercase tracking-wide">
          Điều hướng câu hỏi
        </p>
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-b border-hairline-light space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-mute-light">
          <span className="w-5 h-5 rounded-full border-2 border-ash-light" />
          Chưa trả lời
        </div>
        <div className="flex items-center gap-2 text-xs text-mute-light">
          <span className="w-5 h-5 rounded-full bg-primary" />
          Đã trả lời
        </div>
        <div className="flex items-center gap-2 text-xs text-mute-light">
          <span className="w-5 h-5 rounded-full bg-amber-400" />
          Đánh dấu
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: totalQuestions }, (_, i) => {
            const isAnswered = answeredIndices.has(i)
            const isFlagged = flaggedIndices.has(i)
            const isCurrent = currentIndex === i

            return (
              <button
                key={i}
                onClick={() => onNavigate(i)}
                className={[
                  'w-8 h-8 rounded-full text-xs font-bold transition-all',
                  isCurrent
                    ? 'ring-2 ring-offset-1 ring-primary'
                    : '',
                  isFlagged
                    ? 'bg-amber-400 text-white'
                    : isAnswered
                    ? 'bg-primary text-white'
                    : 'border-2 border-ash-light text-mute-light hover:border-primary hover:text-primary',
                ].join(' ')}
                title={`Câu ${i + 1}`}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-t border-hairline-light">
        <p className="text-xs text-mute-light">
          {answeredIndices.size}/{totalQuestions} đã trả lời
        </p>
      </div>
    </div>
  )
}
