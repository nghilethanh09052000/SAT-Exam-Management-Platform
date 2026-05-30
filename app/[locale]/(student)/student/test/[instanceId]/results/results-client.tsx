'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Card } from '@/components/ui/card'
import { renderMathInHtml } from '@/lib/math-html'

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
    teacherExplanation: string | null
    aiExplanation: string | null
  } | null
}

interface AttemptResult {
  id: string
  attemptNumber: number
  rawScore: number
  totalQuestions: number
  timeSpentSeconds: number
  submittedAt: string
  answers: AnswerData[]
  skillBreakdown: {
    name: string
    correct: number
    total: number
  }[]
}

interface ResultsClientProps {
  submission: {
    id: string
    attemptNumber: number
    rawScore: number
    totalQuestions: number
    timeSpentSeconds: number
    submittedAt: string
  }
  assignmentTitle: string
  instanceId: string
  canReview: boolean
  retryAvailable: boolean
  attemptsUsed: number
  maxAttempts: number
  attempts: {
    id: string
    attemptNumber: number
    status: string
    rawScore: number | null
    totalQuestions: number | null
    timeSpentSeconds: number | null
    submittedAt: string | null
  }[]
  answers: AnswerData[]
  skillBreakdown: {
    name: string
    correct: number
    total: number
  }[]
  /** Per-attempt views (latest first). When more than one, the student can
   *  switch attempts; defaults to the latest. */
  attemptResults?: AttemptResult[]
  testHref?: string
  homeHref?: string
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function getStudentAnswerLabel(answer: AnswerData, skippedLabel: string) {
  if (!answer.question) return '—'
  if (answer.question.type === 'short_answer') {
    return answer.answerText?.trim() || skippedLabel
  }

  const selected = answer.question.options.find((option) => option.id === answer.selectedOptionId)
  return selected ? `${selected.label}. ${selected.content}` : skippedLabel
}

function getCorrectAnswerLabel(answer: AnswerData) {
  if (!answer.question) return '—'
  if (answer.question.type === 'short_answer') {
    return answer.question.acceptedAnswers.join(', ') || '—'
  }

  const correct = answer.question.options.find((option) => option.is_correct)
  return correct ? `${correct.label}. ${correct.content}` : '—'
}

export function ResultsClient({
  submission,
  assignmentTitle,
  instanceId,
  canReview,
  retryAvailable,
  attemptsUsed,
  maxAttempts,
  attempts,
  answers,
  skillBreakdown,
  attemptResults,
  testHref,
  homeHref = '/student',
}: ResultsClientProps) {
  const t = useTranslations('student.results')
  const [reviewAnswer, setReviewAnswer] = useState<AnswerData | null>(null)

  // Per-attempt views. Falls back to a single view built from the legacy
  // submission/answers/skillBreakdown props when attemptResults isn't supplied.
  const results: AttemptResult[] =
    attemptResults && attemptResults.length > 0
      ? attemptResults
      : [
          {
            id: submission.id,
            attemptNumber: submission.attemptNumber,
            rawScore: submission.rawScore,
            totalQuestions: submission.totalQuestions,
            timeSpentSeconds: submission.timeSpentSeconds,
            submittedAt: submission.submittedAt,
            answers,
            skillBreakdown,
          },
        ]

  const [selectedAttemptId, setSelectedAttemptId] = useState(submission.id)
  const selected = results.find((r) => r.id === selectedAttemptId) ?? results[0]

  // Switch the displayed attempt and close any open review modal.
  const selectAttempt = (id: string) => {
    setSelectedAttemptId(id)
    setReviewAnswer(null)
  }

  const percentage =
    selected.totalQuestions > 0
      ? Math.round((selected.rawScore / selected.totalQuestions) * 100)
      : 0

  return (
    <div className="space-y-8">
      {/* Attempt switcher — only when there's more than one attempt to review */}
      {results.length > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => selectAttempt(r.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                r.id === selected.id
                  ? 'bg-primary text-white'
                  : 'bg-surface-soft text-mute-light hover:text-ink'
              }`}
            >
              {t('attemptLabel', { n: r.attemptNumber })}
            </button>
          ))}
        </div>
      )}

      {/* Score summary */}
      <Card className="p-4 md:p-8">
        <div className="text-center space-y-2">
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            {assignmentTitle}
          </h1>
          <p className="text-sm text-mute-light">{t('testResult')}</p>
          <p className="text-xs text-mute-light">{t('attempt', { n: selected.attemptNumber })}</p>

          <div className="py-4 md:py-6">
            <div className="text-4xl md:text-6xl font-display font-bold text-primary">
              {selected.rawScore}
              <span className="text-2xl md:text-3xl text-mute-light">/{selected.totalQuestions}</span>
            </div>
            <p className="text-base md:text-lg text-mute-light mt-2">{t('accuracy', { pct: percentage })}</p>
          </div>

          <div className="flex items-center justify-center gap-4 md:gap-8 text-sm text-mute-light">
            <div>
              <p className="font-medium text-ink">{selected.rawScore}</p>
              <p>{t('correct')}</p>
            </div>
            <div>
              <p className="font-medium text-ink">
                {selected.totalQuestions - selected.rawScore}
              </p>
              <p>{t('wrong')}</p>
            </div>
            <div>
              <p className="font-medium text-ink">
                {formatTime(selected.timeSpentSeconds)}
              </p>
              <p>{t('timeTaken')}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">
          {retryAvailable && (
            <Link href={testHref ?? `/student/test/${instanceId}`}>
              <Button>
                {attempts.some((attempt) => attempt.status === 'in_progress')
                  ? t('continueAttempt')
                  : t('retryTest')}
              </Button>
            </Link>
          )}
        <Link href={homeHref}>
          <Button variant="secondary">{t('backHome')}</Button>
        </Link>
        </div>
        <p className="text-sm text-mute-light">
          {t('attemptsUsed', { used: attemptsUsed, max: maxAttempts })}
        </p>
      </div>

      {/* Attempt history */}
      {attempts.length > 0 && (
        <Card className="p-5">
          <div className="mb-4">
            <h2 className="text-lg font-display font-semibold text-ink">{t('attemptHistory')}</h2>
            <p className="text-sm text-mute-light">{t('attemptHistoryDesc')}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline-light text-left text-xs font-semibold uppercase text-mute-light">
                  <th className="px-3 py-2">{t('colAttempt')}</th>
                  <th className="px-3 py-2">{t('colStatus')}</th>
                  <th className="px-3 py-2">{t('colScore')}</th>
                  <th className="px-3 py-2">{t('colTime')}</th>
                  <th className="px-3 py-2">{t('colSubmitted')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-light">
                {attempts.map((attempt) => {
                  const isSelectable = results.some((r) => r.id === attempt.id)
                  const isActive = attempt.id === selected.id
                  return (
                  <tr
                    key={attempt.id}
                    onClick={isSelectable ? () => selectAttempt(attempt.id) : undefined}
                    className={`transition-colors ${isSelectable ? 'cursor-pointer hover:bg-surface-soft' : ''} ${isActive ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-3 py-3 font-medium text-ink">{t('attemptLabel', { n: attempt.attemptNumber })}</td>
                    <td className="px-3 py-3">
                      {attempt.status === 'submitted' ? (
                        <Badge variant="success">{t('statusSubmitted')}</Badge>
                      ) : (
                        <Badge variant="warning">{t('statusInProgress')}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink">
                      {attempt.rawScore !== null && attempt.totalQuestions !== null
                        ? `${attempt.rawScore}/${attempt.totalQuestions}`
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-mute-light">
                      {attempt.timeSpentSeconds !== null ? formatTime(attempt.timeSpentSeconds) : '—'}
                    </td>
                    <td className="px-3 py-3 text-mute-light">
                      {attempt.submittedAt
                        ? new Date(attempt.submittedAt).toLocaleString('vi-VN')
                        : '—'}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {canReview && selected.skillBreakdown.length > 0 && (
        <Card className="p-5">
          <div className="mb-4">
            <h2 className="text-lg font-display font-semibold text-ink">{t('skillBreakdown')}</h2>
            <p className="text-sm text-mute-light">{t('skillBreakdownDesc')}</p>
          </div>
          <div className="space-y-3">
            {selected.skillBreakdown.map((skill) => {
              const percentage = Math.round((skill.correct / skill.total) * 100)
              return (
                <div key={skill.name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium text-ink">{skill.name}</span>
                    <span className="text-mute-light">
                      {skill.correct}/{skill.total} {t('correctLabel')} · {percentage}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-soft">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Answer review table */}
      {canReview ? (
      <div>
        <h2 className="text-lg font-display font-semibold text-ink mb-4">
          {t('answerReview')}
        </h2>
        <div className="overflow-x-auto rounded-card border border-hairline-light">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline-light bg-surface-soft">
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase">{t('colQuestion')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase">{t('colYourAnswer')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase">{t('colCorrectAnswer')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase">{t('colResult')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase">{t('colTime')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase">{t('colAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light">
              {selected.answers.map((a) => (
                <tr key={a.questionId} className="hover:bg-surface-soft transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{a.index}</td>
                  <td className="max-w-[220px] px-4 py-3 text-mute-light">
                    <span className="line-clamp-2">{getStudentAnswerLabel(a, t('skipped'))}</span>
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-ink">
                    <span className="line-clamp-2">{getCorrectAnswerLabel(a)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {a.isCorrect === true ? (
                      <Badge variant="success">{t('correct')}</Badge>
                    ) : a.isCorrect === false ? (
                      <Badge variant="error">{t('wrong')}</Badge>
                    ) : (
                      <Badge variant="muted">{t('skipped')}</Badge>
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
                      {t('review')}
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
            {t('answerReview')}
          </h2>
          <p className="text-sm text-mute-light">{t('reviewLockedDesc')}</p>
        </Card>
      )}

      {/* Review modal */}
      {canReview && reviewAnswer && (
        <Modal
          open={!!reviewAnswer}
          onClose={() => setReviewAnswer(null)}
          title={t('questionTitle', { n: reviewAnswer.index })}
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
                          {t('correctAnswer')}
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
                  <p className="text-xs text-mute-light mb-1">{t('yourAnswerLabel')}</p>
                  <p className="text-sm text-ink">{reviewAnswer.answerText ?? t('skippedAnswer')}</p>
                </div>
                <div className="px-4 py-3 rounded-card border border-green-300 bg-green-50">
                  <p className="text-xs text-green-700 mb-1">{t('correctAnswerLabel')}</p>
                  <p className="text-sm text-ink">
                    {reviewAnswer.question.acceptedAnswers.join(', ')}
                  </p>
                </div>
              </div>
            )}

            {/* Explanations */}
            {reviewAnswer.question?.teacherExplanation && (
              <div className="px-4 py-3 rounded-card border border-primary/20 bg-blue-50">
                <p className="text-xs text-primary font-medium mb-1">{t('teacherExplanation')}</p>
                <div
                  className="prose prose-sm max-w-none text-sm text-ink [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: renderMathInHtml(reviewAnswer.question.teacherExplanation) }}
                />
              </div>
            )}

            {reviewAnswer.question?.aiExplanation && (
              <div className="px-4 py-3 rounded-card border border-violet-200 bg-violet-50">
                <p className="text-xs text-violet-700 font-medium mb-1">{t('aiExplanation')}</p>
                <div
                  className="prose prose-sm max-w-none text-sm text-ink [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: renderMathInHtml(reviewAnswer.question.aiExplanation) }}
                />
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
