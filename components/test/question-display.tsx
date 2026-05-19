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
  totalQuestions: number
  content: string
  passageText?: string | null
  options: Option[]
  selectedOptionId: string | null
  answerText: string | null
  isMarkedForReview: boolean
  noteText: string
  highlights: Highlight[]
  strikethroughOptionIds: string[]
  onSelect: (optionId: string) => void
  onAnswerTextChange: (value: string) => void
  onToggleReview: () => void
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

function BluebookStripe() {
  return <div className="h-[3px] w-full bg-[repeating-linear-gradient(90deg,#9d4f16_0_34px,#f0dbc0_34px_68px,#3c9b44_68px_102px,#0b168e_102px_136px,#9d4f16_136px_170px)]" />
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4.5h10v15l-5-3.2-5 3.2z" />
    </svg>
  )
}

function Watermark({ studentName }: { studentName?: string }) {
  if (!studentName) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="grid h-[160%] w-[160%] -translate-x-[15%] -translate-y-[20%] rotate-[-35deg] grid-cols-4 gap-x-24 gap-y-20">
        {Array.from({ length: 28 }, (_, index) => (
          <span key={index} className="whitespace-nowrap text-[26px] font-bold text-black opacity-[0.045]">
            {studentName}
          </span>
        ))}
      </div>
    </div>
  )
}

function StudentProducedDirections() {
  return (
    <div className="mx-auto max-w-[760px] px-8 py-9 font-serif text-[#222]">
      <h2 className="mb-5 text-[20px] font-bold">Student-produced response directions</h2>
      <ul className="space-y-3.5 pl-6 text-[17px] leading-[1.38]">
        <li>If you find <strong>more than one correct answer</strong>, enter only one answer.</li>
        <li>You can enter up to 5 characters for a <strong>positive answer</strong> and up to 6 characters (including the negative sign) for a <strong>negative answer</strong>.</li>
        <li>If your answer is a <strong>fraction</strong> that doesn&apos;t fit in the provided space, enter the decimal equivalent.</li>
        <li>If your answer is a <strong>decimal</strong> that doesn&apos;t fit in the provided space, enter it by truncating or rounding at the fourth digit.</li>
        <li>If your answer is a <strong>mixed number</strong> (such as 3 1/2), enter it as an improper fraction (7/2) or its decimal equivalent (3.5).</li>
        <li>Don&apos;t enter <strong>symbols</strong> such as a percent sign, comma, or dollar sign.</li>
      </ul>

      <div className="mt-8 text-center text-[19px]">Examples</div>
      <table className="mx-auto mt-3 w-full max-w-[560px] border-collapse text-center text-[16px]">
        <thead>
          <tr>
            <th className="border border-black px-3 py-3 font-normal">Answer</th>
            <th className="border border-black px-3 py-3 font-normal">Acceptable ways to<br />enter answer</th>
            <th className="border border-black px-3 py-3 font-normal">Unacceptable: will<br />NOT receive credit</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black px-3 py-5 text-[20px]">3.5</td>
            <td className="border border-black px-3 py-4 font-mono text-[16px] leading-relaxed">
              <span className="rounded bg-[#eee] px-1">3.5</span><br />
              <span className="rounded bg-[#eee] px-1">3.50</span><br />
              <span className="rounded bg-[#eee] px-1">7/2</span>
            </td>
            <td className="border border-black px-3 py-4 font-mono text-[16px] leading-relaxed">
              <span className="rounded bg-[#eee] px-1">31/2</span><br />
              <span className="rounded bg-[#eee] px-1">3 1/2</span>
            </td>
          </tr>
          <tr>
            <td className="border border-black px-3 py-5 text-[20px]">2<br />/3</td>
            <td className="border border-black px-3 py-4 font-mono text-[16px] leading-relaxed">
              <span className="rounded bg-[#eee] px-1">2/3</span><br />
              <span className="rounded bg-[#eee] px-1">.6666</span><br />
              <span className="rounded bg-[#eee] px-1">.6667</span>
            </td>
            <td className="border border-black px-3 py-4 font-mono text-[16px] leading-relaxed">
              <span className="rounded bg-[#eee] px-1">0.66</span><br />
              <span className="rounded bg-[#eee] px-1">.66</span><br />
              <span className="rounded bg-[#eee] px-1">0.67</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, '').trim()
}

export function QuestionDisplay({
  questionId,
  questionNumber,
  totalQuestions,
  content,
  passageText,
  options,
  selectedOptionId,
  answerText,
  isMarkedForReview,
  noteText,
  highlights,
  strikethroughOptionIds,
  onSelect,
  onAnswerTextChange,
  onToggleReview,
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

  const isStudentProduced = options.length === 0
  const questionPanel = (
    <div
      className={[
        'relative z-10 w-full',
        isStudentProduced ? 'max-w-[760px]' : 'max-w-[760px]',
      ].join(' ')}
      onMouseUp={handleHighlightSelection}
    >
      <div className="bg-[#f1f2f3]">
        <div className="flex h-[38px] items-center">
          <div className="flex h-[38px] w-[42px] items-center justify-center bg-[#171717] text-[21px] font-bold text-white">
            {questionNumber}
          </div>
          <button
            type="button"
            onClick={onToggleReview}
            className="flex h-full items-center gap-2 px-4 text-[16px] font-medium text-[#222]"
          >
            <BookmarkIcon filled={isMarkedForReview} />
            Mark for Review
          </button>
        </div>
        <BluebookStripe />
      </div>

      <div ref={contentRef} className={isStudentProduced ? 'pt-7' : 'pt-8'}>
        <div className="font-serif text-[20px] leading-[1.36] text-[#242424]">
          {renderedQuestion}
        </div>

        {isStudentProduced ? (
          <div className="mt-6">
            <input
              id={`answer-${questionId}`}
              value={answerText ?? ''}
              onChange={(e) => onAnswerTextChange(e.target.value)}
              aria-label={`Answer for question ${questionNumber} of ${totalQuestions}`}
              className="h-[74px] w-[160px] rounded-[12px] border-2 border-black bg-white px-4 pb-2 pt-6 text-center text-[24px] font-semibold shadow-none outline-none focus:ring-4 focus:ring-[#354bc6]/20"
              style={{
                backgroundImage: 'linear-gradient(#222,#222)',
                backgroundSize: '126px 2px',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center 53px',
              }}
            />
            <div className="mt-11 font-serif text-[21px] font-bold text-[#222]">Answer Preview:</div>
            {answerText && <div className="mt-3 font-serif text-[23px] text-[#222]">{answerText}</div>}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {options.map((opt) => {
              const selected = selectedOptionId === opt.id
              const struck = strikethroughOptionIds.includes(opt.id)
              return (
                <div
                  key={opt.id}
                  className={[
                    'group flex min-h-[58px] items-center rounded-[8px] border-2 bg-white transition-colors',
                    selected ? 'border-[#263bba] bg-[#eef2ff]' : 'border-[#5c5c5c] hover:border-black',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(opt.id)}
                    className="flex min-h-[54px] flex-1 items-center gap-4 px-4 text-left"
                  >
                    <span
                      className={[
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[2px] text-[17px] font-bold',
                        selected
                          ? 'border-[#263bba] bg-[#263bba] text-white'
                          : 'border-[#666] text-[#555]',
                      ].join(' ')}
                    >
                      {opt.label}
                    </span>
                    <span
                      className={[
                        'font-serif text-[20px] leading-snug text-[#222]',
                        struck ? 'text-[#777] line-through' : '',
                      ].join(' ')}
                    >
                      {stripHtml(opt.content)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleStrikethrough(opt.id)}
                    className={[
                      'mr-3 flex h-8 w-8 items-center justify-center rounded border text-[14px] font-bold opacity-0 transition-opacity group-hover:opacity-100',
                      struck ? 'border-black bg-black text-white opacity-100' : 'border-[#777] bg-white text-[#333]',
                    ].join(' ')}
                    title="Eliminate answer"
                  >
                    ABC
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="relative flex flex-1 overflow-hidden bg-white">
      <Watermark studentName={studentName} />

      <div className="relative z-10 flex flex-1 overflow-hidden">
        {passageText && (
          <div className="w-1/2 overflow-y-auto border-r-4 border-[#7b7b7b] p-8">
            <div className="font-serif text-[18px] leading-relaxed text-[#222] select-text">
              {passageText}
            </div>
          </div>
        )}

        <div className={['relative flex-1 overflow-y-auto', passageText || isStudentProduced ? '' : 'flex justify-center'].join(' ')}>
          {isStudentProduced && !passageText ? (
            <div className="grid min-h-full grid-cols-[minmax(300px,0.9fr)_4px_minmax(360px,1.1fr)]">
              <div className="overflow-y-auto">
                <StudentProducedDirections />
              </div>
              <div className="relative bg-[#7b7b7b]">
                <div className="absolute left-1/2 top-1/2 flex h-10 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded bg-[#1a1a1a] text-white">
                  ◂▸
                </div>
              </div>
              <div className="overflow-y-auto px-10 py-12">
                {questionPanel}
              </div>
            </div>
          ) : (
            <div className={['min-h-full px-8 py-12', passageText ? 'max-w-none' : 'w-full max-w-[820px]'].join(' ')}>
              {questionPanel}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
