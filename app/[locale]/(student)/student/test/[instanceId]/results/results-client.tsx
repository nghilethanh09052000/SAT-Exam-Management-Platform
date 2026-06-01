'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Modal } from '@/components/ui/modal'
import { stripHtmlToText } from '@/lib/html-text'
import { RichHtml } from '@/lib/rich-html'

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
  homeLabel?: string
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
  return selected ? `${selected.label}. ${stripHtmlToText(selected.content)}` : skippedLabel
}

function getCorrectAnswerLabel(answer: AnswerData) {
  if (!answer.question) return '—'
  if (answer.question.type === 'short_answer') {
    return answer.question.acceptedAnswers.join(', ') || '—'
  }

  const correct = answer.question.options.find((option) => option.is_correct)
  return correct ? `${correct.label}. ${stripHtmlToText(correct.content)}` : '—'
}

/** Where the score sits on the 0–100 scale decides the ring colour + praise. */
function scoreBand(pct: number) {
  if (pct >= 80) return 'high' as const
  if (pct >= 50) return 'mid' as const
  return 'low' as const
}

const bandTheme = {
  high: { ring: '#22c55e', soft: '#eafaf1', blob: 'bg-[#65d6c4]/25', text: 'text-[#16a34a]' },
  mid: { ring: '#4f7cff', soft: '#eef3ff', blob: 'bg-[#7c4dff]/20', text: 'text-[#4f68f5]' },
  low: { ring: '#f97316', soft: '#fff4e6', blob: 'bg-[#ffb84d]/25', text: 'text-[#ea580c]' },
}

/** SVG donut ring showing accuracy. Animates via stroke-dashoffset only. */
function ScoreRing({ pct, color, label }: { pct: number; color: string; label: string }) {
  const radius = 78
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="relative h-48 w-48 shrink-0">
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#edf0f7" strokeWidth="14" />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.34,1.56,0.64,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-black tracking-tight text-[#232635] tabular-nums">{pct}</span>
        <span className="text-sm font-bold text-[#9aa2b6]">%</span>
        <span className="mt-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#aab1c4]">{label}</span>
      </div>
    </div>
  )
}

function StatChip({
  value,
  label,
  tone,
  icon,
}: {
  value: string | number
  label: string
  tone: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-white/70 px-4 py-3 shadow-sm shadow-blue-100/50 backdrop-blur">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-md ${tone}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xl font-black leading-none text-[#232635] tabular-nums">{value}</p>
        <p className="mt-1 text-xs font-bold text-[#8a91a3]">{label}</p>
      </div>
    </div>
  )
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
  homeLabel,
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
  const band = scoreBand(percentage)
  const theme = bandTheme[band]
  const praise = band === 'high' ? t('praiseHigh') : band === 'mid' ? t('praiseMid') : t('praiseLow')
  const wrongCount = Math.max(0, selected.totalQuestions - selected.rawScore)
  const isContinue = attempts.some((attempt) => attempt.status === 'in_progress')

  return (
    <div className="space-y-8">
      {/* Header + back navigation */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href={homeHref}
            className="group mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-[#7b8295] transition-colors hover:text-[#4f68f5]"
          >
            <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {homeLabel ?? t('back')}
          </Link>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6d7cff]">{t('resultsEyebrow')}</p>
          <h1 className="mt-2 text-pretty text-3xl font-black tracking-tight text-[#232635] md:text-4xl">
            {assignmentTitle}
          </h1>
          <p className="mt-1 text-sm font-semibold text-[#8a91a3]">
            {t('attempt', { n: selected.attemptNumber })}
          </p>
        </div>

        {/* Attempt switcher — only when there's more than one attempt to review */}
        {results.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => selectAttempt(r.id)}
                className={`rounded-full px-4 py-2 text-sm font-black transition-all duration-200 active:scale-95 ${
                  r.id === selected.id
                    ? 'bg-gradient-to-r from-[#4f7cff] to-[#7c4dff] text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-white/80 text-[#5b72f6] shadow-sm hover:-translate-y-0.5'
                }`}
              >
                {t('attemptLabel', { n: r.attemptNumber })}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Score hero */}
      <section className="relative overflow-hidden rounded-[34px] border border-white/80 bg-white/90 p-7 shadow-sm shadow-blue-100/70 backdrop-blur md:p-9">
        <div className={`pointer-events-none absolute -right-10 -top-12 h-52 w-52 rounded-full blur-3xl ${theme.blob}`} />
        <div className="pointer-events-none absolute -bottom-16 left-24 h-48 w-48 rounded-full bg-[#ffd15c]/15 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="flex items-center justify-center lg:justify-start">
            <ScoreRing pct={percentage} color={theme.ring} label={t('overview')} />
          </div>

          <div>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-black ${theme.text}`}
              style={{ backgroundColor: theme.soft }}
            >
              <span className="text-base" aria-hidden>
                {band === 'high' ? '★' : band === 'mid' ? '✦' : '◆'}
              </span>
              {praise}
            </span>
            <p className="mt-4 flex items-baseline gap-1 font-black tracking-tight text-[#232635]">
              <span className="text-6xl tabular-nums md:text-7xl">{selected.rawScore}</span>
              <span className="text-2xl text-[#aab1c4] md:text-3xl">/ {selected.totalQuestions}</span>
            </p>
            <p className="mt-1 text-base font-semibold text-[#778095]">{t('accuracy', { pct: percentage })}</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatChip
                value={selected.rawScore}
                label={t('correct')}
                tone="bg-gradient-to-br from-[#22c55e] to-[#14b8a6]"
                icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" /></svg>}
              />
              <StatChip
                value={wrongCount}
                label={t('wrong')}
                tone="bg-gradient-to-br from-[#fb7185] to-[#ef4444]"
                icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" /></svg>}
              />
              <StatChip
                value={formatTime(selected.timeSpentSeconds)}
                label={t('timeTaken')}
                tone="bg-gradient-to-br from-[#4f7cff] to-[#7c4dff]"
                icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" /></svg>}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {retryAvailable && (
            <Link
              href={testHref ?? `/student/test/${instanceId}`}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-[#4f7cff] to-[#7c4dff] px-7 text-base font-black text-white shadow-lg shadow-indigo-500/20 transition-transform duration-200 hover:scale-105 active:scale-95"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M5 9a7 7 0 0 1 12-2m2 8a7 7 0 0 1-12 2" /></svg>
              {isContinue ? t('continueAttempt') : t('retryTest')}
            </Link>
          )}
          <Link
            href={homeHref}
            className="inline-flex h-12 items-center gap-2 rounded-full border border-[#e4e9f5] bg-white px-7 text-base font-black text-[#3d4351] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
          >
            {homeLabel ?? t('backHome')}
          </Link>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-[#697083] shadow-sm backdrop-blur">
          <span className="h-2.5 w-2.5 rounded-full bg-[#4f7cff]" />
          {t('attemptsUsed', { used: attemptsUsed, max: maxAttempts })}
        </div>
      </div>

      {/* Skill breakdown */}
      {canReview && selected.skillBreakdown.length > 0 && (
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-sm shadow-blue-100/60 backdrop-blur">
          <div className="bg-gradient-to-r from-white via-[#f7fbff] to-[#fff8e7] px-6 py-5">
            <h2 className="text-xl font-black text-[#252837]">{t('skillBreakdown')}</h2>
            <p className="mt-1 text-sm font-semibold text-[#8a91a3]">{t('skillBreakdownDesc')}</p>
          </div>
          <div className="space-y-5 p-6">
            {selected.skillBreakdown.map((skill) => {
              const pct = skill.total > 0 ? Math.round((skill.correct / skill.total) * 100) : 0
              return (
                <div key={skill.name} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-black text-[#3d4351]">{skill.name}</span>
                    <span className="font-bold text-[#8a91a3] tabular-nums">
                      {skill.correct}/{skill.total} {t('correctLabel')} · {pct}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#edf0f7]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#4f7cff] via-[#22c55e] to-[#ffd15c] transition-[width] duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Answer review */}
      {canReview ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-black text-[#252837]">{t('answerReview')}</h2>
            <p className="mt-1 text-sm font-semibold text-[#8a91a3]">
              {selected.answers.length} {t('questionsLabel')}
            </p>
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-[24px] border border-white/80 bg-white/90 shadow-sm shadow-blue-100/60 backdrop-blur md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f6f8fe] text-left text-xs font-black uppercase tracking-[0.08em] text-[#8c94a8]">
                  <th className="px-5 py-3.5">{t('colQuestion')}</th>
                  <th className="px-5 py-3.5">{t('colYourAnswer')}</th>
                  <th className="px-5 py-3.5">{t('colCorrectAnswer')}</th>
                  <th className="px-5 py-3.5">{t('colResult')}</th>
                  <th className="px-5 py-3.5">{t('colTime')}</th>
                  <th className="px-5 py-3.5 text-right">{t('colAction')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2f8]">
                {selected.answers.map((a) => (
                  <tr key={a.questionId} className="group transition-colors hover:bg-[#f9fbff]">
                    <td className="px-5 py-4">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#eef3ff] text-sm font-black text-[#5368f6] tabular-nums">
                        {a.index}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-5 py-4 font-semibold text-[#6a7286]">
                      <span className="line-clamp-2">{getStudentAnswerLabel(a, t('skipped'))}</span>
                    </td>
                    <td className="max-w-[220px] px-5 py-4 font-semibold text-[#3d4351]">
                      <span className="line-clamp-2">{getCorrectAnswerLabel(a)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <ResultPill state={a.isCorrect} correctLabel={t('correct')} wrongLabel={t('wrong')} skippedLabel={t('skipped')} />
                    </td>
                    <td className="px-5 py-4 font-semibold text-[#9aa2b6] tabular-nums">
                      {a.timeSpent ? formatTime(a.timeSpent) : '—'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setReviewAnswer(a)}
                        className="rounded-full px-3 py-1.5 text-sm font-black text-[#4f68f5] transition-colors hover:bg-[#eef3ff]"
                      >
                        {t('review')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {selected.answers.map((a) => (
              <button
                key={a.questionId}
                onClick={() => setReviewAnswer(a)}
                className="flex w-full items-center gap-3 rounded-[20px] border border-white/80 bg-white/90 p-4 text-left shadow-sm shadow-blue-100/50 backdrop-blur transition-transform active:scale-[0.99]"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef3ff] text-sm font-black text-[#5368f6] tabular-nums">
                  {a.index}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#3d4351]">{getStudentAnswerLabel(a, t('skipped'))}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[#9aa2b6]">
                    {a.timeSpent ? formatTime(a.timeSpent) : '—'}
                  </p>
                </div>
                <ResultPill state={a.isCorrect} correctLabel={t('correct')} wrongLabel={t('wrong')} skippedLabel={t('skipped')} />
                <svg className="h-4 w-4 shrink-0 text-[#c0c5d2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="flex items-start gap-4 rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-sm shadow-blue-100/60 backdrop-blur">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff4e6] text-[#f97316]">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          </span>
          <div>
            <h2 className="text-lg font-black text-[#252837]">{t('answerReview')}</h2>
            <p className="mt-1 text-sm font-semibold text-[#8a91a3]">{t('reviewLockedDesc')}</p>
          </div>
        </section>
      )}

      {/* Attempt history */}
      {attempts.length > 1 && (
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-sm shadow-blue-100/60 backdrop-blur">
          <div className="bg-gradient-to-r from-white via-[#f7fbff] to-[#fff8e7] px-6 py-5">
            <h2 className="text-xl font-black text-[#252837]">{t('attemptHistory')}</h2>
            <p className="mt-1 text-sm font-semibold text-[#8a91a3]">{t('attemptHistoryDesc')}</p>
          </div>
          <div className="overflow-x-auto p-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-black uppercase tracking-[0.08em] text-[#8c94a8]">
                  <th className="px-4 py-3">{t('colAttempt')}</th>
                  <th className="px-4 py-3">{t('colStatus')}</th>
                  <th className="px-4 py-3">{t('colScore')}</th>
                  <th className="px-4 py-3">{t('colTime')}</th>
                  <th className="px-4 py-3">{t('colSubmitted')}</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((attempt) => {
                  const isSelectable = results.some((r) => r.id === attempt.id)
                  const isActive = attempt.id === selected.id
                  return (
                    <tr
                      key={attempt.id}
                      onClick={isSelectable ? () => selectAttempt(attempt.id) : undefined}
                      className={`transition-colors ${isSelectable ? 'cursor-pointer hover:bg-[#f9fbff]' : ''} ${isActive ? 'bg-[#eef3ff]' : ''}`}
                    >
                      <td className="rounded-l-2xl px-4 py-3.5 font-black text-[#3d4351]">{t('attemptLabel', { n: attempt.attemptNumber })}</td>
                      <td className="px-4 py-3.5">
                        {attempt.status === 'submitted' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eafaf1] px-2.5 py-1 text-xs font-black text-[#16a34a]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />{t('statusSubmitted')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff6df] px-2.5 py-1 text-xs font-black text-[#d97706]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />{t('statusInProgress')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-[#3d4351] tabular-nums">
                        {attempt.rawScore !== null && attempt.totalQuestions !== null
                          ? `${attempt.rawScore}/${attempt.totalQuestions}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-[#9aa2b6] tabular-nums">
                        {attempt.timeSpentSeconds !== null ? formatTime(attempt.timeSpentSeconds) : '—'}
                      </td>
                      <td className="rounded-r-2xl px-4 py-3.5 font-semibold text-[#9aa2b6]">
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
        </section>
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
            <RichHtml
              html={reviewAnswer.question?.content ?? ''}
              className="prose prose-sm max-w-none text-base text-[#232635] [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full"
            />

            {/* Options */}
            {reviewAnswer.question?.type === 'multiple_choice' && (
              <div className="space-y-2">
                {reviewAnswer.question.options.map((opt) => {
                  const isSelected = opt.id === reviewAnswer.selectedOptionId
                  const isCorrect = opt.is_correct

                  return (
                    <div
                      key={opt.id}
                      className={`flex items-start gap-3 rounded-2xl border-2 px-4 py-3 ${
                        isCorrect
                          ? 'border-[#86efac] bg-[#f0fdf4]'
                          : isSelected
                          ? 'border-[#fca5a5] bg-[#fef2f2]'
                          : 'border-[#eceff5] bg-white'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                          isCorrect
                            ? 'bg-[#22c55e] text-white'
                            : isSelected
                            ? 'bg-[#ef4444] text-white'
                            : 'bg-[#eef0f5] text-[#8a91a3]'
                        }`}
                      >
                        {opt.label}
                      </span>
                      <RichHtml
                        html={opt.content}
                        className="prose prose-sm max-w-none flex-1 text-sm text-[#3d4351] [&_p]:m-0 [&_img]:my-1 [&_img]:h-auto [&_img]:max-w-full"
                      />
                      {isCorrect && (
                        <span className="ml-auto shrink-0 text-xs font-black text-[#16a34a]">
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
                <div className="rounded-2xl border border-[#eceff5] bg-[#f7f8fb] px-4 py-3">
                  <p className="mb-1 text-xs font-black uppercase tracking-wide text-[#9aa2b6]">{t('yourAnswerLabel')}</p>
                  <p className="text-sm text-[#3d4351]">{reviewAnswer.answerText ?? t('skippedAnswer')}</p>
                </div>
                <div className="rounded-2xl border border-[#86efac] bg-[#f0fdf4] px-4 py-3">
                  <p className="mb-1 text-xs font-black uppercase tracking-wide text-[#16a34a]">{t('correctAnswerLabel')}</p>
                  <p className="text-sm text-[#3d4351]">
                    {reviewAnswer.question.acceptedAnswers.join(', ')}
                  </p>
                </div>
              </div>
            )}

            {/* Explanations */}
            {reviewAnswer.question?.teacherExplanation && (
              <div className="rounded-2xl border border-[#c7d7ff] bg-[#eff5ff] px-4 py-3">
                <p className="mb-1 text-xs font-black uppercase tracking-wide text-[#4f68f5]">{t('teacherExplanation')}</p>
                <RichHtml
                  html={reviewAnswer.question.teacherExplanation}
                  className="prose prose-sm max-w-none text-sm text-[#3d4351] [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full"
                />
              </div>
            )}

            {reviewAnswer.question?.aiExplanation && (
              <div className="rounded-2xl border border-[#ddd6fe] bg-[#f5f3ff] px-4 py-3">
                <p className="mb-1 text-xs font-black uppercase tracking-wide text-[#7c3aed]">{t('aiExplanation')}</p>
                <RichHtml
                  html={reviewAnswer.question.aiExplanation}
                  className="prose prose-sm max-w-none text-sm text-[#3d4351] [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full"
                />
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function ResultPill({
  state,
  correctLabel,
  wrongLabel,
  skippedLabel,
}: {
  state: boolean | null
  correctLabel: string
  wrongLabel: string
  skippedLabel: string
}) {
  if (state === true) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eafaf1] px-2.5 py-1 text-xs font-black text-[#16a34a]">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" /></svg>
        {correctLabel}
      </span>
    )
  }
  if (state === false) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fef2f2] px-2.5 py-1 text-xs font-black text-[#dc2626]">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" /></svg>
        {wrongLabel}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[#f1f3f8] px-2.5 py-1 text-xs font-black text-[#9aa2b6]">
      {skippedLabel}
    </span>
  )
}
