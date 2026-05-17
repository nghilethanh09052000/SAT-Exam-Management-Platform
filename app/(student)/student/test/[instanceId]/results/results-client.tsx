'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Card } from '@/components/ui/card'

interface Option {
  id: string
  label: string
  content: string
  is_correct: boolean
  order: number
}

interface AnswerData {
  index: number
  questionId: string
  isCorrect: boolean | null
  isMarkedForReview: boolean
  timeSpent: number | null
  selectedOptionId: string | null
  answerText: string | null
  question: {
    content: string
    type: string
    options: Option[]
    acceptedAnswers: string[]
    explanation: string | null
  } | null
}

interface ResultsClientProps {
  submission: {
    id: string
    rawScore: number
    totalQuestions: number
    timeSpentSeconds: number
    submittedAt: string
  }
  assignmentTitle: string
  instanceId: string
  canReview: boolean
  answers: AnswerData[]
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ResultsClient({
  submission,
  assignmentTitle,
  instanceId,
  canReview,
  answers,
}: ResultsClientProps) {
  const [reviewAnswer, setReviewAnswer] = useState<AnswerData | null>(null)

  const percentage =
    submission.totalQuestions > 0
      ? Math.round((submission.rawScore / submission.totalQuestions) * 100)
      : 0

  return (
    <div className="space-y-8">
      {/* Score summary */}
      <Card className="p-4 md:p-8">
        <div className="text-center space-y-2">
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            {assignmentTitle}
          </h1>
          <p className="text-sm text-mute-light">Kết quả bài thi</p>

          <div className="py-4 md:py-6">
            <div className="text-4xl md:text-6xl font-display font-bold text-primary">
              {submission.rawScore}
              <span className="text-2xl md:text-3xl text-mute-light">/{submission.totalQuestions}</span>
            </div>
            <p className="text-base md:text-lg text-mute-light mt-2">{percentage}% chính xác</p>
          </div>

          <div className="flex items-center justify-center gap-4 md:gap-8 text-sm text-mute-light">
            <div>
              <p className="font-medium text-ink">{submission.rawScore}</p>
              <p>Câu đúng</p>
            </div>
            <div>
              <p className="font-medium text-ink">
                {submission.totalQuestions - submission.rawScore}
              </p>
              <p>Câu sai</p>
            </div>
            <div>
              <p className="font-medium text-ink">
                {formatTime(submission.timeSpentSeconds)}
              </p>
              <p>Thời gian làm bài</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Link href="/student">
          <Button variant="secondary">Về trang chủ</Button>
        </Link>
      </div>

      {/* Answer review table */}
      {canReview ? (
      <div>
        <h2 className="text-lg font-display font-semibold text-ink mb-4">
          Chi tiết từng câu
        </h2>
        <div className="overflow-x-auto rounded-card border border-hairline-light">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline-light bg-surface-soft">
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase">Câu</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase">Kết quả</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase">Thời gian</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light">
              {answers.map((a) => (
                <tr key={a.questionId} className="hover:bg-surface-soft transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{a.index}</td>
                  <td className="px-4 py-3">
                    {a.isCorrect === true ? (
                      <Badge variant="success">Đúng</Badge>
                    ) : a.isCorrect === false ? (
                      <Badge variant="error">Sai</Badge>
                    ) : (
                      <Badge variant="muted">Bỏ qua</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-mute-light">
                    {a.timeSpent ? formatTime(a.timeSpent) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setReviewAnswer(a)}
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      Xem lại
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      ) : (
        <Card className="p-5">
          <h2 className="text-lg font-display font-semibold text-ink mb-2">
            Chi tiết từng câu
          </h2>
          <p className="text-sm text-mute-light">
            Bài làm đã được chấm điểm. Phần xem lại đáp án sẽ mở sau hạn nộp.
          </p>
        </Card>
      )}

      {/* Review modal */}
      {canReview && reviewAnswer && (
        <Modal
          open={!!reviewAnswer}
          onClose={() => setReviewAnswer(null)}
          title={`Câu ${reviewAnswer.index}`}
          size="xl"
        >
          <div className="space-y-4">
            <p className="text-base text-ink">{reviewAnswer.question?.content}</p>

            {/* Options */}
            {reviewAnswer.question?.type === 'multiple_choice' && (
              <div className="space-y-2">
                {reviewAnswer.question.options.map((opt) => {
                  const isSelected = opt.id === reviewAnswer.selectedOptionId
                  const isCorrect = opt.is_correct

                  let bgClass = 'bg-surface-soft'
                  if (isCorrect) bgClass = 'bg-green-50 border-green-400'
                  else if (isSelected && !isCorrect) bgClass = 'bg-red-50 border-red-400'

                  return (
                    <div
                      key={opt.id}
                      className={`flex items-start gap-3 px-4 py-3 rounded-card border-2 ${
                        isCorrect
                          ? 'border-green-400 bg-green-50'
                          : isSelected
                          ? 'border-warning bg-red-50'
                          : 'border-hairline-light bg-canvas-light'
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                          isCorrect
                            ? 'border-green-600 bg-green-600 text-white'
                            : isSelected
                            ? 'border-warning bg-warning text-white'
                            : 'border-ash-light text-mute-light'
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span className="text-sm text-ink">{opt.content}</span>
                      {isCorrect && (
                        <span className="ml-auto text-xs text-green-700 font-medium shrink-0">
                          Đáp án đúng
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Short answer */}
            {reviewAnswer.question?.type === 'short_answer' && (
              <div className="space-y-2">
                <div className="px-4 py-3 rounded-card border border-hairline-light bg-surface-soft">
                  <p className="text-xs text-mute-light mb-1">Đáp án của bạn</p>
                  <p className="text-sm text-ink">{reviewAnswer.answerText ?? '(Bỏ qua)'}</p>
                </div>
                <div className="px-4 py-3 rounded-card border border-green-300 bg-green-50">
                  <p className="text-xs text-green-700 mb-1">Đáp án đúng</p>
                  <p className="text-sm text-ink">
                    {reviewAnswer.question.acceptedAnswers.join(', ')}
                  </p>
                </div>
              </div>
            )}

            {/* Explanation */}
            {reviewAnswer.question?.explanation && (
              <div className="px-4 py-3 rounded-card border border-primary/20 bg-blue-50">
                <p className="text-xs text-primary font-medium mb-1">Giải thích</p>
                <p className="text-sm text-ink">{reviewAnswer.question.explanation}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
