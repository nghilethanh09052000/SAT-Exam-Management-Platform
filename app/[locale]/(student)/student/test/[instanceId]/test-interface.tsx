'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { TestLayout } from '@/components/test/test-layout'
import { QuestionDisplay } from '@/components/test/question-display'
import { NavPanel } from '@/components/test/nav-panel'
import { Timer } from '@/components/test/timer'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { CongratulationModal } from '@/components/student/congratulation-modal'
import {
  SAT_SECTION_BREAK_SECONDS,
  getSatModuleDurationSeconds,
  getSatModuleSubject,
} from '@/lib/sat-test'

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
  /** Authoritative subject enum from the `questions` table
   *  ('reading_writing' | 'math'). Drives which exam tools appear.
   *  May be null for legacy rows imported before the column existed. */
  subject: string | null
  content: string
  /** Reading passage / problem context — present only when the question has a
   *  separate stimulus block (e.g. Reading & Writing passage-based questions).
   *  NULL for standalone Math questions and pure-question Reading cards. */
  stimulus: string | null
  /** The question stem ("Which choice completes…") stored separately from the
   *  passage so the right-hand panel shows only the actionable question text. */
  prompt: string | null
  module: string
  options: Option[]
}

interface HighlightState {
  text: string
  color?: string
  underline?: boolean
  underlineStyle?: 'solid' | 'dashed' | 'dotted'
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
  /** Ephemeral practice mode (topic drills): no per-answer/server persistence,
   *  grading happens on the client and the result is shown inline via the
   *  congratulation modal instead of a server-rendered results page. */
  practiceMode?: boolean
  /** Client-side answer key, keyed by questionId. Used only in practiceMode. */
  correctAnswers?: Record<string, { correctOptionId?: string | null; acceptedAnswers?: string[] }>
  /** Endpoint that records the practice completion (streak). practiceMode only. */
  completeUrl?: string
}

interface PracticeResult {
  score: { correct: number; total: number }
  streak: { current: number; longest: number; isNewDay: boolean; isMilestone: boolean }
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

function sectionTitle(moduleName: string, moduleIndex: number, mathLabel: string, rwLabel: string, prefixFn: (n: number, subject: string) => string) {
  const normalized = moduleName.toLowerCase()
  const subject = normalized.includes('math')
    ? mathLabel
    : normalized.includes('reading') || normalized.includes('writing')
      ? rwLabel
      : moduleName

  return prefixFn(moduleIndex + 1, subject)
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

/**
 * Detects the subject from the module *name* alone — more reliable than
 * scanning question content (a Reading passage can mention math concepts).
 */
function getModuleSubject(moduleName: string | null | undefined): 'math' | 'reading-writing' | 'other' {
  return getSatModuleSubject(moduleName) ?? 'other'
}

/**
 * Authoritative subject resolver. The `questions.subject` enum
 * ('reading_writing' | 'math') is the source of truth and is checked first.
 * The module name and content heuristic are fallbacks only for legacy rows
 * imported before the `subject` column existed (or when it is null).
 *
 * Normal assignments no longer store SAT module names. Practice tests pass
 * module names from exam_paper_questions; assignments rely on question subject.
 */
function resolveQuestionSubject(
  question: Question | undefined,
  moduleName: string
): 'math' | 'reading-writing' | 'other' {
  const dbSubject = question?.subject?.toLowerCase()
  if (dbSubject === 'math') return 'math'
  if (dbSubject === 'reading_writing') return 'reading-writing'

  // ── Fallbacks for legacy rows with no stored subject ──
  const moduleSubject = getModuleSubject(moduleName)
  if (moduleSubject !== 'other') return moduleSubject
  if (looksLikeMathQuestion(question, moduleName)) return 'math'
  return 'other'
}

function ExamTool({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex min-w-12 flex-col items-center justify-center gap-0.5 border-b-2 px-1 pb-1 text-[12px] font-semibold transition-colors hover:text-[#2f43c9]',
        disabled ? 'cursor-not-allowed opacity-55 hover:text-[#1a1a1a]' : '',
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
  const t = useTranslations('student.test')
  return (
    <div className="mx-10 h-9 rounded-b-[16px] bg-[#1d2877] text-center text-[13px] font-bold leading-9 text-white">
      {t('practiceBanner')}
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

function MaximizeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h6v6" />
      <path d="M20 4l-7 7" />
      <path d="M10 20H4v-6" />
      <path d="M4 20l7-7" />
    </svg>
  )
}

function CalcGraphIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13c3.5 0 4.5-9 8-9s4.5 16 8 16" />
    </svg>
  )
}

function CalcSciIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8M8 12h2.5M13.5 12H16M8 16h2.5M13.5 16H16" />
    </svg>
  )
}

function BookmarkMarker() {
  return <span className="inline-block h-6 w-4 bg-[#c43355] [clip-path:polygon(0_0,100%_0,100%_100%,50%_72%,0_100%)]" />
}

function ToolPanel({
  title,
  titleNode,
  onClose,
  children,
  align = 'left',
  className = '',
  maximized = false,
  onToggleMaximize,
}: {
  title: string
  titleNode?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
  maximized?: boolean
  onToggleMaximize?: () => void
}) {
  return (
    <div
      className={[
        maximized
          ? 'fixed inset-3 z-50 flex flex-col overflow-hidden rounded-[6px] border-2 border-[#222] bg-white shadow-2xl'
          : 'absolute top-[98px] z-40 flex max-h-[calc(100%-190px)] flex-col overflow-hidden rounded-[6px] border-2 border-[#222] bg-white shadow-2xl',
        !maximized ? (align === 'left' ? 'left-5' : 'right-5') : '',
        !maximized ? className : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="flex h-[58px] shrink-0 items-center justify-between bg-[#1b1b1b] px-5 text-white">
        {titleNode ?? <h2 className="text-[22px] font-bold">{title}</h2>}
        <div className="flex items-center gap-6">
          <span className="grid grid-cols-3 gap-1 opacity-70" aria-hidden>
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} className="h-1.5 w-1.5 rounded-full bg-white" />
            ))}
          </span>
          {onToggleMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              className="text-white/90 hover:text-white"
              aria-label={maximized ? `Restore ${title}` : `Maximize ${title}`}
            >
              <MaximizeIcon />
            </button>
          )}
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

function CalcModeToggle({
  mode,
  onChange,
}: {
  mode: 'graphing' | 'scientific'
  onChange: (mode: 'graphing' | 'scientific') => void
}) {
  const t = useTranslations('student.test')
  const segment = (key: 'graphing' | 'scientific', label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onChange(key)}
      aria-pressed={mode === key}
      className={[
        'flex items-center gap-2 rounded-[7px] px-3 py-1.5 text-[15px] font-bold transition-colors',
        mode === key ? 'bg-white text-[#1b1b1b] underline underline-offset-2' : 'text-white hover:bg-white/10',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  )
  return (
    <div className="flex items-center gap-1 rounded-[9px] border border-white/60 p-1">
      {segment('graphing', t('calcGraphing'), <CalcGraphIcon />)}
      {segment('scientific', t('calcScientific'), <CalcSciIcon />)}
    </div>
  )
}

// Public Desmos API key documented for embedding. Swap for your own free key
// from https://www.desmos.com/api before going to production.
const DESMOS_API_KEY = 'dcb31709b452b1cf9dc26972add0fda6'
const DESMOS_SRC = `https://www.desmos.com/api/v1.11/calculator.js?apiKey=${DESMOS_API_KEY}`

/** Loads the Desmos API script once and resolves when `window.Desmos` is ready. */
function loadDesmos(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  const w = window as any
  if (w.Desmos) return Promise.resolve(w.Desmos)
  if (w.__desmosPromise) return w.__desmosPromise
  w.__desmosPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = DESMOS_SRC
    script.async = true
    script.onload = () => resolve(w.Desmos)
    script.onerror = () => reject(new Error('Failed to load Desmos'))
    document.head.appendChild(script)
  })
  return w.__desmosPromise
}

function CalculatorPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('student.test')
  const [mode, setMode] = useState<'graphing' | 'scientific'>('graphing')
  const [maximized, setMaximized] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let calc: any
    let cancelled = false
    const host = hostRef.current
    if (!host) return
    loadDesmos()
      .then((Desmos) => {
        if (cancelled || !hostRef.current) return
        calc =
          mode === 'graphing'
            ? Desmos.GraphingCalculator(hostRef.current, { expressions: true, settingsMenu: true })
            : Desmos.ScientificCalculator(hostRef.current)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (calc) calc.destroy()
    }
  }, [mode])

  return (
    <ToolPanel
      title={t('calculator')}
      titleNode={<CalcModeToggle mode={mode} onChange={setMode} />}
      onClose={onClose}
      maximized={maximized}
      onToggleMaximize={() => setMaximized((value) => !value)}
      className="h-[560px] w-[min(680px,calc(100%-2.5rem))]"
    >
      <div ref={hostRef} key={mode} className="min-h-0 flex-1 bg-white" />
    </ToolPanel>
  )
}

/** Compact geometry diagrams for the math reference sheet. */
function RefShape({ shape }: { shape: string }) {
  const common = { fill: 'none', stroke: '#111', strokeWidth: 2, strokeLinejoin: 'round' as const }
  const label = (x: number, y: number, text: string, size = 13) => (
    <text x={x} y={y} fontFamily="Georgia, serif" fontStyle="italic" fontSize={size} fill="#111">{text}</text>
  )
  switch (shape) {
    case 'circle':
      return (
        <svg viewBox="0 0 90 70" className="h-[80px] w-[104px]">
          <circle cx="45" cy="35" r="26" {...common} />
          <circle cx="45" cy="35" r="2.5" fill="#111" />
          <line x1="45" y1="35" x2="71" y2="35" stroke="#111" strokeWidth="1.5" />
          {label(55, 30, 'r')}
        </svg>
      )
    case 'rectangle':
      return (
        <svg viewBox="0 0 90 70" className="h-[80px] w-[104px]">
          <rect x="18" y="20" width="54" height="30" {...common} />
          {label(42, 15, 'ℓ')}
          {label(75, 38, 'w')}
        </svg>
      )
    case 'triangle':
      return (
        <svg viewBox="0 0 96 84" className="block h-[116px] w-[150px]">
          <path d="M20 58 L48 12 L76 58 Z" {...common} />
          <line x1="48" y1="12" x2="48" y2="58" stroke="#111" strokeWidth="1.2" strokeDasharray="3 3" />
          <path d="M48 53 h5 v5" {...common} strokeWidth="1.2" />
          {label(65, 37, 'h')}
          {label(45, 76, 'b')}
        </svg>
      )
    case 'right':
      return (
        <svg viewBox="0 0 98 84" className="block h-[116px] w-[150px]">
          <path d="M22 58 L22 14 L78 58 Z" {...common} />
          <path d="M22 50 h8 v8" {...common} strokeWidth="1.2" />
          {label(9, 38, 'b')}
          {label(62, 31, 'c')}
          {label(49, 76, 'a')}
        </svg>
      )
    case 'tri306090':
      return (
        <svg viewBox="0 0 178 122" className="block h-[138px] w-[220px]">
          <path d="M18 90 L134 90 L134 24 Z" {...common} />
          <path d="M134 80 h-10 v10" {...common} strokeWidth="1.2" />
          {label(60, 45, '2x')}
          {label(104, 58, '60°')}
          {label(143, 64, 'x')}
          {label(38, 84, '30°')}
          {label(61, 112, 'x√3')}
        </svg>
      )
    case 'tri454590':
      return (
        <svg viewBox="0 0 138 112" className="block h-[164px] w-[206px]">
          <path d="M30 88 L30 18 L100 88 Z" {...common} />
          <path d="M30 78 h10 v10" {...common} strokeWidth="1.2" />
          {label(12, 58, 's')}
          {label(33, 45, '45°', 10)}
          {label(60, 40, 's√2')}
          {label(70, 82, '45°', 10)}
          {label(62, 106, 's')}
        </svg>
      )
    case 'rectprism':
      return (
        <svg viewBox="0 0 124 94" className="block h-[108px] w-[140px]">
          <path d="M18 42 H78 V76 H18 Z" {...common} />
          <path d="M18 42 L40 24 H100 L78 42" {...common} />
          <path d="M78 76 L100 58 V24" {...common} />
          {label(36, 88, 'ℓ')}
          {label(90, 73, 'w')}
          {label(106, 48, 'h')}
        </svg>
      )
    case 'cylinder':
      return (
        <svg viewBox="0 0 124 94" className="block h-[108px] w-[140px]">
          <ellipse cx="58" cy="24" rx="32" ry="11" {...common} />
          <path d="M26 24 V70" {...common} />
          <path d="M90 24 V70" {...common} />
          <path d="M26 70 a32 11 0 0 0 64 0" {...common} />
          <circle cx="58" cy="24" r="2.5" fill="#111" />
          <line x1="58" y1="24" x2="84" y2="19" stroke="#111" strokeWidth="1.2" />
          {label(72, 15, 'r')}
          {label(96, 52, 'h')}
        </svg>
      )
    case 'sphere':
      return (
        <svg viewBox="0 0 124 94" className="block h-[108px] w-[140px]">
          <circle cx="62" cy="48" r="36" {...common} />
          <ellipse cx="62" cy="48" rx="36" ry="12" stroke="#111" strokeWidth="1.2" fill="none" strokeDasharray="3 3" />
          <circle cx="62" cy="48" r="2.5" fill="#111" />
          <line x1="62" y1="48" x2="98" y2="48" stroke="#111" strokeWidth="1.2" />
          {label(77, 35, 'r')}
        </svg>
      )
    case 'cone':
      return (
        <svg viewBox="0 0 124 104" className="block h-[118px] w-[140px]">
          <path d="M62 14 L30 76 M62 14 L94 76" {...common} />
          <ellipse cx="62" cy="76" rx="32" ry="10" {...common} />
          <line x1="62" y1="14" x2="62" y2="76" stroke="#111" strokeWidth="1.2" strokeDasharray="3 3" />
          <line x1="62" y1="76" x2="94" y2="76" stroke="#111" strokeWidth="1.2" strokeDasharray="3 3" />
          {label(66, 51, 'h')}
          {label(76, 72, 'r')}
        </svg>
      )
    case 'pyramid':
      return (
        <svg viewBox="0 0 124 108" className="block h-[122px] w-[140px]">
          <path d="M62 14 L22 82 L88 82 Z" {...common} />
          <path d="M62 14 L102 64 L88 82" {...common} />
          <path d="M22 82 L64 94 L102 64" stroke="#111" strokeWidth="1.2" strokeDasharray="3 3" fill="none" />
          <line x1="62" y1="14" x2="64" y2="94" stroke="#111" strokeWidth="1.2" strokeDasharray="3 3" />
          {label(68, 57, 'h')}
          {label(41, 101, 'ℓ')}
          {label(94, 83, 'w')}
        </svg>
      )
    default:
      return null
  }
}

function FormulaDiagram({
  shape,
  formula,
  className = '',
}: {
  shape: string
  formula: React.ReactNode
  className?: string
}) {
  return (
    <div className={['flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-[4px] bg-white p-2 text-center', className].join(' ')}>
      <RefShape shape={shape} />
      <p className="font-serif text-[20px]">{formula}</p>
    </div>
  )
}

function ReferencePanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('student.test')
  const [maximized, setMaximized] = useState(false)
  return (
    <ToolPanel
      title={t('refSheet')}
      onClose={onClose}
      align="right"
      maximized={maximized}
      onToggleMaximize={() => setMaximized((value) => !value)}
      className="bottom-[92px] w-[min(520px,calc(100%-2.5rem))]"
    >
      <div className="overflow-y-auto p-7 font-serif">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <FormulaDiagram shape="circle" formula={<>A = πr²<br />C = 2πr</>} />
          <FormulaDiagram shape="rectangle" formula={<>A = ℓw</>} />
          <FormulaDiagram shape="triangle" formula={<>A = ½bh</>} />
          <FormulaDiagram shape="right" formula={<>c² = a² + b²</>} />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-x-8 place-items-center">
          <RefShape shape="tri306090" />
          <RefShape shape="tri454590" />
        </div>
        <h3 className="mt-4 text-center text-[24px] font-bold">{t('refSpecialTriangles')}</h3>

        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-7">
          <FormulaDiagram shape="rectprism" formula={<>V = ℓwh</>} className="!min-h-[168px] !gap-3" />
          <FormulaDiagram shape="cylinder" formula={<>V = πr²h</>} className="!min-h-[168px] !gap-3" />
          <FormulaDiagram shape="sphere" formula={<>V = 4⁄3 πr³</>} className="!min-h-[168px] !gap-3" />
          <FormulaDiagram shape="cone" formula={<>V = 1⁄3 πr²h</>} className="!min-h-[178px] !gap-3" />
          <FormulaDiagram shape="pyramid" formula={<>V = 1⁄3 ℓwh</>} className="!min-h-[182px] !gap-3" />
        </div>

        <div className="mt-4 space-y-2 text-[17px] leading-snug text-[#222]">
          <p>{t('refNote360')}</p>
          <p>{t('refNoteRadians')}</p>
          <p>{t('refNoteTriangle')}</p>
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
  const t = useTranslations('student.test')
  return (
    <div className="flex flex-1 overflow-y-auto bg-white px-8 py-12">
      <div className="mx-auto w-full max-w-[1210px]">
        <h1 className="text-center text-[52px] font-normal leading-tight text-[#222]">{t('checkWorkTitle')}</h1>
        <div className="mx-auto mt-12 max-w-[940px] space-y-5 text-[26px] leading-snug text-[#111]">
          <p>{t('checkWorkOnTestDay')}</p>
          <p>{t('checkWorkForPractice')}</p>
        </div>

        <div className="mx-auto mt-10 max-w-[1210px] rounded-[14px] bg-white px-12 py-12 shadow-[0_8px_36px_rgba(0,0,0,0.09)]">
          <div className="flex flex-wrap items-center justify-between gap-6 border-b border-[#bcbcbc] pb-9">
            <h2 className="text-[30px] font-bold leading-tight text-[#111]">{t('checkWorkQuestionsTitle', { section: sectionTitle })}</h2>
            <div className="flex items-center gap-8 text-[24px] text-[#111]">
              <span className="flex items-center gap-3">
                <span className="h-6 w-6 border border-dashed border-black" />
                {t('unanswered')}
              </span>
              <span className="flex items-center gap-3">
                <BookmarkMarker />
                {t('forReview')}
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

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function TestBreakScreen({
  studentName,
  onResume,
}: {
  studentName: string
  onResume: () => void
}) {
  const t = useTranslations('student.test')
  const [remaining, setRemaining] = useState(SAT_SECTION_BREAK_SECONDS)

  useEffect(() => {
    if (remaining <= 0) {
      onResume()
      return
    }
    const id = setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [onResume, remaining])

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-y-auto bg-[#222] text-white">
      <div className="grid min-h-full w-full grid-cols-[minmax(280px,0.85fr)_minmax(420px,1fr)] gap-16 px-[clamp(2rem,7vw,8rem)] py-16">
        <div className="flex min-h-[620px] flex-col justify-center">
          <div className="w-full max-w-[440px] rounded-[12px] border-2 border-white/45 px-8 py-6 text-center">
            <p className="text-[27px] font-bold leading-tight">{t('breakRemaining')}</p>
            <p className="mt-4 text-[96px] font-bold leading-none tracking-normal">{formatCountdown(remaining)}</p>
          </div>
          <button
            type="button"
            onClick={onResume}
            className="mx-auto mt-14 rounded-full bg-[#ffd900] px-8 py-4 text-[18px] font-bold text-[#111] hover:bg-[#ffe34d]"
          >
            {t('resumeTesting')}
          </button>
          <p className="mt-auto text-[28px] font-bold">{studentName}</p>
        </div>

        <div className="flex min-h-[620px] flex-col justify-center">
          <div className="max-w-[620px]">
            <h1 className="text-[48px] font-bold leading-tight">{t('practiceTestBreak')}</h1>
            <p className="mt-10 text-[25px] font-bold leading-relaxed">{t('breakIntro')}</p>
            <div className="my-12 border-t-2 border-white/80" />
            <h2 className="text-[44px] font-bold leading-tight">{t('breakTitle')}</h2>
            <p className="mt-10 text-[25px] font-bold leading-relaxed">{t('breakResumeDesc')}</p>
            <p className="mt-12 text-[24px] font-bold">{t('breakRulesTitle')}</p>
            <ol className="mt-7 space-y-5 pl-8 text-[23px] font-semibold leading-relaxed">
              <li>{t('breakRule1')}</li>
              <li>{t('breakRule2')}</li>
              <li>{t('breakRule3')}</li>
              <li>{t('breakRule4')}</li>
              <li>{t('breakRule5')}</li>
            </ol>
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
  practiceMode = false,
  correctAnswers,
  completeUrl = '/api/student/practice/complete',
}: TestInterfaceProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('student.test')
  const modules = useMemo(
    () => Array.from(new Set(questions.map((q) => q.module || t('defaultModule')))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      : questions.findIndex((q) => (q.module || t('defaultModule')) === modules[initialModuleIndex])
  )

  const [currentModuleIndex, setCurrentModuleIndex] = useState(initialModuleIndex)
  const [currentIndex, setCurrentIndex] = useState(initialQuestionIndex)
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(initialAnswers)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(null)
  const [showModuleModal, setShowModuleModal] = useState(false)
  const [showCheckWork, setShowCheckWork] = useState(false)
  const [showNavPanel, setShowNavPanel] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [showReference, setShowReference] = useState(false)
  const [showHighlightsNotes, setShowHighlightsNotes] = useState(false)
  const [showSectionBreak, setShowSectionBreak] = useState(false)
  const [moduleStartedAt, setModuleStartedAt] = useState(() => Date.now())
  const [showReportModal, setShowReportModal] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [infoModal, setInfoModal] = useState<{ title: string; body: string } | null>(null)
  const [reportText, setReportText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const dirtyQuestionIds = useRef<Set<string>>(new Set())
  const pollTimeout = useRef<NodeJS.Timeout | null>(null)
  const questionEnteredAt = useRef<number>(Date.now())
  // Set to true once submit is called so manual saves cannot race after the
  // submission status flips to grading/submitted.
  const hasSubmittedRef = useRef(false)

  const currentModule = modules[currentModuleIndex] ?? modules[0] ?? ''
  const moduleQuestionIndexes = questions
    .map((q, index) => ((q.module || t('defaultModule')) === currentModule ? index : -1))
    .filter((index) => index !== -1)
  const currentModulePosition = Math.max(0, moduleQuestionIndexes.indexOf(currentIndex))
  const currentQuestion = questions[currentIndex]
  const currentAnswer = currentQuestion ? answers[currentQuestion.questionId] ?? emptyAnswer() : emptyAnswer()
  const isLastModule = currentModuleIndex === modules.length - 1
  const isLastQuestionInModule = currentModulePosition === moduleQuestionIndexes.length - 1
  // Authoritative subject from questions.subject, with legacy fallbacks.
  const resolvedSubject = resolveQuestionSubject(currentQuestion, currentModule)
  // Math → Calculator + Reference tools
  const isMathModule = resolvedSubject === 'math'
  // Reading & Writing → Highlights & Notes tool
  const isReadingWritingModule = resolvedSubject === 'reading-writing'
  const currentSectionTitle = sectionTitle(
    currentModule,
    currentModuleIndex,
    t('sectionMath'),
    t('sectionRW'),
    (n, subject) => t('sectionPrefix', { n, subject }),
  )
  const currentSatModuleSeconds = getSatModuleDurationSeconds(currentModule)

  // Cancel any in-flight poll when the component unmounts (e.g. after navigation
  // to /results). Without this, recursive setTimeout callbacks keep firing
  // fetch calls that show the global loading spinner on the results page.
  useEffect(() => {
    return () => {
      if (pollTimeout.current) clearTimeout(pollTimeout.current)
    }
  }, [])

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

  function updateCurrentAnswer(updater: (answer: AnswerState) => AnswerState) {
    if (!currentQuestion) return
    const questionId = currentQuestion.questionId
    dirtyQuestionIds.current.add(questionId)
    // Functional update: derive from the LATEST state, never a render-time
    // closure. Otherwise two edits fired before a re-render (e.g. applying a
    // highlight colour then immediately adding a note to it) would each compute
    // from the same stale snapshot and clobber each other — which made a freshly
    // highlighted phrase vanish the moment a note was attached to it.
    setAnswers((prev) => ({
      ...prev,
      [questionId]: updater(prev[questionId] ?? emptyAnswer()),
    }))
  }

  function captureCurrentQuestionTime() {
    if (!currentQuestion) return answers
    const elapsed = Math.max(0, Math.floor((Date.now() - questionEnteredAt.current) / 1000))
    if (elapsed === 0) return answers

    const questionId = currentQuestion.questionId
    dirtyQuestionIds.current.add(questionId)
    // Functional update so we only bump the time field on the LATEST answer
    // state — never overwrite the whole answer from a stale closure (which would
    // wipe highlights/notes added since this render).
    setAnswers((prev) => {
      const base = prev[questionId] ?? emptyAnswer()
      return { ...prev, [questionId]: { ...base, timeSpentSeconds: base.timeSpentSeconds + elapsed } }
    })
    questionEnteredAt.current = Date.now()

    // Best-effort snapshot for the save payload (time tracking only).
    const base = answers[questionId] ?? emptyAnswer()
    return { ...answers, [questionId]: { ...base, timeSpentSeconds: base.timeSpentSeconds + elapsed } }
  }

  async function saveCurrentWork(options: { exitAfterSave?: boolean } = {}) {
    // Practice drills are ephemeral — nothing to persist. "Save & exit" just
    // captures elapsed time locally and navigates away.
    if (practiceMode) {
      captureCurrentQuestionTime()
      if (options.exitAfterSave) router.push(exitHref ?? `/${locale}/student`)
      return true
    }
    if (hasSubmittedRef.current || isSaving) return false
    setIsSaving(true)
    try {
      const latestAnswers = captureCurrentQuestionTime()
      const questionIdsToSave = Array.from(dirtyQuestionIds.current)
      const progressRequest = currentQuestion
        ? fetch(progressEndpoint ?? `/api/submissions/${submissionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              current_question_id: currentQuestion.questionId,
              current_module: currentModule,
            }),
          })
        : Promise.resolve(new Response(null, { status: 204 }))

      const answerRequests = questionIdsToSave.map((questionId) => {
        const answer = latestAnswers[questionId] ?? emptyAnswer()
        return fetch(answerEndpoint, {
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
      })

      const responses = await Promise.all([progressRequest, ...answerRequests])
      const failed = responses.some((response) => !response.ok)
      if (failed) return false

      dirtyQuestionIds.current.clear()
      if (options.exitAfterSave) router.push(exitHref ?? `/${locale}/student`)
      return true
    } catch {
      return false
    } finally {
      setIsSaving(false)
    }
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
    const nextQuestionIndex = questions.findIndex((q) => (q.module || t('defaultModule')) === nextModule)
    setCurrentModuleIndex(nextModuleIndex)
    setCurrentIndex(nextQuestionIndex)
    setModuleStartedAt(Date.now())
    setShowModuleModal(false)
    setShowCheckWork(false)
    setShowSectionBreak(false)
  }

  const resumeAfterSectionBreak = useCallback(() => {
    moveToNextModule()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModuleIndex, modules, questions])

  function leaveCheckWork() {
    setShowCheckWork(false)
  }

  function handleCheckWorkNext() {
    if (isLastModule) submitTest()
    else {
      const nextModule = modules[currentModuleIndex + 1]
      const shouldBreak =
        getSatModuleSubject(currentModule) === 'reading-writing' &&
        getSatModuleSubject(nextModule) === 'math'

      if (shouldBreak) {
        setShowCheckWork(false)
        setShowSectionBreak(true)
      } else {
        moveToNextModule()
      }
    }
  }

  function handleModuleTimeExpire() {
    captureCurrentQuestionTime()
    if (isLastModule) {
      submitTest()
      return
    }

    const nextModule = modules[currentModuleIndex + 1]
    if (
      getSatModuleSubject(currentModule) === 'reading-writing' &&
      getSatModuleSubject(nextModule) === 'math'
    ) {
      setShowCheckWork(false)
      setShowSectionBreak(true)
      return
    }

    moveToNextModule()
  }

  async function saveAndExit() {
    await saveCurrentWork({ exitAfterSave: true })
  }

  function submitReport() {
    // This is intentionally local for now; question context can be wired to a teacher inbox later.
    setReportText('')
    setShowReportModal(false)
  }

  async function submitTest() {
    setSubmitting(true)
    // Block manual saves immediately — the submit will flip status to 'grading'
    // and any manual save after that point would get 403.
    hasSubmittedRef.current = true

    // ── Practice drills: grade on the client, record the streak, show the
    //    congratulation modal inline (no server submission / results page). ──
    if (practiceMode) {
      const latestAnswers = captureCurrentQuestionTime()
      let correctCount = 0
      const payload = questions.map((q) => {
        const a = latestAnswers[q.questionId] ?? emptyAnswer()
        const key = correctAnswers?.[q.questionId]
        let isCorrect = false
        if (a.selectedOptionId) {
          isCorrect = Boolean(key?.correctOptionId) && key?.correctOptionId === a.selectedOptionId
        } else if (a.answerText) {
          const text = a.answerText.trim().toLowerCase()
          isCorrect = (key?.acceptedAnswers ?? []).some((ac) => ac.trim().toLowerCase() === text)
        }
        if (isCorrect) correctCount += 1
        return {
          questionId: q.questionId,
          selectedOptionId: a.selectedOptionId ?? null,
          answerText: a.answerText ?? null,
          isCorrect,
        }
      })

      try {
        const res = await fetch(completeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: payload }),
        })
        const data = (await res.json()) as {
          correctCount: number
          total: number
          streak: { current: number; longest: number; isNewDay: boolean; isMilestone: boolean }
        }
        setPracticeResult({
          score: { correct: data.correctCount, total: data.total },
          streak: data.streak,
        })
      } catch {
        // Network hiccup — still show the score, just without an updated streak.
        setPracticeResult({
          score: { correct: correctCount, total: questions.length },
          streak: { current: 0, longest: 0, isNewDay: false, isMilestone: false },
        })
      } finally {
        setSubmitting(false)
        setShowSubmitModal(false)
      }
      return
    }

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

      // 409 → submission is already 'grading' or 'submitted' (e.g. double-submit,
      // or a previously stuck submission). Navigate to results — the student
      // will see either the final score or the GradingScreen polling for it.
      if (res.status === 409) {
        router.push(resultsHref ?? `/${locale}/student/test/${instanceId}/results`)
        return
      }

      // Any other non-202 failure → surface the error and let the student retry.
      if (res.status !== 202) {
        const json = await res.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[submit] Failed:', json.error)
        setSubmitting(false)
        hasSubmittedRef.current = false  // allow resubmit after error
        return
      }

      // 202 → grading is running in a background queue (production).
      // Poll with exponential backoff: start at 300 ms so fast grading is
      // caught quickly, then slow down to avoid hammering the DB.
      // After ~20 s total the student lands on /results → GradingScreen polls further.
      const delays = [300, 500, 800, 1000, 1500, 2000, 2000, 2000, 2000, 2000, 2000, 2000]
      let attempt = 0
      const schedulePoll = () => {
        const delay = delays[Math.min(attempt, delays.length - 1)]
        pollTimeout.current = setTimeout(async () => {
          attempt++
          if (attempt > delays.length + 3) {
            router.push(resultsHref ?? `/${locale}/student/test/${instanceId}/results`)
            return
          }
          try {
            const check  = await fetch(`/api/submissions/${submissionId}`)
            const status = (await check.json()).data?.status
            if (status === 'submitted') {
              router.push(resultsHref ?? `/${locale}/student/test/${instanceId}/results`)
              router.refresh()
            } else {
              schedulePoll()
            }
          } catch {
            schedulePoll() // network blip — keep polling
          }
        }, delay)
      }
      schedulePoll()
    } catch {
      setSubmitting(false)
      setShowSubmitModal(false)
    }
  }

  let timerSeconds: number | null = null
  if (isTimed && currentSatModuleSeconds) {
    const elapsed = Math.floor((Date.now() - moduleStartedAt) / 1000)
    timerSeconds = Math.max(0, currentSatModuleSeconds - elapsed)
  } else if (isTimed && timeLimitSeconds) {
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
      {showSectionBreak ? (
        <TestBreakScreen studentName={studentName} onResume={resumeAfterSectionBreak} />
      ) : (
      <>
      <div className="shrink-0 bg-white">
        <div className="grid h-20 grid-cols-[minmax(260px,1fr)_auto_minmax(260px,1fr)] items-start gap-4 bg-[#eef2fb] px-10 pt-3">
          <div className="min-w-0">
            <span className="block truncate text-[22px] font-bold leading-tight text-black">
              {currentSectionTitle}
            </span>
            <button className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-[#222]">
              {t('directions')}
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m4 7 6 6 6-6" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col items-center">
            {isTimed && timerSeconds !== null ? (
              <Timer key={currentModule} totalSeconds={timerSeconds} onExpire={handleModuleTimeExpire} />
            ) : (
              <span className="text-[26px] font-bold leading-none text-black">--:--</span>
            )}
          </div>

          <div className="flex justify-end gap-4">
            {isMathModule ? (
              <>
                <ExamTool
                  icon={<span className="text-[21px]">▤</span>}
                  label={t('calculator')}
                  active={showCalculator}
                  onClick={() => {
                    setShowCalculator((value) => !value)
                    setShowReference(false)
                    setShowMoreMenu(false)
                  }}
                />
                <ExamTool
                  icon={<span className="font-serif text-[22px] font-bold">x²</span>}
                  label={t('reference')}
                  active={showReference}
                  onClick={() => {
                    setShowReference((value) => !value)
                    setShowCalculator(false)
                    setShowMoreMenu(false)
                  }}
                />
              </>
            ) : isReadingWritingModule ? (
              <ExamTool
                icon={<NotesIcon />}
                label={t('highlightsNotes')}
                active={showHighlightsNotes}
                onClick={() => setShowHighlightsNotes((value) => !value)}
              />
            ) : null}
            <ExamTool
              icon={<SaveIcon />}
              label={isSaving ? t('saving') : t('save')}
              onClick={() => void saveCurrentWork()}
              disabled={isSaving}
            />
            <ExamTool icon={<SettingsIcon />} label={t('settings')} />
            <ExamTool
              icon={<MoreIcon />}
              label={t('more')}
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
            stimulus={currentQuestion.stimulus}
            prompt={currentQuestion.prompt}
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
            annotationsEnabled={isReadingWritingModule && showHighlightsNotes}
          />
        )}

        {showNavPanel && (
          <NavPanel
            sectionTitle={t('checkWorkQuestionsTitle', { section: currentSectionTitle })}
            totalQuestions={moduleQuestionIndexes.length}
            currentIndex={currentModulePosition}
            answeredIndices={answeredModuleLocalIndices}
            flaggedIndices={flaggedModuleLocalIndices}
            onNavigate={(localIndex) => {
              captureCurrentQuestionTime()
              setCurrentIndex(moduleQuestionIndexes[localIndex])
              setShowCheckWork(false)
              setShowNavPanel(false)
            }}
            onClose={() => setShowNavPanel(false)}
            onGoToReview={() => {
              captureCurrentQuestionTime()
              setShowCheckWork(true)
              setShowNavPanel(false)
            }}
          />
        )}
      </div>

      {showCalculator && <CalculatorPanel onClose={() => setShowCalculator(false)} />}
      {showReference && <ReferencePanel onClose={() => setShowReference(false)} />}
      {showMoreMenu && (
        <div className="absolute right-5 top-[92px] z-50 min-w-[260px] rounded-[10px] border border-[#d6d6d6] bg-white py-2 shadow-2xl">
          {([
            ['help', 'helpBody'],
            ['shortcuts', 'shortcutsBody'],
            ['assistiveTechnology', 'assistiveTechnologyBody'],
            ['lineReader', 'lineReaderBody'],
          ] as const).map(([key, bodyKey]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setInfoModal({ title: t(key), body: t(bodyKey) })
                setShowMoreMenu(false)
              }}
              className="flex w-full items-center px-6 py-3 text-left text-[18px] font-medium text-[#1f2937] hover:bg-[#f1f3fb]"
            >
              {t(key)}
            </button>
          ))}
          <div className="my-1 border-t border-[#e2e2e2]" />
          <button
            type="button"
            onClick={() => {
              setShowReportModal(true)
              setShowMoreMenu(false)
            }}
            className="flex w-full items-center gap-3 px-6 py-3 text-left text-[18px] font-medium text-[#1f2937] hover:bg-[#f1f3fb]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#1f2937] text-base">!</span>
            {t('reportProblem')}
          </button>
          <button
            type="button"
            onClick={() => void saveAndExit()}
            disabled={isSaving}
            className="flex w-full items-center gap-3 px-6 py-3 text-left text-[18px] font-medium text-[#1f2937] hover:bg-[#f1f3fb] disabled:opacity-50"
          >
            <span className="flex h-7 w-7 items-center justify-center border-2 border-[#1f2937] text-lg">✓</span>
            {t('saveAndExit')}
          </button>
        </div>
      )}

      <Modal open={infoModal !== null} onClose={() => setInfoModal(null)} title={infoModal?.title ?? ''}>
        <div className="space-y-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{infoModal?.body}</p>
          <div className="flex justify-end">
            <Button onClick={() => setInfoModal(null)}>{t('close')}</Button>
          </div>
        </div>
      </Modal>

      <div className="shrink-0 bg-white">
        <TopStripe />
        <div className="relative grid h-16 grid-cols-[1fr_auto_1fr] items-center bg-[#eef2fb] px-10">
          <span className="text-[20px] font-bold text-black">{studentName}</span>

          <button
            onClick={() => setShowNavPanel((v) => !v)}
            className="rounded-[7px] bg-[#111] px-5 py-2 text-[15px] font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
          >
            {t('questionOf', { n: currentModulePosition + 1, total: moduleQuestionIndexes.length })}
            <span className="ml-2">{showNavPanel ? '⌄' : '⌃'}</span>
          </button>

          <div className="flex items-center justify-end gap-4">
            <Button size="sm" disabled={!showCheckWork && currentModulePosition === 0} onClick={showCheckWork ? leaveCheckWork : goToPreviousQuestion} className="min-w-[86px] rounded-full border-2 border-transparent bg-[#3857d6] py-2.5 text-[15px] font-bold text-white shadow-none hover:bg-[#1d2877] disabled:bg-[#d8d8d8]">
              {t('back')}
            </Button>
            <Button size="sm" loading={submitting && showCheckWork} onClick={showCheckWork ? handleCheckWorkNext : goToNextQuestion} className="min-w-[86px] rounded-full border-2 border-transparent bg-[#1d2877] py-2.5 text-[15px] font-bold text-white shadow-none hover:bg-[#3857d6]">
              {showCheckWork
                ? t('next')
                : isLastQuestionInModule
                ? isLastModule
                  ? t('submit')
                  : t('next')
                : t('next')}
            </Button>
          </div>
        </div>
      </div>

      <Modal open={showModuleModal} onClose={() => setShowModuleModal(false)} title={t('moduleEnd')}>
        <div className="space-y-4">
          <p className="text-sm text-ink">
            {t('moduleEndDesc', { module: currentModule })}
          </p>
          <div className="flex gap-3">
            <Button onClick={moveToNextModule}>{t('nextModule')}</Button>
            <Button variant="ghost" onClick={() => setShowModuleModal(false)}>
              {t('continueReview')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showReportModal} onClose={() => setShowReportModal(false)} title={t('reportTitle')} size="lg">
        <div className="space-y-5">
          <p className="text-base font-bold text-ink">
            {t('reportDesc')}
          </p>
          <textarea
            value={reportText}
            onChange={(event) => setReportText(event.target.value)}
            rows={6}
            autoFocus
            placeholder={t('reportPlaceholder')}
            className="w-full resize-none rounded-[8px] border-2 border-[#4b5bdc] px-4 py-3 text-base outline-none ring-4 ring-[#4b5bdc]/10"
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowReportModal(false)} className="min-w-[120px] border-2 border-black bg-white text-black hover:bg-surface-soft">
              {t('cancel')}
            </Button>
            <Button onClick={submitReport} className="min-w-[140px] bg-[#354bc6] text-white hover:bg-[#263bba]">
              {t('submit')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showSubmitModal} onClose={() => setShowSubmitModal(false)} title={t('submitConfirm')}>
        <div className="space-y-4">
          <p className="text-sm text-ink">
            {t('answeredCount', { answered: totalAnswered, total: questions.length })}
          </p>
          {unansweredCount > 0 && (
            <div className="rounded-[6px] bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-sm text-amber-800">
                {t('unansweredWarning', { count: unansweredCount })}
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <Button loading={submitting} onClick={submitTest}>
              {t('confirmSubmit')}
            </Button>
            <Button variant="ghost" onClick={() => setShowSubmitModal(false)} disabled={submitting}>
              {t('continueWorking')}
            </Button>
          </div>
        </div>
      </Modal>

      {practiceMode && (
        <CongratulationModal
          open={practiceResult !== null}
          onClose={() => router.push(exitHref ?? `/${locale}/student`)}
          score={practiceResult?.score ?? { correct: 0, total: 0 }}
          streak={practiceResult?.streak ?? { current: 0, longest: 0, isNewDay: false, isMilestone: false }}
          exerciseTitle={assignmentTitle}
        />
      )}
      </>
      )}
    </TestLayout>
  )
}
