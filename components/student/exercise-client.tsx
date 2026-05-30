'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { CongratulationModal } from './congratulation-modal'
import { LoadingSpinner } from '@/components/ui/loading'
import { MathKeyboard } from '@/components/ui/math-keyboard'
import { renderMathInHtml } from '@/lib/math-html'
import { useAsyncAction } from '@/hooks/use-async'

interface Option {
  id: string
  label: string
  content: string
  is_correct: boolean
}

interface Question {
  id: string
  content: string
  passageText: string | null
  questionType: string
  imageUrl: string | null
  options: Option[]
  acceptedAnswers: string[]
}

interface ExerciseClientProps {
  exerciseId: string
  attemptId: string
  title: string
  questions: Question[]
  /** Override the completion endpoint. Defaults to the exercise-attempt route. */
  completeUrl?: string
  /** Where the congratulation modal returns to. Defaults to the exercises list. */
  redirectHref?: string
}

type AnswerMap = Record<string, { selectedOptionId?: string; answerText?: string }>

function renderContent(html: string) {
  return <span dangerouslySetInnerHTML={{ __html: renderMathInHtml(html) }} />
}

export function ExerciseClient({ exerciseId, attemptId, title, questions, completeUrl, redirectHref }: ExerciseClientProps) {
  const router = useRouter()
  const t = useTranslations('student.exerciseClient')
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [keyboardQuestionId, setKeyboardQuestionId] = useState<string | null>(null)
  const activeInputRef = useRef<HTMLInputElement | null>(null)
  const [modal, setModal] = useState<{
    score: { correct: number; total: number }
    streak: { current: number; longest: number; isNewDay: boolean; isMilestone: boolean }
  } | null>(null)

  const current = Object.keys(answers).length
  const total = questions.length

  const selectOption = useCallback((questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: { selectedOptionId: optionId } }))
  }, [])

  const setShortAnswer = useCallback((questionId: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: { answerText: text } }))
  }, [])

  const insertMathText = useCallback((text: string) => {
    const input = activeInputRef.current
    if (!input || !keyboardQuestionId) return
    const selStart = input.selectionStart ?? input.value.length
    const selEnd = input.selectionEnd ?? input.value.length
    const val = input.value
    const next = val.slice(0, selStart) + text + val.slice(selEnd)
    setAnswers((prev) => ({ ...prev, [keyboardQuestionId]: { answerText: next } }))
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(selStart + text.length, selStart + text.length)
    })
  }, [keyboardQuestionId])

  const deleteMathChar = useCallback(() => {
    const input = activeInputRef.current
    if (!input || !keyboardQuestionId) return
    const selStart = input.selectionStart ?? input.value.length
    const selEnd = input.selectionEnd ?? input.value.length
    const val = input.value
    const next = selStart === selEnd && selStart > 0
      ? val.slice(0, selStart - 1) + val.slice(selEnd)
      : val.slice(0, selStart) + val.slice(selEnd)
    const newPos = selStart === selEnd ? Math.max(0, selStart - 1) : selStart
    setAnswers((prev) => ({ ...prev, [keyboardQuestionId]: { answerText: next } }))
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(newPos, newPos)
    })
  }, [keyboardQuestionId])

  const { loading: submitting, run: handleSubmit } = useAsyncAction(async () => {
    try {
      const payload = questions.map((q) => {
        const ans = answers[q.id]
        let isCorrect = false
        if (q.questionType === 'multiple_choice') {
          const selected = q.options.find((o) => o.id === ans?.selectedOptionId)
          isCorrect = selected?.is_correct ?? false
        } else {
          const text = (ans?.answerText ?? '').trim().toLowerCase()
          isCorrect = q.acceptedAnswers.some((a) => a.toLowerCase() === text)
        }
        return {
          questionId: q.id,
          selectedOptionId: ans?.selectedOptionId ?? null,
          answerText: ans?.answerText ?? null,
          isCorrect,
        }
      })

      const response = await fetch(completeUrl ?? `/api/exercises/${exerciseId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, answers: payload }),
      })

      if (!response.ok) throw new Error('Failed to submit')
      const data = await response.json() as {
        correctCount: number
        total: number
        streak: { current: number; longest: number; isNewDay: boolean; isMilestone: boolean }
      }

      setModal({
        score: { correct: data.correctCount, total: data.total },
        streak: data.streak,
      })
    } catch {
      alert(t('errorAlert'))
    }
  })

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="sticky top-4 z-10 overflow-hidden rounded-2xl border border-white/80 bg-white/90 px-5 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between text-sm font-bold text-[#6a7286]">
          <span>{t('answeredCount', { answered: current, total })}</span>
          <span>{total > 0 ? Math.round((current / total) * 100) : 0}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf0f7]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#4f7cff] to-[#7c4dff] transition-all duration-500"
            style={{ width: `${total > 0 ? (current / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Questions */}
      {questions.map((q, idx) => {
        const ans = answers[q.id]
        const isAnswered = q.questionType === 'multiple_choice'
          ? Boolean(ans?.selectedOptionId)
          : Boolean(ans?.answerText?.trim())

        return (
          <div
            key={q.id}
            className={`overflow-hidden rounded-[24px] border bg-white/90 shadow-sm backdrop-blur transition-all duration-300 ${
              isAnswered ? 'border-[#4f7cff]/30' : 'border-white/80'
            }`}
          >
            {/* Question header */}
            <div className="flex items-center gap-3 border-b border-[#edf0f7] px-6 py-4">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                isAnswered
                  ? 'bg-gradient-to-br from-[#4f7cff] to-[#7c4dff] text-white'
                  : 'bg-[#edf0f7] text-[#6a7286]'
              }`}>
                {idx + 1}
              </span>
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8a91a3]">
                {t('questionLabel', { n: idx + 1, total })}
              </span>
              {isAnswered && (
                <span className="ml-auto text-[11px] font-black text-[#4f7cff]">{t('answered')}</span>
              )}
            </div>

            <div className="p-6">
              {/* Passage */}
              {q.passageText && (
                <div className="mb-5 rounded-xl border border-[#e8edf7] bg-[#f7f9ff] p-4 text-sm leading-relaxed text-[#4a5468]">
                  {renderContent(q.passageText)}
                </div>
              )}

              {/* Image */}
              {q.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.imageUrl} alt="Question image" className="mb-4 max-h-64 w-auto rounded-xl object-contain" />
              )}

              {/* Question text */}
              <div className="mb-5 text-base font-semibold leading-relaxed text-[#252837]">
                {renderContent(q.content)}
              </div>

              {/* Options or short answer */}
              {q.questionType === 'multiple_choice' ? (
                <div className="space-y-2.5">
                  {q.options.map((opt) => {
                    const selected = ans?.selectedOptionId === opt.id
                    return (
                      <button
                        key={opt.id}
                        onClick={() => selectOption(q.id, opt.id)}
                        className={`group flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition-all duration-200 ${
                          selected
                            ? 'border-[#4f7cff] bg-[#eef3ff] text-[#3358cc] shadow-sm shadow-indigo-100'
                            : 'border-[#e8edf7] bg-[#f9fafd] text-[#3d4459] hover:border-[#c5d0f7] hover:bg-[#f0f4ff]'
                        }`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-black transition-all ${
                          selected
                            ? 'border-[#4f7cff] bg-[#4f7cff] text-white'
                            : 'border-[#c8d0e0] bg-white text-[#7b8295] group-hover:border-[#4f7cff] group-hover:text-[#4f7cff]'
                        }`}>
                          {opt.label}
                        </span>
                        <span className="flex-1 leading-relaxed">{renderContent(opt.content)}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={t('answerPlaceholder')}
                    value={ans?.answerText ?? ''}
                    onChange={(e) => setShortAnswer(q.id, e.target.value)}
                    onFocus={(e) => { activeInputRef.current = e.currentTarget }}
                    className="flex-1 rounded-2xl border border-[#e0e6f7] bg-[#f7f9ff] px-4 py-3 text-sm font-medium text-[#252837] outline-none transition-all focus:border-[#4f7cff] focus:ring-2 focus:ring-[#4f7cff]/20 placeholder:text-[#9aa2b6]"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setKeyboardQuestionId(keyboardQuestionId === q.id ? null : q.id)}
                    className={[
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-lg transition-colors',
                      keyboardQuestionId === q.id
                        ? 'border-[#4f7cff] bg-[#4f7cff] text-white'
                        : 'border-[#e0e6f7] bg-[#f7f9ff] text-[#6a7286] hover:border-[#4f7cff] hover:text-[#4f7cff]',
                    ].join(' ')}
                    title="Math keyboard"
                  >
                    ⌨
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Submit */}
      <div className="flex items-center justify-between rounded-[24px] border border-white/80 bg-white/90 px-6 py-5 shadow-sm backdrop-blur">
        <div className="text-sm font-bold text-[#7b8295]">
          {current < total
            ? t('unansweredWarning', { remaining: total - current })
            : t('allAnswered')}
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting || current === 0}
          className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#4f7cff] to-[#7c4dff] px-7 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-300/40 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <LoadingSpinner className="h-4 w-4" label={t('submitting')} />
              {t('submitting')}
            </>
          ) : (
            <>
              {t('submitButton')}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>

      {modal && (
        <CongratulationModal
          open
          onClose={() => { setModal(null); router.push(redirectHref ?? '/student/exercises') }}
          score={modal.score}
          streak={modal.streak}
          exerciseTitle={title}
        />
      )}

      {keyboardQuestionId && (
        <MathKeyboard
          onInsert={insertMathText}
          onDelete={deleteMathChar}
          onClose={() => setKeyboardQuestionId(null)}
        />
      )}
    </div>
  )
}
