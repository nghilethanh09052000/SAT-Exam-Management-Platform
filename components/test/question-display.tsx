'use client'

import { useMemo, useRef } from 'react'

interface Option {
  id: string
  label: string
  content: string
}

interface Highlight {
  text: string
}

interface QuestionDisplayProps {
  questionId: string
  questionNumber: number
  content: string
  passageText?: string | null
  options: Option[]
  selectedOptionId: string | null
  answerText: string | null
  noteText: string
  highlights: Highlight[]
  strikethroughOptionIds: string[]
  onSelect: (optionId: string) => void
  onAnswerTextChange: (value: string) => void
  onNoteChange: (value: string) => void
  onAddHighlight: (text: string) => void
  onToggleStrikethrough: (optionId: string) => void
  studentName?: string
  showCalculator?: boolean
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderHighlightedText(content: string, highlights: Highlight[]) {
  if (highlights.length === 0) {
    return <span dangerouslySetInnerHTML={{ __html: content }} />
  }

  const terms = Array.from(
    new Set(highlights.map((h) => h.text.trim()).filter(Boolean))
  ).sort((a, b) => b.length - a.length)

  if (terms.length === 0) {
    return <span dangerouslySetInnerHTML={{ __html: content }} />
  }

  const textOnly = content.replace(/<[^>]+>/g, '')
  const regex = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi')
  const parts = textOnly.split(regex)

  return (
    <>
      {parts.map((part, index) =>
        terms.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
          <mark key={`${part}-${index}`} className="bg-yellow-200 px-0.5">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  )
}

export function QuestionDisplay({
  questionId,
  questionNumber,
  content,
  passageText,
  options,
  selectedOptionId,
  answerText,
  noteText,
  highlights,
  strikethroughOptionIds,
  onSelect,
  onAnswerTextChange,
  onNoteChange,
  onAddHighlight,
  onToggleStrikethrough,
  studentName,
  showCalculator = false,
}: QuestionDisplayProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const renderedQuestion = useMemo(
    () => renderHighlightedText(content, highlights),
    [content, highlights]
  )

  function handleHighlightSelection() {
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim()
    if (!selection || !selectedText || !contentRef.current) return
    if (!contentRef.current.contains(selection.anchorNode)) return
    onAddHighlight(selectedText)
    selection.removeAllRanges()
  }

  return (
    <div className="relative flex flex-1 overflow-hidden">
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
        {passageText && (
          <div className="w-1/2 overflow-y-auto p-8 border-r border-hairline-light">
            <div className="text-sm leading-relaxed text-ink select-text">
              {passageText}
            </div>
          </div>
        )}

        <div
          className={[
            'overflow-y-auto p-8 flex flex-col gap-6 bg-white',
            passageText ? 'w-1/2' : 'flex-1',
          ].join(' ')}
          onMouseUp={handleHighlightSelection}
        >
          <div ref={contentRef} className="max-w-3xl">
            <p className="text-xs text-mute-light font-medium mb-3">
              Câu {questionNumber}
            </p>
            <p className="text-base text-ink leading-relaxed select-text">
              {renderedQuestion}
            </p>
            <p className="mt-2 text-xs text-mute-light">
              Bôi đen văn bản để tô sáng
            </p>
          </div>

          {options.length > 0 ? (
            <div className="max-w-3xl space-y-3">
              {options.map((opt) => {
                const selected = selectedOptionId === opt.id
                const struck = strikethroughOptionIds.includes(opt.id)
                return (
                  <div
                    key={opt.id}
                    className={[
                      'flex items-start gap-3 rounded-card border-2 transition-colors',
                      selected
                        ? 'border-primary bg-blue-50'
                        : 'border-hairline-light bg-canvas-light',
                    ].join(' ')}
                  >
                    <button
                      onClick={() => onSelect(opt.id)}
                      className="flex flex-1 items-start gap-3 px-4 py-3 text-left"
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
                      <span
                        className={[
                          'text-sm text-ink leading-relaxed select-none',
                          struck ? 'line-through text-mute-light' : '',
                        ].join(' ')}
                      >
                        {opt.content}
                      </span>
                    </button>
                    <button
                      onClick={() => onToggleStrikethrough(opt.id)}
                      className={[
                        'm-2 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        struck
                          ? 'bg-ink text-white'
                          : 'bg-surface-soft text-mute-light hover:text-ink',
                      ].join(' ')}
                    >
                      Gạch
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="max-w-md space-y-2">
              <label className="text-sm font-medium text-ink" htmlFor={`answer-${questionId}`}>
                Câu trả lời
              </label>
              <input
                id={`answer-${questionId}`}
                value={answerText ?? ''}
                onChange={(e) => onAnswerTextChange(e.target.value)}
                className="h-12 w-full rounded-card border border-ash-light px-4 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Nhập câu trả lời của bạn"
              />
            </div>
          )}

          <div className="max-w-3xl rounded-card border border-hairline-light bg-surface-soft p-4">
            <label className="mb-2 block text-sm font-medium text-ink">
              Ghi chú
            </label>
            <textarea
              value={noteText}
              onChange={(e) => onNoteChange(e.target.value)}
              rows={3}
              placeholder="Ghi chú riêng cho câu hỏi này..."
              className="w-full resize-none rounded-card border border-ash-light bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {showCalculator && (
            <div className="max-w-3xl overflow-hidden rounded-card border border-hairline-light">
              <iframe
                title="Desmos Calculator"
                src="https://www.desmos.com/calculator"
                className="h-[420px] w-full"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
