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
  is_correct: boolean
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
})

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
  const [showNavPanel, setShowNavPanel] = useState(true)
  const saveTimeout = useRef<NodeJS.Timeout | null>(null)

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

  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault()
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [])

  useEffect(() => {
    if (!currentQuestion) return
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
    if (isLastQuestionInModule) {
      if (isLastModule) setShowSubmitModal(true)
      else setShowModuleModal(true)
      return
    }
    setCurrentIndex(moduleQuestionIndexes[currentModulePosition + 1])
  }

  function goToPreviousQuestion() {
    if (currentModulePosition === 0) return
    setCurrentIndex(moduleQuestionIndexes[currentModulePosition - 1])
  }

  function moveToNextModule() {
    const nextModuleIndex = currentModuleIndex + 1
    const nextModule = modules[nextModuleIndex]
    const nextQuestionIndex = questions.findIndex((q) => (q.module || 'Bài thi') === nextModule)
    setCurrentModuleIndex(nextModuleIndex)
    setCurrentIndex(nextQuestionIndex)
    setShowModuleModal(false)
  }

  async function submitTest() {
    setSubmitting(true)
    try {
      const answersPayload = Object.entries(answers).map(([questionId, a]) => ({
        question_id: questionId,
        selected_option_id: a.selectedOptionId ?? null,
        answer_text: a.answerText ?? null,
        is_marked_for_review: a.isMarkedForReview,
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
      <div className="h-16 flex items-center justify-between px-6 border-b border-hairline-light bg-canvas-light shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="min-w-0">
            <span className="block font-display font-semibold text-ink text-sm truncate max-w-xs">
              {assignmentTitle}
            </span>
            <span className="block text-xs text-mute-light">{currentModule}</span>
          </div>
          <span className="rounded-full bg-surface-soft px-3 py-1 text-sm font-medium text-ink">
            Câu {currentModulePosition + 1}/{moduleQuestionIndexes.length}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isTimed && timerSeconds !== null && <Timer totalSeconds={timerSeconds} onExpire={submitTest} />}
          <Button size="sm" onClick={() => setShowSubmitModal(true)} disabled={submitting}>
            Nộp bài
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {currentQuestion && (
          <QuestionDisplay
            key={currentQuestion.questionId}
            questionId={currentQuestion.questionId}
            questionNumber={currentModulePosition + 1}
            content={currentQuestion.content}
            options={currentQuestion.options.map((o) => ({ id: o.id, label: o.label, content: o.content }))}
            selectedOptionId={currentAnswer.selectedOptionId}
            answerText={currentAnswer.answerText}
            noteText={currentAnswer.noteText}
            highlights={currentAnswer.highlights}
            strikethroughOptionIds={currentAnswer.strikethroughOptionIds}
            onSelect={handleSelect}
            onAnswerTextChange={handleAnswerTextChange}
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
            onNavigate={(localIndex) => setCurrentIndex(moduleQuestionIndexes[localIndex])}
          />
        )}
      </div>

      <div className="h-16 flex items-center justify-between px-6 border-t border-hairline-light bg-canvas-light shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFlag}
            className={[
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              currentAnswer.isMarkedForReview
                ? 'bg-amber-100 text-amber-700'
                : 'bg-surface-soft text-mute-light hover:text-ink',
            ].join(' ')}
          >
            <svg className="w-4 h-4" fill={currentAnswer.isMarkedForReview ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
            Đánh dấu xem lại
          </button>
          <button
            onClick={() => setShowNavPanel((v) => !v)}
            className="px-3 py-1.5 rounded-full text-sm font-medium text-mute-light hover:text-ink bg-surface-soft transition-colors"
          >
            {showNavPanel ? 'Ẩn điều hướng' : 'Hiện điều hướng'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={currentModulePosition === 0} onClick={goToPreviousQuestion}>
            Trước
          </Button>
          <Button size="sm" onClick={goToNextQuestion}>
            {isLastQuestionInModule
              ? isLastModule
                ? 'Nộp bài'
                : 'Kết thúc module'
              : 'Tiếp'}
          </Button>
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
