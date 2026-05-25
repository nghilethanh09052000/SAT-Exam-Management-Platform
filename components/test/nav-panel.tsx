'use client'

import { useTranslations } from 'next-intl'

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
  const t = useTranslations('student.test')
  return (
    <div className="absolute bottom-5 left-1/2 z-30 flex max-h-[58vh] w-[460px] -translate-x-1/2 flex-col overflow-hidden rounded-[8px] border-2 border-black bg-white shadow-2xl">
      <div className="bg-[#111] px-5 py-4 text-white">
        <p className="text-[19px] font-bold">{t('navQuestionNavigator')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-[#d6d6d6] px-5 py-4">
        <div className="flex items-center gap-2 text-[13px] font-medium text-[#555]">
          <span className="h-5 w-5 rounded-full border-2 border-[#999]" />
          {t('navUnanswered')}
        </div>
        <div className="flex items-center gap-2 text-[13px] font-medium text-[#555]">
          <span className="h-5 w-5 rounded-full bg-[#3857d6]" />
          {t('navAnswered')}
        </div>
        <div className="flex items-center gap-2 text-[13px] font-medium text-[#555]">
          <span className="relative h-5 w-5 rounded-full border-2 border-[#999]">
            <span className="absolute -right-1 -top-2 text-[12px] leading-none text-black">⌑</span>
          </span>
          {t('navForReview')}
        </div>
        <div className="flex items-center gap-2 text-[13px] font-medium text-[#555]">
          <span className="relative h-5 w-5 rounded-full bg-[#3857d6]">
            <span className="absolute -right-1 -top-2 text-[12px] leading-none text-black">⌑</span>
          </span>
          {t('navAnsweredReview')}
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
                    ? 'bg-[#3857d6] text-white'
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
        <p className="text-[13px] font-medium text-[#555]">
          {t('navStatus', { answered: answeredIndices.size, total: totalQuestions, flagged: flaggedIndices.size })}
        </p>
      </div>
    </div>
  )
}
