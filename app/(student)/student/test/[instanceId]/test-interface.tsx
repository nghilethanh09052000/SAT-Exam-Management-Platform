'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
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
  initialAnswers: Record<
    string,
    {
      selectedOptionId: string | null
      answerText: string | null
      isMarkedForReview: boolean
    }
  >
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
}: TestInterfaceProps) {
  const router = useRouter()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<
    Record<string, { selectedOptionId: string | null; answerText: string | null; isMarkedForReview: boolean }>
  >(initialAnswers)
  const [flagged, setFlagged] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [showNavPanel, setShowNavPanel] = useState(true)
  const saveTimeout = useRef<NodeJS.Timeout | null>(null)

  const currentQuestion = questions[currentIndex]

  // Disable right-click
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault()
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [])

  // Auto-save answer (debounced)
  const saveAnswer = useCallback(
    async (questionId: string, selectedOptionId: string | null, answerText: string | null) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(async () => {
        try {
          await fetch(`/api/submission-answers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              submission_id: submissionId,
              question_id: questionId,
              selected_option_id: selectedOptionId,
              answer_text: answerText,
              is_marked_for_review: answers[questionId]?.isMarkedForReview ?? false,
            }),
          })
        } catch {
          // Silently fail auto-save
        }
      }, 500)
    },
    [submissionId, answers]
  )

  function handleSelect(optionId: string) {
    const qId = currentQuestion.questionId
    setAnswers((prev) => ({
      ...prev,
      [qId]: {
        selectedOptionId: optionId,
        answerText: null,
        isMarkedForReview: prev[qId]?.isMarkedForReview ?? false,
      },
    }))
    saveAnswer(qId, optionId, null)
  }

  function toggleFlag() {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(currentIndex)) next.delete(currentIndex)
      else next.add(currentIndex)
      return next
    })
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
        body: JSON.stringify({
          answers: answersPayload,
          time_spent_seconds: timeSpent,
        }),
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

  // Calculate timer seconds
  let timerSeconds: number | null = null
  if (isTimed && timeLimitSeconds) {
    const elapsed = Math.floor(
      (Date.now() - new Date(startedAt).getTime()) / 1000
    )
    timerSeconds = Math.max(0, timeLimitSeconds - elapsed)
  }

  const answeredIndices = new Set(
    questions
      .map((q, i) => {
        const a = answers[q.questionId]
        return a?.selectedOptionId || a?.answerText ? i : -1
      })
      .filter((i) => i !== -1)
  )

  const unansweredCount = questions.length - answeredIndices.size

  return (
    <TestLayout>
      {/* Top bar */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-hairline-light bg-canvas-light shrink-0 z-10">
        <div className="flex items-center gap-4">
          <span className="font-display font-semibold text-ink text-sm truncate max-w-xs">
            {assignmentTitle}
          </span>
          {currentQuestion && (
            <span className="text-sm text-mute-light">
              {currentQuestion.module} — Câu {currentIndex + 1}/{questions.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isTimed && timerSeconds !== null && (
            <Timer
              totalSeconds={timerSeconds}
              onExpire={submitTest}
            />
          )}
          <Button
            size="sm"
            onClick={() => setShowSubmitModal(true)}
            disabled={submitting}
          >
            Nộp bài
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Question */}
        {currentQuestion && (
          <QuestionDisplay
            key={currentQuestion.questionId}
            questionId={currentQuestion.questionId}
            questionNumber={currentIndex + 1}
            content={currentQuestion.content}
            options={currentQuestion.options.map((o) => ({
              id: o.id,
              label: o.label,
              content: o.content,
            }))}
            selectedOptionId={
              answers[currentQuestion.questionId]?.selectedOptionId ?? null
            }
            onSelect={handleSelect}
            studentName={studentName}
          />
        )}

        {/* Nav panel */}
        {showNavPanel && (
          <NavPanel
            totalQuestions={questions.length}
            currentIndex={currentIndex}
            answeredIndices={answeredIndices}
            flaggedIndices={flagged}
            onNavigate={setCurrentIndex}
          />
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="h-14 flex items-center justify-between px-6 border-t border-hairline-light bg-canvas-light shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFlag}
            className={[
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              flagged.has(currentIndex)
                ? 'bg-amber-100 text-amber-700'
                : 'bg-surface-soft text-mute-light hover:text-ink',
            ].join(' ')}
          >
            <svg className="w-4 h-4" fill={flagged.has(currentIndex) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
          <Button
            size="sm"
            variant="secondary"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => i - 1)}
          >
            Trước
          </Button>
          <Button
            size="sm"
            disabled={currentIndex === questions.length - 1}
            onClick={() => setCurrentIndex((i) => i + 1)}
          >
            Tiếp
          </Button>
        </div>
      </div>

      {/* Submit modal */}
      <Modal
        open={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        title="Xác nhận nộp bài"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink">
            Bạn đã trả lời{' '}
            <strong>{answeredIndices.size}/{questions.length}</strong> câu hỏi.
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
            <Button
              variant="ghost"
              onClick={() => setShowSubmitModal(false)}
              disabled={submitting}
            >
              Tiếp tục làm bài
            </Button>
          </div>
        </div>
      </Modal>
    </TestLayout>
  )
}
