'use client'

interface Option {
  id: string
  label: string
  content: string
}

interface QuestionDisplayProps {
  questionId: string
  questionNumber: number
  content: string
  passageText?: string | null
  options: Option[]
  selectedOptionId: string | null
  onSelect: (optionId: string) => void
  studentName?: string
}

export function QuestionDisplay({
  questionId,
  questionNumber,
  content,
  passageText,
  options,
  selectedOptionId,
  onSelect,
  studentName,
}: QuestionDisplayProps) {
  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* Watermark */}
      {studentName && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center z-0"
          aria-hidden
        >
          <span
            className="text-4xl font-display font-bold text-ink rotate-[-35deg] whitespace-nowrap select-none"
            style={{ opacity: 0.07 }}
          >
            {studentName}
          </span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Passage (left column if present) */}
        {passageText && (
          <div className="w-1/2 overflow-y-auto p-8 border-r border-hairline-light">
            <div
              className="text-sm leading-relaxed text-ink select-none"
              onContextMenu={(e) => e.preventDefault()}
            >
              {passageText}
            </div>
          </div>
        )}

        {/* Question + options (right column or full width) */}
        <div
          className={[
            'overflow-y-auto p-8 flex flex-col gap-6',
            passageText ? 'w-1/2' : 'flex-1',
          ].join(' ')}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div>
            <p className="text-xs text-mute-light font-medium mb-3">
              Câu {questionNumber}
            </p>
            <p
              className="text-base text-ink leading-relaxed select-none"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </div>

          <div className="space-y-3">
            {options.map((opt) => {
              const selected = selectedOptionId === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => onSelect(opt.id)}
                  className={[
                    'w-full flex items-start gap-3 px-4 py-3 rounded-card border-2 text-left transition-colors',
                    selected
                      ? 'border-primary bg-blue-50'
                      : 'border-hairline-light hover:border-ash-light bg-canvas-light',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mt-0.5 w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold',
                      selected
                        ? 'border-primary bg-primary text-white'
                        : 'border-ash-light text-mute-light',
                    ].join(' ')}
                  >
                    {opt.label}
                  </span>
                  <span className="text-sm text-ink leading-relaxed select-none">
                    {opt.content}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
