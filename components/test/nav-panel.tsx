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
    <div className="absolute bottom-5 left-1/2 z-30 flex max-h-[54vh] w-[420px] -translate-x-1/2 flex-col overflow-hidden rounded-[8px] border-2 border-black bg-white shadow-2xl">
      <div className="border-b border-[#d6d6d6] px-5 py-4">
        <p className="text-sm font-bold uppercase tracking-wide text-[#222]">
          Question Navigator
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-[#d6d6d6] px-5 py-4">
        <div className="flex items-center gap-2 text-xs font-medium text-[#555]">
          <span className="h-5 w-5 rounded-full border-2 border-[#999]" />
          Unanswered
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-[#555]">
          <span className="h-5 w-5 rounded-full bg-[#354bc6]" />
          Answered
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-[#555]">
          <span className="relative h-5 w-5 rounded-full border-2 border-[#999]">
            <span className="absolute -right-1 -top-2 text-[12px] leading-none text-black">⌑</span>
          </span>
          For review
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-[#555]">
          <span className="relative h-5 w-5 rounded-full bg-[#354bc6]">
            <span className="absolute -right-1 -top-2 text-[12px] leading-none text-black">⌑</span>
          </span>
          Answered + review
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-8 gap-3">
          {Array.from({ length: totalQuestions }, (_, i) => {
            const isAnswered = answeredIndices.has(i)
            const isFlagged = flaggedIndices.has(i)
            const isCurrent = currentIndex === i

            return (
              <button
                key={i}
                onClick={() => onNavigate(i)}
                className={[
                  'relative h-10 w-10 rounded-full text-sm font-bold transition-all',
                  isCurrent
                    ? 'ring-2 ring-offset-2 ring-black'
                    : '',
                  isAnswered
                    ? 'bg-[#354bc6] text-white'
                    : 'border-2 border-[#999] text-[#333] hover:border-black',
                ].join(' ')}
                title={`Question ${i + 1}`}
              >
                {i + 1}
                {isFlagged && (
                  <span className="absolute -right-1.5 -top-2 flex h-4 w-4 items-center justify-center text-[12px] text-black">
                    ⌑
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-t border-[#d6d6d6] px-5 py-3">
        <p className="text-xs font-medium text-[#555]">
          {answeredIndices.size}/{totalQuestions} answered · {flaggedIndices.size} marked
        </p>
      </div>
    </div>
  )
}
