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
  subject: string | null
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

const MODULE_STEP_OFFSET = 2

const DIFFICULTY_VARIANT: Record<string, 'success' | 'warning' | 'error'> = {
  easy: 'success', medium: 'warning', hard: 'error',
}

function moduleSubject(moduleName: string) {
  return moduleName.toLowerCase().includes('math') ? 'math' : 'reading_writing'
}

function indexOfModuleStep(moduleName: string) {
  return SAT_MODULES.indexOf(moduleName) + MODULE_STEP_OFFSET
}

// ─── Question picker panel (per module) ───────────────────────────────────────

function ModuleQuestionPicker({
  moduleName,
  questions,
  selected,
  selectedInSameSubject,
  onToggle,
}: {
  moduleName: string
  questions: Question[]
  selected: Set<string>
  selectedInSameSubject: Set<string>
  onToggle: (id: string) => void
}) {
  const t = useTranslations('teacher.examPapers')
  const [search, setSearch] = useState('')
  const [diffFilter, setDiffFilter] = useState('all')

  const subjectHint = moduleSubject(moduleName)

  const filtered = useMemo(() => questions.filter((q) => {
    const isCurrentSelection = selected.has(q.id)
    const alreadyUsedInSubject = selectedInSameSubject.has(q.id) && !isCurrentSelection
    const matchesSubject = q.subject === subjectHint || q.tags?.some((tag) => tag.tag?.subject === subjectHint)
    const matchSearch = !search || q.content.toLowerCase().includes(search.toLowerCase())
    const matchDiff = diffFilter === 'all' || q.difficulty === diffFilter
    return matchesSubject && !alreadyUsedInSubject && matchSearch && matchDiff
  }), [questions, search, diffFilter, selected, selectedInSameSubject, subjectHint])

  const selectedInModule = selected.size

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
        {filtered.length === 0 ? (
          <p className="text-xs text-mute-light italic py-4 text-center">{t('noQuestionsFound')}</p>
        ) : (
          filtered.map((q) => {
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

  // Step 2: module → selected question IDs
  // Map<moduleName, Set<questionId>>
  const [moduleSelections, setModuleSelections] = useState<Map<string, Set<string>>>(() => {
    const m = new Map<string, Set<string>>()
    SAT_MODULES.forEach((mod) => m.set(mod, new Set()))
    return m
  })
  const activeModule = step >= MODULE_STEP_OFFSET
    ? SAT_MODULES[step - MODULE_STEP_OFFSET] ?? SAT_MODULES[0]
    : SAT_MODULES[0]

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

  const selectedInActiveSubject = useMemo(() => {
    const subject = moduleSubject(activeModule)
    const ids = new Set<string>()
    SAT_MODULES
      .filter((mod) => moduleSubject(mod) === subject)
      .forEach((mod) => moduleSelections.get(mod)?.forEach((id) => ids.add(id)))
    return ids
  }, [activeModule, moduleSelections])

  const missingModules = useMemo(
    () => SAT_MODULES.filter((mod) => (moduleSelections.get(mod)?.size ?? 0) === 0),
    [moduleSelections]
  )

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

  function goToNextStep() {
    setError(null)
    if (step >= MODULE_STEP_OFFSET) {
      const selectedCount = moduleSelections.get(activeModule)?.size ?? 0
      if (selectedCount === 0) {
        setError(t('errModuleRequired', { module: activeModule }))
        return
      }
    }
    setStep(step + 1)
  }

  async function handleSubmit() {
    setError(null)
    if (!title.trim()) { setError(t('errNoTitle')); return }
    if (missingModules.length > 0) {
      setError(t('errAllModulesRequired', { modules: missingModules.join(', ') }))
      setStep(Math.max(MODULE_STEP_OFFSET, SAT_MODULES.indexOf(missingModules[0]) + MODULE_STEP_OFFSET))
      return
    }

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
    <div className="mx-auto w-full max-w-5xl">
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
          { n: 2, label: t('stepRw1Label') },
          { n: 3, label: t('stepRw2Label') },
          { n: 4, label: t('stepMath1Label') },
          { n: 5, label: t('stepMath2Label') },
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
          <Card className="relative overflow-hidden border border-white/80 bg-gradient-to-br from-white via-blue-50/60 to-violet-50/70 p-0 shadow-xl shadow-blue-500/5">
            <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-blue-300/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-violet-300/20 blur-3xl" />

            <div className="relative flex items-center gap-3 border-b border-white/70 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-violet-500/10 px-6 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              <div>
                <p className="text-base font-bold text-slate-800">{t('step1Label')}</p>
                <p className="text-xs text-slate-500">{t('createTitle')}</p>
              </div>
            </div>

            <div className="relative space-y-5 px-6 py-6">
              <Input
                label={t('labelTitle')}
                placeholder={t('titlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border-blue-200/70 bg-white/80 focus:border-blue-500 focus:ring-blue-400"
                required
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label={t('labelSource')}
                  placeholder={t('sourcePlaceholder')}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="border-violet-200/70 bg-white/80 focus:border-violet-500 focus:ring-violet-400"
                />
                <Input
                  label={t('labelYear')}
                  placeholder={t('yearPlaceholder')}
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="border-amber-200/70 bg-white/80 focus:border-amber-500 focus:ring-amber-400"
                />
              </div>
              <Textarea
                label={t('labelDescription')}
                placeholder={t('descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="border-emerald-200/70 bg-white/80 focus:border-emerald-500 focus:ring-emerald-400"
                rows={3}
              />
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={() => {
                setError(null)
                if (!title.trim()) { setError(t('errNoTitle')); return }
                setStep(MODULE_STEP_OFFSET)
              }}
            >
              {t('nextBtn')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>{t('cancelBtn')}</Button>
          </div>
        </div>
      )}

      {/* ── Steps 2-5: Question picker per SAT module ─────────────────────── */}
      {step >= MODULE_STEP_OFFSET && (
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

          {/* Question picker for active module */}
          <Card className="p-5">
            <p className="text-sm font-semibold text-ink mb-3">{activeModule}</p>
            <ModuleQuestionPicker
              moduleName={activeModule}
              questions={questions}
              selected={moduleSelections.get(activeModule) ?? new Set()}
              selectedInSameSubject={selectedInActiveSubject}
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
                  onClick={() => setStep(indexOfModuleStep(mod))}
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
            {step < SAT_MODULES.length + 1 ? (
              <Button onClick={goToNextStep}>
                {t('nextBtn')}
              </Button>
            ) : (
              <Button onClick={handleSubmit} loading={loading} disabled={missingModules.length > 0}>
                {t('saveExam', { count: totalSelected })}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setStep(Math.max(1, step - 1))}>
              {t('backBtn')}
            </Button>
          </div>
        </div>
      )}
    </div>
    </CreateFlowShell>
  )
}
