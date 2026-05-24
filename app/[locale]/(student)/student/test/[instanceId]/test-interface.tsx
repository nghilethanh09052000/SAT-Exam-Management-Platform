'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { TestLayout } from '@/components/test/test-layout'
import { QuestionDisplay } from '@/components/test/question-display'
import { NavPanel } from '@/components/test/nav-panel'
import { Timer } from '@/components/test/timer'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

interface Option {
  id: string
  label: string
  content: string
  order: number
}

interface Question {
  assignmentQuestionId: string
  questionId: string
  type: string
  content: string
  module: string
  options: Option[]
}

interface HighlightState {
  text: string
  color?: string
  underline?: boolean
  note?: string
}

interface AnswerState {
  selectedOptionId: string | null
  answerText: string | null
  isMarkedForReview: boolean
  highlights: HighlightState[]
  noteText: string
  strikethroughOptionIds: string[]
  timeSpentSeconds: number
}

interface TestInterfaceProps {
  submissionId: string
  instanceId: string
  assignmentTitle: string
  questions: Question[]
  isTimed: boolean
  timeLimitSeconds: number | null
  deadline: string
  startedAt: string
  studentName: string
  initialAnswers: Record<string, AnswerState>
  initialCurrentQuestionId: string | null
  initialCurrentModule: string | null
  progressEndpoint?: string
  answerEndpoint?: string
  submitEndpoint?: string
  exitHref?: string
  resultsHref?: string
}

const emptyAnswer = (): AnswerState => ({
  selectedOptionId: null,
  answerText: null,
  isMarkedForReview: false,
  highlights: [],
  noteText: '',
  strikethroughOptionIds: [],
  timeSpentSeconds: 0,
})

function sectionTitle(moduleName: string, moduleIndex: number) {
  const normalized = moduleName.toLowerCase()
  const subject = normalized.includes('math')
    ? 'Math'
    : normalized.includes('reading') || normalized.includes('writing')
      ? 'Reading and Writing'
      : moduleName

  return `Section ${moduleIndex + 1}: ${subject}`
}

function looksLikeMathQuestion(question: Question | undefined, moduleName: string) {
  if (!question) return false
  const source = `${moduleName} ${question.content}`.toLowerCase()
  return (
    source.includes('math') ||
    /(^|[^a-z])(x|y)\s*=/.test(source) ||
    /\b(equation|function|graph|vertex|slope|parabola|triangle|circle|radius|angle|integer|probability|mean|median)\b/.test(source) ||
    /[π√∑≤≥≈]|(\d+\s*[+\-*/^]\s*\d+)|([a-z]\s*\^\s*\d+)/i.test(question.content)
  )
}

function ExamTool({
  icon,
  label,
  onClick,
  active = false,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex min-w-12 flex-col items-center justify-center gap-0.5 border-b-2 px-1 pb-1 text-[12px] font-semibold transition-colors hover:text-[#2f43c9]',
        active
          ? 'border-black text-black'
          : 'border-transparent text-[#1a1a1a]',
      ].join(' ')}
      aria-pressed={active}
    >
      <span className="flex h-5 items-center justify-center leading-none">{icon}</span>
      <span className="text-[12px]">{label}</span>
    </button>
  )
}

function TopStripe() {
  return <div className="h-0 border-b-2 border-dashed border-black" />
}

function PracticeBanner() {
  return (
    <div className="mx-10 h-9 rounded-b-[16px] bg-[#1d2877] text-center text-[13px] font-bold leading-9 text-white">
      THIS IS A PRACTICE TEST
    </div>
  )
}

function SaveIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 20h14V7.5L15.5 4H5z" />
      <path d="M8 20v-7h8v7" />
      <path d="M8 4v5h7" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a8 8 0 0 0 .1-1.4l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-1.2-.7L15.6 6h-4l-.4 2.9a7.4 7.4 0 0 0-1.2.7l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 .1 1.4l-2 1.5 2 3.5 2.4-1c.4.3.8.5 1.2.7l.4 2.9h4l.4-2.9c.4-.2.8-.4 1.2-.7l2.4 1 2-3.5z" />
    </svg>
  )
}

function NotesIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19.5 5.5 15 16.8 3.7a2.1 2.1 0 0 1 3 3L8.5 18z" />
      <path d="M13.8 6.7 17.3 10.2" />
      <path d="M12 20h8" />
    </svg>
  )
}

function MoreIcon() {
  return <span className="text-[25px] leading-4">⋮</span>
}

function BookmarkMarker() {
  return <span className="inline-block h-6 w-4 bg-[#c43355] [clip-path:polygon(0_0,100%_0,100%_100%,50%_72%,0_100%)]" />
}

function ToolPanel({
  title,
  onClose,
  children,
  align = 'left',
  className = '',
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <div
      className={[
        'absolute top-[98px] z-40 flex max-h-[calc(100%-190px)] flex-col overflow-hidden rounded-[6px] border-2 border-[#222] bg-white shadow-2xl',
        align === 'left' ? 'left-5' : 'right-5',
        className,
      ].join(' ')}
    >
      <div className="flex h-[58px] shrink-0 items-center justify-between bg-[#1b1b1b] px-5 text-white">
        <h2 className="text-[22px] font-bold">{title}</h2>
        <div className="flex items-center gap-8">
          <span className="grid grid-cols-3 gap-1 opacity-70" aria-hidden>
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} className="h-1.5 w-1.5 rounded-full bg-white" />
            ))}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-4xl font-light leading-none text-white/90 hover:text-white"
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}

function CalculatorPanel({ onClose }: { onClose: () => void }) {
  return (
    <ToolPanel title="Calculator" onClose={onClose} className="h-[560px] w-[min(680px,calc(100%-2.5rem))]">
      <div className="flex h-14 shrink-0 items-center gap-5 bg-[#2f7d45] px-4 text-white">
        <span className="text-3xl font-bold tracking-tight">desmos</span>
        <span className="h-8 w-px bg-white/35" />
        <span className="text-xl font-medium">Graphing Calculator</span>
        <span className="h-8 w-px bg-white/35" />
        <span className="text-lg font-medium">College Board Version</span>
      </div>
      <iframe
        title="Desmos Calculator"
        src="https://www.desmos.com/calculator"
        className="min-h-0 flex-1 bg-white"
      />
    </ToolPanel>
  )
}

function FormulaDiagram({ label, formula }: { label: string; formula: string }) {
  return (
    <div className="flex min-h-[128px] flex-col items-center justify-center gap-3 rounded-[4px] bg-white p-3 text-center">
      <div className="flex h-16 w-28 items-center justify-center text-[#111]">
        {label === 'circle' && (
          <div className="relative h-16 w-16 rounded-full border-2 border-black">
            <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black" />
            <span className="absolute left-1/2 top-1/2 h-px w-7 bg-black" />
            <span className="absolute left-[58%] top-[37%] font-serif text-lg">r</span>
          </div>
        )}
        {label === 'rectangle' && <div className="h-12 w-24 border-2 border-black" />}
        {label === 'triangle' && <div className="h-0 w-0 border-b-[64px] border-l-[46px] border-r-[46px] border-b-white border-l-transparent border-r-transparent outline outline-2 outline-black" />}
        {label === 'right' && (
          <div className="relative h-16 w-24">
            <div className="absolute bottom-0 left-0 h-0 w-0 border-b-[64px] border-l-[84px] border-b-white border-l-transparent outline outline-2 outline-black" />
            <span className="absolute bottom-1 left-1 h-4 w-4 border-l-2 border-t-2 border-black" />
          </div>
        )}
      </div>
      <p className="font-serif text-[22px] italic">{formula}</p>
    </div>
  )
}

function ReferencePanel({ onClose }: { onClose: () => void }) {
  return (
    <ToolPanel title="Reference" onClose={onClose} align="right" className="bottom-[92px] w-[min(520px,calc(100%-2.5rem))]">
      <div className="overflow-y-auto p-7 font-serif">
        <div className="grid grid-cols-2 gap-x-8 gap-y-7">
          <FormulaDiagram label="circle" formula="A = πr² · C = 2πr" />
          <FormulaDiagram label="rectangle" formula="A = ℓw" />
          <FormulaDiagram label="triangle" formula="A = 1/2 bh" />
          <FormulaDiagram label="right" formula="c² = a² + b²" />
        </div>
        <h3 className="mt-8 text-center text-[26px] font-bold">Special Right Triangles</h3>
        <div className="mt-5 grid grid-cols-2 gap-7 text-center">
          <div className="rounded-lg border border-[#ddd] p-4">
            <p className="font-serif text-[22px]">30° - 60° - 90°</p>
            <p className="mt-2 font-serif text-[20px]">x, x√3, 2x</p>
          </div>
          <div className="rounded-lg border border-[#ddd] p-4">
            <p className="font-serif text-[22px]">45° - 45° - 90°</p>
            <p className="mt-2 font-serif text-[20px]">s, s, s√2</p>
          </div>
          <div className="rounded-lg border border-[#ddd] p-4">
            <p className="font-serif text-[22px]">Rectangular Prism</p>
            <p className="mt-2 font-serif text-[20px]">V = ℓwh</p>
          </div>
          <div className="rounded-lg border border-[#ddd] p-4">
            <p className="font-serif text-[22px]">Cylinder</p>
            <p className="mt-2 font-serif text-[20px]">V = πr²h</p>
          </div>
        </div>
      </div>
    </ToolPanel>
  )
}

function CheckWorkScreen({
  sectionTitle,
  totalQuestions,
  currentIndex,
  answeredIndices,
  flaggedIndices,
  onNavigate,
}: {
  sectionTitle: string
  totalQuestions: number
  currentIndex: number
  answeredIndices: Set<number>
  flaggedIndices: Set<number>
  onNavigate: (index: number) => void
}) {
  return (
    <div className="flex flex-1 overflow-y-auto bg-white px-8 py-12">
      <div className="mx-auto w-full max-w-[1210px]">
        <h1 className="text-center text-[52px] font-normal leading-tight text-[#222]">Check Your Work</h1>
        <div className="mx-auto mt-12 max-w-[940px] space-y-5 text-[26px] leading-snug text-[#111]">
          <p>On test day, you won&apos;t be able to move on to the next module until time expires.</p>
          <p>For these practice questions, you can click <strong>Next</strong> when you&apos;re ready to move on.</p>
        </div>

        <div className="mx-auto mt-10 max-w-[1210px] rounded-[14px] bg-white px-12 py-12 shadow-[0_8px_36px_rgba(0,0,0,0.09)]">
          <div className="flex flex-wrap items-center justify-between gap-6 border-b border-[#bcbcbc] pb-9">
            <h2 className="text-[30px] font-bold leading-tight text-[#111]">{sectionTitle} Questions</h2>
            <div className="flex items-center gap-8 text-[24px] text-[#111]">
              <span className="flex items-center gap-3">
                <span className="h-6 w-6 border border-dashed border-black" />
                Unanswered
              </span>
              <span className="flex items-center gap-3">
                <BookmarkMarker />
                For Review
              </span>
            </div>
          </div>

          <div className="mt-12 grid grid-cols-10 gap-x-12 gap-y-12">
            {Array.from({ length: totalQuestions }, (_, index) => {
              const answered = answeredIndices.has(index)
              const flagged = flaggedIndices.has(index)
              const current = currentIndex === index
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onNavigate(index)}
                  className={[
                    'relative flex h-16 w-16 items-center justify-center text-[38px] font-bold text-[#3857c9]',
                    answered ? 'bg-[#3857c9] text-white' : 'border border-dashed border-black bg-white',
                    current ? 'ring-2 ring-black ring-offset-4' : '',
                  ].join(' ')}
                  aria-label={`Go to question ${index + 1}`}
                >
                  {index + 1}
                  {flagged && <span className="absolute -right-2 -top-3"><BookmarkMarker /></span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export function TestInterface({
  submissionId,
  instanceId,
  assignmentTitle,
  questions,
  isTimed,
  timeLimitSeconds,
  deadline,
  startedAt,
  studentName,
  initialAnswers,
  initialCurrentQuestionId,
  initialCurrentModule,
  progressEndpoint,
  answerEndpoint = '/api/submission-answers',
  submitEndpoint,
  exitHref,
  resultsHref,
}: TestInterfaceProps) {
  const router = useRouter()
  const locale = useLocale()
  const modules = useMemo(
    () => Array.from(new Set(questions.map((q) => q.module || 'Bài thi'))),
    [questions]
  )
  const initialModuleIndex = Math.max(
    0,
    initialCurrentModule ? modules.indexOf(initialCurrentModule) : 0
  )
  const initialQuestionIndex = Math.max(
    0,
    initialCurrentQuestionId
      ? questions.findIndex((q) => q.questionId === initialCurrentQuestionId)
      : questions.findIndex((q) => (q.module || 'Bài thi') === modules[initialModuleIndex])
  )

  const [currentModuleIndex, setCurrentModuleIndex] = useState(initialModuleIndex)
  const [currentIndex, setCurrentIndex] = useState(initialQuestionIndex)
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(initialAnswers)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [showModuleModal, setShowModuleModal] = useState(false)
  const [showCheckWork, setShowCheckWork] = useState(false)
  const [showNavPanel, setShowNavPanel] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [showReference, setShowReference] = useState(false)
  const [showHighlightsNotes, setShowHighlightsNotes] = useState(true)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [reportText, setReportText] = useState('')
  const saveTimeout = useRef<NodeJS.Timeout | null>(null)
  const progressTimeout = useRef<NodeJS.Timeout | null>(null)
  const questionEnteredAt = useRef<number>(Date.now())
  // Set to true once submit is called — stops all subsequent auto-saves and
  // progress PATCHes so the RLS policy on submission_answers (which requires
  // status = 'in_progress') never receives a request after the status flips
  // to 'grading'. Without this, the debounced 400 ms save queued by
  // captureCurrentQuestionTime() fires after the submit, triggering 403.
  const hasSubmittedRef = useRef(false)

  const currentModule = modules[currentModuleIndex]
  const moduleQuestionIndexes = questions
    .map((q, index) => ((q.module || 'Bài thi') === currentModule ? index : -1))
    .filter((index) => index !== -1)
  const currentModulePosition = Math.max(0, moduleQuestionIndexes.indexOf(currentIndex))
  const currentQuestion = questions[currentIndex]
  const currentAnswer = currentQuestion ? answers[currentQuestion.questionId] ?? emptyAnswer() : emptyAnswer()
  const isLastModule = currentModuleIndex === modules.length - 1
  const isLastQuestionInModule = currentModulePosition === moduleQuestionIndexes.length - 1
  const isMathModule = looksLikeMathQuestion(currentQuestion, currentModule)
  const currentSectionTitle = sectionTitle(currentModule, currentModuleIndex)

  useEffect(() => {
    const preventDefault = (event: Event) => event.preventDefault()
    const preventCopyShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const isCopyShortcut = (event.metaKey || event.ctrlKey) && ['a', 'c', 'x', 's', 'p'].includes(key)
      const isDevShortcut =
        key === 'f12' ||
        ((event.metaKey || event.ctrlKey) && event.shiftKey && ['i', 'j', 'c'].includes(key))

      if (isCopyShortcut || isDevShortcut) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    document.body.classList.add('bluebook-lock-scroll')
    document.documentElement.classList.add('bluebook-lock-scroll')
    document.addEventListener('contextmenu', preventDefault)
    document.addEventListener('copy', preventDefault)
    document.addEventListener('cut', preventDefault)
    document.addEventListener('dragstart', preventDefault)
    document.addEventListener('beforeprint', preventDefault)
    document.addEventListener('keydown', preventCopyShortcut, true)

    return () => {
      document.body.classList.remove('bluebook-lock-scroll')
      document.documentElement.classList.remove('bluebook-lock-scroll')
      document.removeEventListener('contextmenu', preventDefault)
      document.removeEventListener('copy', preventDefault)
      document.removeEventListener('cut', preventDefault)
      document.removeEventListener('dragstart', preventDefault)
      document.removeEventListener('beforeprint', preventDefault)
      document.removeEventListener('keydown', preventCopyShortcut, true)
    }
  }, [])

  useEffect(() => {
    if (!currentQuestion) return
    questionEnteredAt.current = Date.now()

    // Debounce: only write progress bookmark if student stays on this
    // question for 1.5 s. Rapid Next/Back navigation → 0 DB writes.
    // Skip entirely after submit — the submission is no longer in_progress.
    if (progressTimeout.current) clearTimeout(progressTimeout.current)
    progressTimeout.current = setTimeout(() => {
      if (hasSubmittedRef.current) return
      fetch(progressEndpoint ?? `/api/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_question_id: currentQuestion.questionId,
          current_module: currentModule,
        }),
      }).catch(() => undefined)
    }, 1500)

    return () => {
      if (progressTimeout.current) clearTimeout(progressTimeout.current)
    }
  }, [currentQuestion, currentModule, submissionId])

  const saveAnswer = useCallback(
    async (questionId: string, answer: AnswerState) => {
      // Never save after the test has been submitted — the submission status
      // is 'grading' or 'submitted' at that point and the RLS policy on
      // submission_answers only allows writes when status = 'in_progress'.
      if (hasSubmittedRef.current) return
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(async () => {
        if (hasSubmittedRef.current) return   // recheck inside the timer
        try {
          await fetch(answerEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              submission_id: submissionId,
              question_id: questionId,
              selected_option_id: answer.selectedOptionId,
              answer_text: answer.answerText,
              is_marked_for_review: answer.isMarkedForReview,
              highlight_data: answer.highlights,
              note_text: answer.noteText,
              strikethrough_data: answer.strikethroughOptionIds,
              time_spent_seconds: answer.timeSpentSeconds,
            }),
          })
        } catch {
          // Silently fail auto-save
        }
      }, 400)
    },
    [submissionId, answerEndpoint]
  )

  function updateCurrentAnswer(updater: (answer: AnswerState) => AnswerState) {
    if (!currentQuestion) return
    const nextAnswer = updater(currentAnswer)
    setAnswers((prev) => ({ ...prev, [currentQuestion.questionId]: nextAnswer }))
    saveAnswer(currentQuestion.questionId, nextAnswer)
  }

  function captureCurrentQuestionTime() {
    if (!currentQuestion) return answers
    const elapsed = Math.max(0, Math.floor((Date.now() - questionEnteredAt.current) / 1000))
    if (elapsed === 0) return answers

    const nextAnswer = {
      ...currentAnswer,
      timeSpentSeconds: currentAnswer.timeSpentSeconds + elapsed,
    }
    const nextAnswers = { ...answers, [currentQuestion.questionId]: nextAnswer }
    setAnswers(nextAnswers)
    saveAnswer(currentQuestion.questionId, nextAnswer)
    questionEnteredAt.current = Date.now()
    return nextAnswers
  }

  function handleSelect(optionId: string) {
    updateCurrentAnswer((answer) => ({
      ...answer,
      selectedOptionId: optionId,
      answerText: null,
    }))
  }

  function handleAnswerTextChange(value: string) {
    updateCurrentAnswer((answer) => ({
      ...answer,
      selectedOptionId: null,
      answerText: value,
    }))
  }

  function toggleFlag() {
    updateCurrentAnswer((answer) => ({
      ...answer,
      isMarkedForReview: !answer.isMarkedForReview,
    }))
  }

  function handleAddHighlight(highlight: HighlightState) {
    updateCurrentAnswer((answer) => {
      const existingIndex = answer.highlights.findIndex((existing) => existing.text === highlight.text)
      if (existingIndex === -1) {
        return { ...answer, highlights: [...answer.highlights, highlight] }
      }

      return {
        ...answer,
        highlights: answer.highlights.map((existing, index) =>
          index === existingIndex ? { ...existing, ...highlight } : existing
        ),
      }
    })
  }

  function handleUpdateHighlight(index: number, highlight: HighlightState) {
    updateCurrentAnswer((answer) => ({
      ...answer,
      highlights: answer.highlights.map((existing, existingIndex) =>
        existingIndex === index ? highlight : existing
      ),
    }))
  }

  function handleRemoveHighlight(index: number) {
    updateCurrentAnswer((answer) => ({
      ...answer,
      highlights: answer.highlights.filter((_, existingIndex) => existingIndex !== index),
    }))
  }

  function handleToggleStrikethrough(optionId: string) {
    updateCurrentAnswer((answer) => ({
      ...answer,
      strikethroughOptionIds: answer.strikethroughOptionIds.includes(optionId)
        ? answer.strikethroughOptionIds.filter((id) => id !== optionId)
        : [...answer.strikethroughOptionIds, optionId],
    }))
  }

  function goToNextQuestion() {
    captureCurrentQuestionTime()
    if (isLastQuestionInModule) {
      setShowCheckWork(true)
      return
    }
    setCurrentIndex(moduleQuestionIndexes[currentModulePosition + 1])
  }

  function goToPreviousQuestion() {
    if (currentModulePosition === 0) return
    captureCurrentQuestionTime()
    setCurrentIndex(moduleQuestionIndexes[currentModulePosition - 1])
  }

  function moveToNextModule() {
    captureCurrentQuestionTime()
    const nextModuleIndex = currentModuleIndex + 1
    const nextModule = modules[nextModuleIndex]
    const nextQuestionIndex = questions.findIndex((q) => (q.module || 'Bài thi') === nextModule)
    setCurrentModuleIndex(nextModuleIndex)
    setCurrentIndex(nextQuestionIndex)
    setShowModuleModal(false)
    setShowCheckWork(false)
  }

  function leaveCheckWork() {
    setShowCheckWork(false)
  }

  function handleCheckWorkNext() {
    if (isLastModule) submitTest()
    else moveToNextModule()
  }

  function saveAndExit() {
    captureCurrentQuestionTime()
    router.push(exitHref ?? `/${locale}/student`)
  }

  function submitReport() {
    // This is intentionally local for now; question context can be wired to a teacher inbox later.
    setReportText('')
    setShowReportModal(false)
  }

  async function submitTest() {
    setSubmitting(true)
    // Block auto-saves immediately — the submit will flip status to 'grading'
    // and any in-flight or queued saves after that point would get 403.
    hasSubmittedRef.current = true
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    try {
      const latestAnswers = captureCurrentQuestionTime()
      const answersPayload = Object.entries(latestAnswers).map(([questionId, a]) => ({
        question_id: questionId,
        selected_option_id: a.selectedOptionId ?? null,
        answer_text: a.answerText ?? null,
        is_marked_for_review: a.isMarkedForReview,
        time_spent_seconds: a.timeSpentSeconds,
      }))

      const startTime = new Date(startedAt).getTime()
      const timeSpent = Math.floor((Date.now() - startTime) / 1000)

      const res = await fetch(submitEndpoint ?? `/api/submissions/${submissionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersPayload, time_spent_seconds: timeSpent }),
      })

      // 200 → grading ran synchronously (local dev). Navigate directly — no polling.
      if (res.status === 200) {
        router.push(resultsHref ?? `/${locale}/student/test/${instanceId}/results`)
        return
      }

      // Any non-202 failure → surface the error and let the student retry.
      if (res.status !== 202) {
        const json = await res.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[submit] Failed:', json.error)
        setSubmitting(false)
        hasSubmittedRef.current = false  // allow resubmit after error
        return
      }

      // 202 → grading is running in a background queue (production).
      // Poll every 1 s for up to 15 s until the worker marks it 'submitted'.
      // After 15 s the student lands on /results which shows the GradingScreen.
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        if (attempts > 15) {
          clearInterval(poll)
          // Navigate to results — GradingScreen will poll further
          router.push(resultsHref ?? `/${locale}/student/test/${instanceId}/results`)
          return
        }
        try {
          const check  = await fetch(`/api/submissions/${submissionId}`)
          const status = (await check.json()).data?.status
          if (status === 'submitted') {
            clearInterval(poll)
            router.push(resultsHref ?? `/${locale}/student/test/${instanceId}/results`)
            router.refresh()
          }
        } catch {
          // silent — keep polling
        }
      }, 1000)
    } catch {
      setSubmitting(false)
      setShowSubmitModal(false)
    }
  }

  let timerSeconds: number | null = null
  if (isTimed && timeLimitSeconds) {
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    timerSeconds = Math.max(0, timeLimitSeconds - elapsed)
  }

  const answeredModuleLocalIndices = new Set(
    moduleQuestionIndexes
      .map((questionIndex, localIndex) => {
        const answer = answers[questions[questionIndex].questionId]
        return answer?.selectedOptionId || answer?.answerText ? localIndex : -1
      })
      .filter((index) => index !== -1)
  )
  const flaggedModuleLocalIndices = new Set(
    moduleQuestionIndexes
      .map((questionIndex, localIndex) =>
        answers[questions[questionIndex].questionId]?.isMarkedForReview ? localIndex : -1
      )
      .filter((index) => index !== -1)
  )
  const totalAnswered = questions.filter((q) => {
    const answer = answers[q.questionId]
    return answer?.selectedOptionId || answer?.answerText
  }).length
  const unansweredCount = questions.length - totalAnswered

  return (
    <TestLayout>
      <div className="shrink-0 bg-white">
        <div className="grid h-20 grid-cols-[minmax(260px,1fr)_auto_minmax(260px,1fr)] items-start gap-4 bg-[#eef2fb] px-10 pt-3">
          <div className="min-w-0">
            <span className="block truncate text-[22px] font-bold leading-tight text-black">
              {currentSectionTitle}
            </span>
            <button className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-[#222]">
              Directions
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m4 7 6 6 6-6" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col items-center">
            {isTimed && timerSeconds !== null ? (
              <Timer totalSeconds={timerSeconds} onExpire={submitTest} />
            ) : (
              <span className="text-[26px] font-bold leading-none text-black">--:--</span>
            )}
          </div>

          <div className="flex justify-end gap-4">
            {isMathModule ? (
              <>
                <ExamTool
                  icon={<span className="text-[21px]">▤</span>}
                  label="Calculator"
                  active={showCalculator}
                  onClick={() => {
                    setShowCalculator((value) => !value)
                    setShowReference(false)
                    setShowMoreMenu(false)
                  }}
                />
                <ExamTool
                  icon={<span className="font-serif text-[22px] font-bold">x²</span>}
                  label="Reference"
                  active={showReference}
                  onClick={() => {
                    setShowReference((value) => !value)
                    setShowCalculator(false)
                    setShowMoreMenu(false)
                  }}
                />
              </>
            ) : (
              <ExamTool
                icon={<NotesIcon />}
                label="Highlights & Notes"
                active={showHighlightsNotes}
                onClick={() => setShowHighlightsNotes((value) => !value)}
              />
            )}
            <ExamTool icon={<SaveIcon />} label="Save" onClick={saveAndExit} />
            <ExamTool icon={<SettingsIcon />} label="Settings" />
            <ExamTool
              icon={<MoreIcon />}
              label="More"
              active={showMoreMenu}
              onClick={() => {
                setShowMoreMenu((value) => !value)
                setShowCalculator(false)
                setShowReference(false)
              }}
            />
          </div>
        </div>
        <TopStripe />
        <PracticeBanner />
      </div>

      <div className="relative flex flex-1 overflow-hidden bg-white">
        {showCheckWork ? (
          <CheckWorkScreen
            sectionTitle={currentSectionTitle}
            totalQuestions={moduleQuestionIndexes.length}
            currentIndex={currentModulePosition}
            answeredIndices={answeredModuleLocalIndices}
            flaggedIndices={flaggedModuleLocalIndices}
            onNavigate={(localIndex) => {
              captureCurrentQuestionTime()
              setCurrentIndex(moduleQuestionIndexes[localIndex])
              setShowCheckWork(false)
            }}
          />
        ) : currentQuestion && (
          <QuestionDisplay
            key={currentQuestion.questionId}
            questionId={currentQuestion.questionId}
            questionNumber={currentModulePosition + 1}
            totalQuestions={moduleQuestionIndexes.length}
            content={currentQuestion.content}
            options={currentQuestion.options.map((o) => ({ id: o.id, label: o.label, content: o.content }))}
            selectedOptionId={currentAnswer.selectedOptionId}
            answerText={currentAnswer.answerText}
            isMarkedForReview={currentAnswer.isMarkedForReview}
            noteText={currentAnswer.noteText}
            highlights={currentAnswer.highlights}
            strikethroughOptionIds={currentAnswer.strikethroughOptionIds}
            onSelect={handleSelect}
            onAnswerTextChange={handleAnswerTextChange}
            onToggleReview={toggleFlag}
            onNoteChange={(value) => updateCurrentAnswer((answer) => ({ ...answer, noteText: value }))}
            onAddHighlight={handleAddHighlight}
            onUpdateHighlight={handleUpdateHighlight}
            onRemoveHighlight={handleRemoveHighlight}
            onToggleStrikethrough={handleToggleStrikethrough}
            studentName={studentName}
            showCalculator={isMathModule}
            annotationsEnabled={!isMathModule && showHighlightsNotes}
          />
        )}

        {showNavPanel && !showCheckWork && (
          <NavPanel
            totalQuestions={moduleQuestionIndexes.length}
            currentIndex={currentModulePosition}
            answeredIndices={answeredModuleLocalIndices}
            flaggedIndices={flaggedModuleLocalIndices}
            onNavigate={(localIndex) => {
              captureCurrentQuestionTime()
              setCurrentIndex(moduleQuestionIndexes[localIndex])
            }}
          />
        )}
      </div>

      {showCalculator && <CalculatorPanel onClose={() => setShowCalculator(false)} />}
      {showReference && <ReferencePanel onClose={() => setShowReference(false)} />}
      {showMoreMenu && (
        <div className="absolute right-5 top-[92px] z-50 min-w-[230px] rounded-[10px] border border-[#d6d6d6] bg-white px-5 py-4 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              setShowReportModal(true)
              setShowMoreMenu(false)
            }}
            className="mb-4 flex items-center gap-4 text-[18px] font-medium text-[#1f2937] underline decoration-[#1f2937]/70 underline-offset-4"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#1f2937] text-lg">!</span>
            Report a Problem
          </button>
          <button
            type="button"
            onClick={saveAndExit}
            className="flex items-center gap-4 text-[18px] font-medium text-[#1f2937] underline decoration-[#1f2937]/70 underline-offset-4"
          >
            <span className="flex h-8 w-8 items-center justify-center border-2 border-[#1f2937] text-xl">✓</span>
            Save and Exit
          </button>
        </div>
      )}

      <div className="shrink-0 bg-white">
        <TopStripe />
        <div className="relative grid h-16 grid-cols-[1fr_auto_1fr] items-center bg-[#eef2fb] px-10">
          <span className="text-[20px] font-bold text-black">{studentName || 'Student'}</span>

          <button
            onClick={() => setShowNavPanel((v) => !v)}
            className="rounded-[7px] bg-[#111] px-5 py-2 text-[15px] font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
          >
            Question {currentModulePosition + 1} of {moduleQuestionIndexes.length}
            <span className="ml-2">{showNavPanel ? '⌄' : '⌃'}</span>
          </button>

          <div className="flex items-center justify-end gap-4">
            <Button size="sm" variant="secondary" disabled={!showCheckWork && currentModulePosition === 0} onClick={showCheckWork ? leaveCheckWork : goToPreviousQuestion} className="min-w-[86px] rounded-full border-2 border-transparent bg-[#3857d6] py-2.5 text-[15px] font-bold text-white shadow-none hover:bg-[#263bba] disabled:bg-[#d8d8d8]">
              Back
            </Button>
            <Button size="sm" loading={submitting && showCheckWork} onClick={showCheckWork ? handleCheckWorkNext : goToNextQuestion} className="min-w-[86px] rounded-full border-2 border-transparent bg-[#3857d6] py-2.5 text-[15px] font-bold text-white shadow-none hover:bg-[#263bba]">
              {showCheckWork
                ? 'Next'
                : isLastQuestionInModule
                ? isLastModule
                  ? 'Submit'
                  : 'Next'
                : 'Next'}
            </Button>
          </div>
        </div>
      </div>

      <Modal open={showModuleModal} onClose={() => setShowModuleModal(false)} title="Kết thúc module">
        <div className="space-y-4">
          <p className="text-sm text-ink">
            Sau khi sang module tiếp theo, bạn sẽ không thể quay lại <strong>{currentModule}</strong>.
          </p>
          <div className="flex gap-3">
            <Button onClick={moveToNextModule}>Sang module tiếp theo</Button>
            <Button variant="ghost" onClick={() => setShowModuleModal(false)}>
              Tiếp tục kiểm tra
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showReportModal} onClose={() => setShowReportModal(false)} title="Report a Mistake" size="lg">
        <div className="space-y-5">
          <p className="text-base font-bold text-ink">
            Please describe the issue. The current question will be automatically attached.
          </p>
          <textarea
            value={reportText}
            onChange={(event) => setReportText(event.target.value)}
            rows={6}
            autoFocus
            placeholder="Your Feedback Here..."
            className="w-full resize-none rounded-[8px] border-2 border-[#4b5bdc] px-4 py-3 text-base outline-none ring-4 ring-[#4b5bdc]/10"
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowReportModal(false)} className="min-w-[120px] border-2 border-black bg-white text-black hover:bg-surface-soft">
              Cancel
            </Button>
            <Button onClick={submitReport} className="min-w-[140px] bg-[#354bc6] text-white hover:bg-[#263bba]">
              Submit
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showSubmitModal} onClose={() => setShowSubmitModal(false)} title="Xác nhận nộp bài">
        <div className="space-y-4">
          <p className="text-sm text-ink">
            Bạn đã trả lời <strong>{totalAnswered}/{questions.length}</strong> câu hỏi.
          </p>
          {unansweredCount > 0 && (
            <div className="rounded-[6px] bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-sm text-amber-800">
                Còn <strong>{unansweredCount}</strong> câu chưa trả lời. Bạn có chắc chắn muốn nộp bài không?
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <Button loading={submitting} onClick={submitTest}>
              Xác nhận nộp bài
            </Button>
            <Button variant="ghost" onClick={() => setShowSubmitModal(false)} disabled={submitting}>
              Tiếp tục làm bài
            </Button>
          </div>
        </div>
      </Modal>
    </TestLayout>
  )
}
