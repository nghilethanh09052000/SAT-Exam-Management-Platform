'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { renderMathInHtml } from '@/lib/math-html'

interface Option {
  id: string
  label: string
  content: string
}

interface Highlight {
  text: string
  color?: string
  underline?: boolean
  note?: string
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
  onAddHighlight: (highlight: Highlight) => void
  onUpdateHighlight: (index: number, highlight: Highlight) => void
  onRemoveHighlight: (index: number) => void
  onToggleStrikethrough: (optionId: string) => void
  studentName?: string
  showCalculator?: boolean
  annotationsEnabled?: boolean
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeHighlightText(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function renderHighlightedText(
  content: string,
  highlights: Highlight[],
  onHighlightClick?: (highlight: Highlight, index: number, event: MouseEvent<HTMLElement>) => void
) {
  if (highlights.length === 0) {
    return <span dangerouslySetInnerHTML={{ __html: renderMathInHtml(content) }} />
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
      {parts.map((part, index) => {
        const highlightIndex = highlights.findIndex((term) => normalizeHighlightText(term.text) === normalizeHighlightText(part))
        const highlight = highlightIndex >= 0 ? highlights[highlightIndex] : undefined
        if (!highlight) return <span key={`${part}-${index}`}>{part}</span>

        return (
          <mark
            key={`${part}-${index}`}
            onMouseEnter={() => {
              if (!onHighlightClick) return
              document.documentElement.classList.add('bluebook-pencil-cursor')
              document.body.classList.add('bluebook-pencil-cursor')
            }}
            onMouseLeave={() => {
              document.documentElement.classList.remove('bluebook-pencil-cursor')
              document.body.classList.remove('bluebook-pencil-cursor')
            }}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onHighlightClick?.(highlight, highlightIndex, event)
            }}
            className={[
              onHighlightClick ? 'bluebook-highlight cursor-pointer px-0.5 text-inherit' : 'px-0.5 text-inherit',
            ].join(' ')}
            style={{
              backgroundColor: highlight.color ?? '#fff47a',
              textDecoration: highlight.underline ? 'underline' : 'none',
              textDecorationColor: '#111',
              textDecorationThickness: '2px',
              textUnderlineOffset: '4px',
            }}
          >
            {part}
          </mark>
        )
      })}
    </>
  )
}

function BluebookStripe() {
  return <div className="h-0 border-b-2 border-dashed border-black" />
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4.5h10v15l-5-3.2-5 3.2z" />
    </svg>
  )
}

function AnnotationIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19.5 5.5 15 16.8 3.7a2.1 2.1 0 0 1 3 3L8.5 18z" />
      <path d="M13.8 6.7 17.3 10.2" />
      <path d="M12 20h8" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  )
}

function StrikeButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${active ? 'Restore' : 'Eliminate'} option ${label}`}
      className={[
        'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-white text-[16px] font-bold text-[#4a4a4a]',
        active ? 'border-[#555]' : 'border-transparent hover:border-[#777]',
      ].join(' ')}
    >
      <span className="relative z-10">{label}</span>
      <span className="absolute left-1/2 top-1/2 h-[2px] w-8 -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] bg-[#222]" />
    </button>
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
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function splitReadingWritingContent(content: string) {
  const text = stripHtml(content)
  const prompts = [
    'Which choice completes the text with the most logical and precise word or phrase?',
    'Which choice best states the main purpose of the text?',
    'Which choice best describes the function of the underlined sentence in the text as a whole?',
    'Which choice most logically completes the text?',
    'Which choice best describes data from the graph that support',
    'Which choice best combines the sentences to create the most logical comparison?',
  ]

  const rawLower = content.toLowerCase()
  const matchedRawPrompt = prompts.find((prompt) => rawLower.includes(prompt.toLowerCase()))
  if (matchedRawPrompt) {
    const index = rawLower.indexOf(matchedRawPrompt.toLowerCase())
    return {
      stimulus: content.slice(0, index).trim(),
      prompt: content.slice(index).trim(),
    }
  }

  const matchedPrompt = prompts.find((prompt) => text.toLowerCase().includes(prompt.toLowerCase()))
  if (matchedPrompt) {
    const index = text.toLowerCase().indexOf(matchedPrompt.toLowerCase())
    return {
      stimulus: text.slice(0, index).trim(),
      prompt: text.slice(index).trim(),
    }
  }

  const genericPrompt = text.includes('_____') || text.includes('____') || text.includes('—')
    ? 'Which choice completes the text with the most logical and precise word or phrase?'
    : 'Which choice best answers the question based on the text?'

  return {
    stimulus: content,
    prompt: genericPrompt,
  }
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
  onUpdateHighlight,
  onRemoveHighlight,
  onToggleStrikethrough,
  studentName,
  showCalculator = false,
  annotationsEnabled = true,
}: QuestionDisplayProps) {
  const t = useTranslations('student.test')
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [activeNoteText, setActiveNoteText] = useState<string | null>(null)
  const [collapsedNoteText, setCollapsedNoteText] = useState<string | null>(null)
  const [splitPercent, setSplitPercent] = useState(52)
  const [selectionMenu, setSelectionMenu] = useState<{
    text: string
    x: number
    y: number
    highlightIndex?: number
  } | null>(null)

  useEffect(() => {
    if (annotationsEnabled) return
    setSelectionMenu(null)
    setActiveNoteText(null)
    document.documentElement.classList.remove('bluebook-pencil-cursor')
    document.body.classList.remove('bluebook-pencil-cursor')
  }, [annotationsEnabled])

  function handleHighlightClick(highlight: Highlight, index: number, event: MouseEvent<HTMLElement>) {
    if (!annotationsEnabled) return
    if (highlight.note !== undefined) {
      setActiveNoteText((current) => current === highlight.text ? null : highlight.text)
    }

    if (!surfaceRef.current) return
    const targetRect = event.currentTarget.getBoundingClientRect()
    const surfaceRect = surfaceRef.current.getBoundingClientRect()
    setSelectionMenu({
      text: highlight.text,
      highlightIndex: index,
      x: Math.min(
        Math.max(targetRect.left - surfaceRect.left, 16),
        Math.max(surfaceRect.width - 320, 16)
      ),
      y: Math.max(targetRect.top - surfaceRect.top - 56, 16),
    })
  }

  function beginResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    const surface = surfaceRef.current
    if (!surface) return

    const rect = surface.getBoundingClientRect()
    const handleMove = (moveEvent: globalThis.MouseEvent) => {
      const next = ((moveEvent.clientX - rect.left) / rect.width) * 100
      setSplitPercent(Math.min(72, Math.max(34, next)))
    }
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = ''
    }

    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }

  const renderedQuestion = useMemo(
    () => renderHighlightedText(content, highlights, annotationsEnabled ? handleHighlightClick : undefined),
    [content, highlights, annotationsEnabled]
  )
  const isStudentProduced = options.length === 0
  const useReadingWritingSplit = !showCalculator && !isStudentProduced && options.length > 0
  const readingWritingParts = useMemo(
    () => splitReadingWritingContent(content),
    [content]
  )
  const renderedSplitStimulus = useMemo(
    () => renderHighlightedText(readingWritingParts.stimulus, highlights, annotationsEnabled ? handleHighlightClick : undefined),
    [readingWritingParts.stimulus, highlights, annotationsEnabled]
  )
  const renderedSplitPrompt = useMemo(
    () => renderHighlightedText(readingWritingParts.prompt, highlights, annotationsEnabled ? handleHighlightClick : undefined),
    [readingWritingParts.prompt, highlights, annotationsEnabled]
  )

  function handleSelection(event: MouseEvent<HTMLDivElement>) {
    if (!annotationsEnabled) return
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim() ?? ''
    if (!selection || selection.rangeCount === 0 || selectedText.length < 2 || !surfaceRef.current) {
      setSelectionMenu(null)
      return
    }

    const range = selection.getRangeAt(0)
    const rangeRect = range.getBoundingClientRect()
    const surfaceRect = surfaceRef.current.getBoundingClientRect()
    setSelectionMenu({
      text: selectedText.slice(0, 180),
      x: Math.min(
        Math.max(rangeRect.left - surfaceRect.left, 16),
        Math.max(surfaceRect.width - 260, 16)
      ),
      y: Math.max(rangeRect.top - surfaceRect.top - 56, 16),
    })
  }

  function addHighlightFromSelection(style: Pick<Highlight, 'color' | 'underline' | 'note'> = {}) {
    if (!selectionMenu) return
    if (selectionMenu.highlightIndex !== undefined) {
      const existing = highlights[selectionMenu.highlightIndex]
      if (existing) {
        onUpdateHighlight(selectionMenu.highlightIndex, {
          ...existing,
          color: style.color ?? existing.color,
          underline: style.underline ?? existing.underline,
          note: style.note ?? existing.note,
        })
        window.getSelection()?.removeAllRanges()
        setSelectionMenu(null)
        return
      }
    }

    onAddHighlight({
      text: selectionMenu.text,
      color: style.color,
      underline: style.underline,
      note: style.note,
    })
    window.getSelection()?.removeAllRanges()
    setSelectionMenu(null)
  }

  function addNoteFromSelection() {
    if (!selectionMenu) return
    if (selectionMenu.highlightIndex !== undefined) {
      const existing = highlights[selectionMenu.highlightIndex]
      if (existing) {
        onUpdateHighlight(selectionMenu.highlightIndex, {
          ...existing,
          color: '#f09add',
          note: existing.note ?? '',
        })
        setActiveNoteText(existing.text)
        setCollapsedNoteText(null)
        window.getSelection()?.removeAllRanges()
        setSelectionMenu(null)
        return
      }
    }

    onAddHighlight({
      text: selectionMenu.text,
      color: '#f09add',
      note: '',
    })
    setActiveNoteText(selectionMenu.text)
    setCollapsedNoteText(null)
    window.getSelection()?.removeAllRanges()
    setSelectionMenu(null)
  }

  function hideNoteRail() {
    setCollapsedNoteText(activeNoteText)
    setActiveNoteText(null)
  }

  function restoreNoteRail() {
    setActiveNoteText(collapsedNoteText)
    setCollapsedNoteText(null)
  }

  function deleteSelectedHighlight() {
    if (!selectionMenu) return
    const selected = normalizeHighlightText(selectionMenu.text)
    const index = selectionMenu.highlightIndex ?? highlights.findIndex((highlight) => {
      const candidate = normalizeHighlightText(highlight.text)
      return candidate === selected || candidate.includes(selected) || selected.includes(candidate)
    })
    if (index >= 0) onRemoveHighlight(index)
    if (activeNoteText && normalizeHighlightText(activeNoteText) === selected) {
      setActiveNoteText(null)
    }
    if (collapsedNoteText && normalizeHighlightText(collapsedNoteText) === selected) {
      setCollapsedNoteText(null)
    }
    window.getSelection()?.removeAllRanges()
    setSelectionMenu(null)
  }

  const visibleNoteEntries = highlights
    .map((highlight, index) => ({ highlight, index }))
    .filter(({ highlight }) => highlight.note !== undefined && highlight.text === activeNoteText)

  const questionPanel = (
    <div
      className={[
        'relative z-10 w-full',
        isStudentProduced ? 'max-w-[760px]' : 'max-w-[760px]',
      ].join(' ')}
    >
      <div className="bg-[#f4f5f7]">
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
            {t('markForReview')}
          </button>
          {showCalculator && (
            <span className="ml-auto mr-2 flex h-8 w-8 items-center justify-center rounded-[5px] bg-[#3157d4] text-white shadow-sm">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 17 9 12l3 3 6-8" />
                <path d="M4 7h5" />
                <path d="M15 17h5" />
                <path d="M16 14l3 3m0-3-3 3" />
              </svg>
            </span>
          )}
        </div>
        <BluebookStripe />
      </div>

      <div className={isStudentProduced ? 'pt-7' : 'pt-8'}>
        {!useReadingWritingSplit && (
          <div className="bluebook-selectable font-serif text-[20px] leading-[1.36] text-[#242424] [&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full">
            {renderedQuestion}
          </div>
        )}
        {useReadingWritingSplit && (
          <div className="bluebook-selectable font-serif text-[20px] leading-[1.36] text-[#242424]">
            {renderedSplitPrompt}
          </div>
        )}

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
            <div className="mt-11 font-serif text-[21px] font-bold text-[#222]">{t('answerPreview')}:</div>
            {answerText && <div className="mt-3 font-serif text-[23px] text-[#222]">{answerText}</div>}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {options.map((opt) => {
              const selected = selectedOptionId === opt.id
              const struck = strikethroughOptionIds.includes(opt.id)
              return (
                <div key={opt.id} className="grid grid-cols-[1fr_42px] items-center gap-3">
                  <div
                    className={[
                      'group flex min-h-[50px] items-center rounded-[8px] border bg-white transition-colors',
                      selected ? 'border-[#3157d4] ring-1 ring-[#3157d4]' : 'border-[#b7b7b7] hover:border-[#555]',
                      struck ? 'opacity-55' : '',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(opt.id)}
                      className="flex min-h-[48px] flex-1 items-center gap-4 px-4 text-left"
                    >
                      <span
                        className={[
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[2px] text-[17px] font-bold',
                          selected
                            ? 'border-[#3157d4] bg-[#3157d4] text-white'
                            : 'border-[#777] text-[#555]',
                        ].join(' ')}
                      >
                        {opt.label}
                      </span>
                      <span
                        className={['font-serif text-[20px] leading-snug text-[#222]', struck ? 'line-through' : ''].join(' ')}
                        dangerouslySetInnerHTML={{ __html: renderMathInHtml(opt.content) }}
                      />
                    </button>
                  </div>
                  <StrikeButton
                    label={opt.label}
                    active={struck}
                    onClick={() => onToggleStrikethrough(opt.id)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div
      ref={surfaceRef}
      className={[
        'relative flex flex-1 overflow-hidden bg-white',
        annotationsEnabled ? 'bluebook-annotations-on' : '',
      ].join(' ')}
      onMouseUp={handleSelection}
    >
      <Watermark studentName={studentName} />
      {selectionMenu && (
        <div
          className="absolute z-40 flex items-center gap-2 rounded-[6px] border border-[#bdbdbd] bg-white px-2 py-2 shadow-xl"
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {[
            ['#fff7c7', 'Cream highlight'],
            ['#e6f4ff', 'Blue highlight'],
            ['#f6d9ef', 'Pink highlight'],
          ].map(([color, label]) => (
            <button
              key={color}
              type="button"
              onClick={() => addHighlightFromSelection({ color })}
              className="h-10 w-10 rounded-full border-2 border-[#777] shadow-sm"
              style={{ backgroundColor: color }}
              aria-label={label}
            />
          ))}
          <span className="h-8 w-px bg-[#d0d0d0]" />
          <button
            type="button"
            onClick={() => addHighlightFromSelection({ underline: true })}
            className="flex h-10 w-10 items-center justify-center text-[20px] font-bold underline decoration-2 underline-offset-4"
            aria-label="Underline selection"
          >
            U
          </button>
          <button
            type="button"
            onClick={deleteSelectedHighlight}
            className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#777] text-[#222]"
            aria-label="Delete highlight"
          >
            <TrashIcon />
          </button>
          <span className="h-8 w-px bg-[#d0d0d0]" />
          <button
            type="button"
            onClick={addNoteFromSelection}
            className="flex h-10 w-10 items-center justify-center rounded-[6px] border-2 border-[#777] bg-[#f6d9ef] text-[#222]"
            aria-label="Add note to selection"
          >
            <AnnotationIcon />
          </button>
        </div>
      )}

      <div className="relative z-10 flex flex-1 overflow-hidden">
        {useReadingWritingSplit && (
          <div className="flex min-h-full flex-1 overflow-hidden">
            <div
              className="grid min-w-[34%] overflow-hidden"
              style={{
                width: `${splitPercent}%`,
                gridTemplateColumns: activeNoteText
                  ? 'minmax(230px,1fr) minmax(190px,240px)'
                  : collapsedNoteText
                    ? 'minmax(230px,1fr) 34px'
                    : 'minmax(230px,1fr) 0px',
              }}
            >
              <div className="overflow-y-auto px-10 py-12">
                <div className="bluebook-selectable font-serif text-[20px] leading-[1.32] text-[#242424] [&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full">
                  {renderedSplitStimulus}
                </div>
              </div>
              {activeNoteText && (
                <div className="relative overflow-y-auto border-l border-[#d8d8d8] bg-[#f2f2f2] px-2 py-12">
                  <button
                    type="button"
                    onClick={hideNoteRail}
                    className="absolute -left-px top-1/2 z-20 flex h-11 w-10 -translate-y-1/2 items-center justify-center rounded-r-full border border-l-0 border-[#cfcfcf] bg-[#7a7a7a] text-3xl font-light leading-none text-white shadow-[2px_0_5px_rgba(0,0,0,0.18)] hover:bg-[#676767]"
                    aria-label="Hide note panel"
                  >
                    ›
                  </button>
                  {visibleNoteEntries.map(({ highlight, index }) => (
                    <div key={`${highlight.text}-${index}`} className="mb-4 overflow-hidden rounded-[12px] border-2 border-[#232323] bg-white shadow-sm">
                      <div className="flex min-h-12 items-center gap-2 border-b border-[#222] bg-[#f09add] px-3 py-2">
                        <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-[#26223a]">{highlight.text}</p>
                        <button
                          type="button"
                          onClick={() => {
                            onRemoveHighlight(index)
                            setActiveNoteText(null)
                          }}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#222]"
                          aria-label="Delete note"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      <textarea
                        value={highlight.note ?? ''}
                        onChange={(event) => onUpdateHighlight(index, { ...highlight, note: event.target.value })}
                        placeholder={t('noteSaved')}
                        className="min-h-[86px] w-full resize-none px-3 py-3 text-[14px] leading-snug text-[#222] outline-none"
                      />
                    </div>
                  ))}
                </div>
              )}
              {!activeNoteText && collapsedNoteText && (
                <div className="relative border-l border-[#d8d8d8] bg-[#f2f2f2]">
                  <button
                    type="button"
                    onClick={restoreNoteRail}
                    className="absolute right-0 top-1/2 z-20 flex h-11 w-10 -translate-y-1/2 translate-x-1 items-center justify-center rounded-l-full border border-r-0 border-[#cfcfcf] bg-[#7a7a7a] text-3xl font-light leading-none text-white shadow-[-2px_0_5px_rgba(0,0,0,0.18)] hover:bg-[#676767]"
                    aria-label="Show note panel"
                  >
                    ‹
                  </button>
                </div>
              )}
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={beginResize}
              className="relative w-[5px] shrink-0 cursor-col-resize bg-[#878787]"
            >
              <div className="absolute left-1/2 top-1/2 flex h-11 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded bg-[#1d1d1d] text-[13px] font-bold text-white shadow">
                ◂▸
              </div>
            </div>
            <div className="min-w-[28%] flex-1 overflow-y-auto px-12 py-14">
              {questionPanel}
            </div>
          </div>
        )}

        {!useReadingWritingSplit && passageText && (
          <div className="grid w-1/2 grid-cols-[minmax(220px,1fr)_190px] overflow-hidden border-r-4 border-[#777]">
            <div className="overflow-y-auto p-8">
              <div className="bluebook-selectable font-serif text-[18px] leading-relaxed text-[#222]">
                {renderHighlightedText(passageText, highlights, annotationsEnabled ? handleHighlightClick : undefined)}
              </div>
            </div>
            <div className="relative overflow-y-auto border-l border-[#dedede] bg-[#f4f4f4] px-2 py-4">
              {activeNoteText && (
                <button
                  type="button"
                  onClick={hideNoteRail}
                  className="absolute -left-px top-1/2 z-20 flex h-11 w-10 -translate-y-1/2 items-center justify-center rounded-r-full border border-l-0 border-[#cfcfcf] bg-[#7a7a7a] text-3xl font-light leading-none text-white shadow-[2px_0_5px_rgba(0,0,0,0.18)] hover:bg-[#676767]"
                  aria-label="Hide note panel"
                >
                  ›
                </button>
              )}
              {!activeNoteText && collapsedNoteText && (
                <button
                  type="button"
                  onClick={restoreNoteRail}
                  className="absolute -left-px top-1/2 z-20 flex h-11 w-10 -translate-y-1/2 items-center justify-center rounded-r-full border border-l-0 border-[#cfcfcf] bg-[#7a7a7a] text-3xl font-light leading-none text-white shadow-[2px_0_5px_rgba(0,0,0,0.18)] hover:bg-[#676767]"
                  aria-label="Show note panel"
                >
                  ‹
                </button>
              )}
              {visibleNoteEntries.map(({ highlight, index }) => (
                  <div key={`${highlight.text}-${index}`} className="mb-4 overflow-hidden rounded-[12px] border-2 border-[#232323] bg-white shadow-sm">
                    <div className="flex min-h-12 items-center gap-2 border-b border-[#222] bg-[#f09add] px-3 py-2">
                      <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-[#26223a]">{highlight.text}</p>
                      <button
                        type="button"
                        onClick={() => {
                          onRemoveHighlight(index)
                          setActiveNoteText(null)
                        }}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#222]"
                        aria-label="Delete note"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <textarea
                      value={highlight.note ?? ''}
                      onChange={(event) => onUpdateHighlight(index, { ...highlight, note: event.target.value })}
                      placeholder={t('noteSaved')}
                      className="min-h-[86px] w-full resize-none px-3 py-3 text-[14px] leading-snug text-[#222] outline-none"
                    />
                  </div>
              ))}
              {(noteText || highlights.length > 0) && (
                <textarea
                  value={noteText}
                  onChange={(event) => onNoteChange(event.target.value)}
                  placeholder="Add a note"
                  className="min-h-[92px] w-full resize-none rounded-[4px] border border-[#cfcfcf] bg-white px-3 py-2 text-[12px] leading-snug outline-none focus:border-[#3157d4]"
                />
              )}
            </div>
          </div>
        )}

        {!useReadingWritingSplit && (
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
        )}
      </div>
    </div>
  )
}
