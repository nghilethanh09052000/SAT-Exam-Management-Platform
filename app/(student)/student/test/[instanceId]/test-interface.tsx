'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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

interface AnswerState {
  selectedOptionId: string | null
  answerText: string | null
  isMarkedForReview: boolean
  highlights: { text: string }[]
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
        'flex min-w-14 flex-col items-center justify-center gap-1 border-b-2 px-1 pb-1 text-[13px] font-semibold transition-colors hover:text-[#2f43c9]',
        active ? 'border-black text-black' : 'border-transparent text-[#1a1a1a]',
      ].join(' ')}
    >
      <span className="flex h-5 items-center justify-center text-[21px] leading-none">{icon}</span>
      <span className="text-[12px]">{label}</span>
    </button>
  )
}

function TopStripe() {
  return <div className="h-[3px] w-full bg-[repeating-linear-gradient(90deg,#9d4f16_0_34px,#f0dbc0_34px_68px,#3c9b44_68px_102px,#0b168e_102px_136px,#9d4f16_136px_170px)]" />
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
}: TestInterfaceProps) {
  const router = useRouter()
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
  const [showNavPanel, setShowNavPanel] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [showReference, setShowReference] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [reportText, setReportText] = useState('')
  const saveTimeout = useRef<NodeJS.Timeout | null>(null)
  const questionEnteredAt = useRef<number>(Date.now())

  const currentModule = modules[currentModuleIndex]
  const moduleQuestionIndexes = questions
    .map((q, index) => ((q.module || 'Bài thi') === currentModule ? index : -1))
    .filter((index) => index !== -1)
  const currentModulePosition = Math.max(0, moduleQuestionIndexes.indexOf(currentIndex))
  const currentQuestion = questions[currentIndex]
  const currentAnswer = currentQuestion ? answers[currentQuestion.questionId] ?? emptyAnswer() : emptyAnswer()
  const isLastModule = currentModuleIndex === modules.length - 1
  const isLastQuestionInModule = currentModulePosition === moduleQuestionIndexes.length - 1
  const isMathModule = currentModule.toLowerCase().includes('math')
  const currentSectionTitle = sectionTitle(currentModule, currentModuleIndex)

  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault()
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [])

  useEffect(() => {
    if (!currentQuestion) return
    questionEnteredAt.current = Date.now()
    fetch(`/api/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_question_id: currentQuestion.questionId,
        current_module: currentModule,
      }),
    }).catch(() => undefined)
  }, [currentQuestion, currentModule, submissionId])

  const saveAnswer = useCallback(
    async (questionId: string, answer: AnswerState) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(async () => {
        try {
          await fetch(`/api/submission-answers`, {
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
    [submissionId]
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

  function handleAddHighlight(text: string) {
    updateCurrentAnswer((answer) =>
      answer.highlights.some((highlight) => highlight.text === text)
        ? answer
        : { ...answer, highlights: [...answer.highlights, { text }] }
    )
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
      if (isLastModule) setShowSubmitModal(true)
      else setShowModuleModal(true)
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
  }

  function saveAndExit() {
    captureCurrentQuestionTime()
    router.push('/student')
  }

  function submitReport() {
    // This is intentionally local for now; question context can be wired to a teacher inbox later.
    setReportText('')
    setShowReportModal(false)
  }

  async function submitTest() {
    setSubmitting(true)
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
      const res = await fetch(`/api/submissions/${submissionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersPayload, time_spent_seconds: timeSpent }),
      })
      const json = await res.json()
      if (!json.error) {
        router.push(`/student/test/${instanceId}/results`)
        router.refresh()
      }
    } finally {
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
        <div className="grid h-[86px] grid-cols-[minmax(180px,1fr)_auto_minmax(280px,1fr)] items-start gap-4 px-6 pt-4">
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

          <div className="flex justify-end gap-3">
            <ExamTool icon={<span className="text-[22px]">▣</span>} label="Save" onClick={saveAndExit} />
            <ExamTool icon={<span className="text-[24px]">⚙</span>} label="Settings" />
            <ExamTool
              icon={<span className="text-[24px]">△</span>}
              label="Report"
              active={showReportModal}
              onClick={() => {
                setShowReportModal(true)
                setShowMoreMenu(false)
              }}
            />
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
              icon={<span className="font-serif text-[25px] font-bold">x²</span>}
              label="Reference"
              active={showReference}
              onClick={() => {
                setShowReference((value) => !value)
                setShowCalculator(false)
                setShowMoreMenu(false)
              }}
            />
            <ExamTool
              icon={<span className="text-[25px]">⋮</span>}
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
      </div>

      <div className="relative flex flex-1 overflow-hidden bg-white">
        {currentQuestion && (
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
            onToggleStrikethrough={handleToggleStrikethrough}
            studentName={studentName}
            showCalculator={isMathModule}
          />
        )}

        {showNavPanel && (
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
        <div className="absolute right-5 top-[92px] z-50 rounded-[10px] border border-[#e5e5e5] bg-white px-6 py-4 shadow-2xl">
          <button
            type="button"
            onClick={saveAndExit}
            className="flex items-center gap-4 text-[20px] font-medium text-[#1f2937] underline decoration-[#1f2937]/70 underline-offset-4"
          >
            <span className="flex h-8 w-8 items-center justify-center border-2 border-[#1f2937] text-xl">✓</span>
            Save and Exit
          </button>
        </div>
      )}

      <div className="shrink-0 bg-white">
        <TopStripe />
        <div className="relative grid h-[76px] grid-cols-[1fr_auto_1fr] items-center px-6">
          <span className="text-[22px] font-bold text-black">bluebook</span>

          <button
            onClick={() => setShowNavPanel((v) => !v)}
            className="rounded-[8px] bg-black px-5 py-2.5 text-[17px] font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
          >
            Question {currentModulePosition + 1} of {moduleQuestionIndexes.length}
            <span className="ml-2">{showNavPanel ? '⌄' : '⌃'}</span>
          </button>

          <div className="flex items-center justify-end gap-4">
            <Button size="sm" variant="secondary" disabled={currentModulePosition === 0} onClick={goToPreviousQuestion} className="min-w-[96px] rounded-full border-2 border-transparent bg-[#354bc6] py-2.5 text-[16px] font-bold text-white shadow-md hover:bg-[#263bba] disabled:bg-[#d8d8d8]">
              Back
            </Button>
            <Button size="sm" onClick={goToNextQuestion} className="min-w-[96px] rounded-full border-2 border-black bg-[#354bc6] py-2.5 text-[16px] font-bold text-white shadow-md hover:bg-[#263bba]">
              {isLastQuestionInModule
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
