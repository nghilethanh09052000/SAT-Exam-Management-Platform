'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { ProgressStepper } from '@/components/ui/progress-stepper'
import { CreateFlowShell } from '@/components/ui/create-flow-shell'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string
  type: string
  content: string
  difficulty: string | null
  tags: { tag: { id: string; subject: string; name: string } }[]
}

interface PaperQuestion {
  question_id: string
  module_name: string
  order_index: number
  score_weight: number
}

interface Props {
  questions: Question[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SAT_MODULES = [
  'Reading & Writing Module 1',
  'Reading & Writing Module 2',
  'Math Module 1',
  'Math Module 2',
]

const DIFFICULTY_VARIANT: Record<string, 'success' | 'warning' | 'error'> = {
  easy: 'success', medium: 'warning', hard: 'error',
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={[
      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors',
      done || active ? 'bg-primary text-white' : 'bg-surface-soft text-mute-light',
    ].join(' ')}>
      {done ? (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : n}
    </div>
  )
}

// ─── Question picker panel (per module) ───────────────────────────────────────

function ModuleQuestionPicker({
  moduleName,
  questions,
  selected,
  onToggle,
}: {
  moduleName: string
  questions: Question[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  const t = useTranslations('teacher.examPapers')
  const [search, setSearch] = useState('')
  const [diffFilter, setDiffFilter] = useState('all')

  const filtered = useMemo(() => questions.filter((q) => {
    const matchSearch = !search || q.content.toLowerCase().includes(search.toLowerCase())
    const matchDiff = diffFilter === 'all' || q.difficulty === diffFilter
    return matchSearch && matchDiff
  }), [questions, search, diffFilter])

  // Keep only questions that match the module subject
  const subjectHint = moduleName.toLowerCase().includes('math') ? 'math' : 'reading_writing'

  const suggestedFirst = useMemo(() => {
    const suggested = filtered.filter((q) =>
      q.tags?.some((t) => t.tag?.subject === subjectHint)
    )
    const rest = filtered.filter((q) => !q.tags?.some((t) => t.tag?.subject === subjectHint))
    return [...suggested, ...rest]
  }, [filtered, subjectHint])

  const selectedInModule = suggestedFirst.filter((q) => selected.has(q.id)).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mute-light"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t('searchQuestion')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-8 rounded-lg border border-ash-light text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-canvas-light text-ink placeholder:text-mute-light"
          />
        </div>
        {/* Diff filter */}
        <div className="flex gap-1">
          {[
            { val: 'all', label: t('filterAll') },
            { val: 'easy', label: t('filterEasy') },
            { val: 'medium', label: t('filterMedium') },
            { val: 'hard', label: t('filterHard') },
          ].map((opt) => (
            <button key={opt.val}
              onClick={() => setDiffFilter(opt.val)}
              className={[
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                diffFilter === opt.val ? 'bg-primary text-white' : 'bg-surface-soft text-mute-light hover:text-ink',
              ].join(' ')}>
              {opt.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-mute-light shrink-0">
          {t('selectedInModule', { count: selectedInModule })}
        </span>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
        {suggestedFirst.length === 0 ? (
          <p className="text-xs text-mute-light italic py-4 text-center">{t('noQuestionsFound')}</p>
        ) : (
          suggestedFirst.map((q) => {
            const isSelected = selected.has(q.id)
            const tag = q.tags?.[0]?.tag
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => onToggle(q.id)}
                className={[
                  'w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all text-sm',
                  isSelected
                    ? 'border-primary bg-blue-50 text-ink'
                    : 'border-ash-light bg-surface-card hover:border-primary/40 hover:bg-surface-soft text-ink',
                ].join(' ')}
              >
                {/* Checkbox */}
                <div className={[
                  'w-4 h-4 shrink-0 mt-0.5 rounded border-2 flex items-center justify-center transition-colors',
                  isSelected ? 'bg-primary border-primary' : 'border-ash text-transparent',
                ].join(' ')}>
                  {isSelected && (
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} className="w-2.5 h-2.5 text-white">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="truncate leading-snug">
                    {q.content.slice(0, 100)}{q.content.length > 100 ? '…' : ''}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {q.type === 'multiple_choice'
                      ? <Badge variant="info">{t('badgeMc')}</Badge>
                      : <Badge variant="default">{t('badgeSa')}</Badge>
                    }
                    {q.difficulty && (
                      <Badge variant={DIFFICULTY_VARIANT[q.difficulty] ?? 'default'}>
                        {q.difficulty === 'easy' ? t('filterEasy') : q.difficulty === 'medium' ? t('filterMedium') : t('filterHard')}
                      </Badge>
                    )}
                    {tag && (
                      <span className={[
                        'px-1.5 py-0.5 rounded text-[10px] font-medium',
                        tag.subject === 'math' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700',
                      ].join(' ')}>
                        {tag.name}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function NewExamPaperWizard({ questions }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('teacher.examPapers')
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: paper metadata
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [year, setYear] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)

  // Step 2: module → selected question IDs
  // Map<moduleName, Set<questionId>>
  const [moduleSelections, setModuleSelections] = useState<Map<string, Set<string>>>(() => {
    const m = new Map<string, Set<string>>()
    SAT_MODULES.forEach((mod) => m.set(mod, new Set()))
    return m
  })
  const [activeModule, setActiveModule] = useState(SAT_MODULES[0])

  // Count helpers
  const totalSelected = useMemo(() => {
    let count = 0
    moduleSelections.forEach((s) => { count += s.size })
    return count
  }, [moduleSelections])

  function toggleQuestion(questionId: string) {
    setModuleSelections((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(activeModule) ?? [])
      if (set.has(questionId)) set.delete(questionId)
      else set.add(questionId)
      next.set(activeModule, set)
      return next
    })
  }

  // All selected question IDs (union of all modules — a question can appear in only one module)
  const allSelectedIds = useMemo(() => {
    const union = new Set<string>()
    moduleSelections.forEach((s) => s.forEach((id) => union.add(id)))
    return union
  }, [moduleSelections])

  // Build final PaperQuestion list
  function buildPaperQuestions(): PaperQuestion[] {
    const rows: PaperQuestion[] = []
    SAT_MODULES.forEach((mod) => {
      let order = 0
      moduleSelections.get(mod)?.forEach((qid) => {
        rows.push({ question_id: qid, module_name: mod, order_index: order++, score_weight: 1 })
      })
    })
    return rows
  }

  async function handleSubmit() {
    setError(null)
    if (!title.trim()) { setError(t('errNoTitle')); return }
    if (totalSelected === 0) { setError(t('errNoQuestions')); return }

    setLoading(true)
    try {
      // 1. Create the practice test
      const paperRes = await fetch('/api/exam-papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          source: source.trim() || null,
          year: year ? parseInt(year, 10) : null,
          description: description.trim() || null,
          is_public: isPublic,
        }),
      })
      const paperJson = await paperRes.json()
      if (paperJson.error) { setError(paperJson.error); return }

      const paperId: string = paperJson.data.id

      // 2. Attach questions
      const qRes = await fetch(`/api/exam-papers/${paperId}/questions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: buildPaperQuestions() }),
      })
      const qJson = await qRes.json()
      if (qJson.error) { setError(qJson.error); return }

      router.push(`/${locale}/teacher/exam-papers/${paperId}`)
      router.refresh()
    } catch {
      setError(t('errGeneric'))
    } finally {
      setLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <CreateFlowShell>
    <div className="max-w-3xl">
      <PageHeader
        title={t('createTitle')}
        breadcrumbs={[
          { label: t('title'), href: '/teacher/exam-papers' },
          { label: t('breadcrumbCreate') },
        ]}
      />

      <ProgressStepper
        currentStep={step}
        onStepClick={setStep}
        steps={[
          { n: 1, label: t('step1Label') },
          { n: 2, label: t('step2Label') },
        ]}
      />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
          <p className="text-sm text-warning">{error}</p>
        </div>
      )}

      {/* ── Step 1: Paper metadata ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <Input
              label={t('labelTitle')}
              placeholder={t('titlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('labelSource')}
                placeholder={t('sourcePlaceholder')}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
              <Input
                label={t('labelYear')}
                placeholder={t('yearPlaceholder')}
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <Textarea
              label={t('labelDescription')}
              placeholder={t('descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-blue-300 text-primary focus:ring-primary"
              />
              <span>
                <span className="block text-sm font-bold text-ink">{t('freeTestLabel')}</span>
                <span className="mt-1 block text-xs font-medium leading-relaxed text-mute-light">
                  {t('freeTestDesc')}
                </span>
              </span>
            </label>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={() => {
                setError(null)
                if (!title.trim()) { setError(t('errNoTitle')); return }
                setStep(2)
              }}
            >
              {t('nextBtn')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>{t('cancelBtn')}</Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Question picker ────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700 font-medium">
              {t('exam')}: <span className="text-ink">{title}</span>
              {source && <span className="ml-2 text-blue-500">· {source}</span>}
              {year && <span className="ml-1 text-blue-500">{year}</span>}
            </p>
            <span className="text-sm font-semibold text-primary">{t('summaryQuestions', { count: totalSelected })}</span>
          </div>

          {/* Module tabs */}
          <div className="flex flex-wrap gap-1.5">
            {SAT_MODULES.map((mod) => {
              const count = moduleSelections.get(mod)?.size ?? 0
              return (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setActiveModule(mod)}
                  className={[
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    activeModule === mod
                      ? 'bg-primary border-primary text-white'
                      : 'bg-surface-soft border-ash-light text-mute-light hover:text-ink',
                  ].join(' ')}
                >
                  {mod}
                  {count > 0 && (
                    <span className={[
                      'ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                      activeModule === mod ? 'bg-white/25 text-white' : 'bg-primary text-white',
                    ].join(' ')}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Question picker for active module */}
          <Card className="p-5">
            <p className="text-sm font-semibold text-ink mb-3">{activeModule}</p>
            <ModuleQuestionPicker
              moduleName={activeModule}
              questions={questions}
              selected={moduleSelections.get(activeModule) ?? new Set()}
              onToggle={toggleQuestion}
            />
          </Card>

          {/* Module summary grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SAT_MODULES.map((mod) => {
              const count = moduleSelections.get(mod)?.size ?? 0
              const isRW = mod.toLowerCase().includes('reading')
              return (
                <div
                  key={mod}
                  className={[
                    'rounded-lg border p-3 text-center cursor-pointer transition-all',
                    activeModule === mod ? 'border-primary bg-blue-50' : 'border-ash-light bg-surface-card hover:border-primary/40',
                  ].join(' ')}
                  onClick={() => setActiveModule(mod)}
                >
                  <p className={[
                    'text-lg font-bold',
                    count > 0 ? 'text-primary' : 'text-mute-light',
                  ].join(' ')}>{count}</p>
                  <p className="text-[10px] text-mute-light mt-0.5 leading-tight">
                    {isRW ? (
                      mod.replace('Reading & Writing ', 'R&W ')
                    ) : (
                      mod.replace('Math ', 'Math ')
                    )}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSubmit} loading={loading} disabled={totalSelected === 0}>
              {t('saveExam', { count: totalSelected })}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              {t('backBtn')}
            </Button>
          </div>
        </div>
      )}
    </div>
    </CreateFlowShell>
  )
}
