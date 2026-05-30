'use client'

import { useTranslations } from 'next-intl'

interface NavPanelProps {
  sectionTitle: string
  totalQuestions: number
  currentIndex: number
  answeredIndices: Set<number>
  flaggedIndices: Set<number>
  onNavigate: (index: number) => void
  onClose: () => void
  onGoToReview: () => void
}

function LocationPin({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a7 7 0 0 0-7 7c0 4.9 7 13 7 13s7-8.1 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
    </svg>
  )
}

function ReviewBookmark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 3h10a1 1 0 0 1 1 1v17l-6-3.6L6 21V4a1 1 0 0 1 1-1z" />
    </svg>
  )
}

export function NavPanel({
  sectionTitle,
  totalQuestions,
  currentIndex,
  answeredIndices,
  flaggedIndices,
  onNavigate,
  onClose,
  onGoToReview,
}: NavPanelProps) {
  const t = useTranslations('student.test')
  return (
    <div className="absolute bottom-5 left-1/2 z-30 flex max-h-[68vh] w-[640px] max-w-[calc(100%-2.5rem)] -translate-x-1/2 flex-col overflow-hidden rounded-[12px] border border-[#d6d6d6] bg-white shadow-2xl">
      <div className="relative px-6 pb-4 pt-5">
        <h2 className="px-8 text-center text-[22px] font-bold leading-tight text-[#111]">
          {sectionTitle}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="absolute right-5 top-4 flex h-8 w-8 items-center justify-center text-[26px] font-light leading-none text-[#444] hover:text-black"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-2 border-y border-[#e0e0e0] px-6 py-3 text-[16px] text-[#111]">
        <span className="flex items-center gap-2">
          <LocationPin className="h-5 w-5 text-[#111]" />
          {t('navCurrent')}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-5 w-5 border-2 border-dashed border-[#111]" />
          {t('navUnanswered')}
        </span>
        <span className="flex items-center gap-2">
          <ReviewBookmark className="h-5 w-5 text-[#c2334d]" />
          {t('navForReview')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-10 gap-x-4 gap-y-7">
          {Array.from({ length: totalQuestions }, (_, i) => {
            const isAnswered = answeredIndices.has(i)
            const isFlagged = flaggedIndices.has(i)
            const isCurrent = currentIndex === i

            return (
              <div key={i} className="relative flex justify-center">
                {isCurrent && (
                  <LocationPin className="absolute -top-6 left-1/2 h-5 w-5 -translate-x-1/2 text-[#111]" />
                )}
                <button
                  type="button"
                  onClick={() => onNavigate(i)}
                  className={[
                    'relative flex h-11 w-11 items-center justify-center text-[18px] font-bold transition-colors',
                    isAnswered
                      ? 'bg-[#3857d6] text-white hover:bg-[#2c47b8]'
                      : 'border-2 border-dashed border-[#111] bg-white text-[#3857d6] hover:bg-[#eef1fb]',
                  ].join(' ')}
                  title={`Question ${i + 1}`}
                >
                  {i + 1}
                  {isFlagged && (
                    <ReviewBookmark className="absolute -right-1.5 -top-2 h-4 w-4 text-[#c2334d]" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex justify-center border-t border-[#e0e0e0] px-6 py-4">
        <button
          type="button"
          onClick={onGoToReview}
          className="rounded-full border-2 border-[#3857d6] px-7 py-2 text-[16px] font-bold text-[#3857d6] transition-colors hover:bg-[#3857d6] hover:text-white"
        >
          {t('navGoToReview')}
        </button>
      </div>
    </div>
  )
}
