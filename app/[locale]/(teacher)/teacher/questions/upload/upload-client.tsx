'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAsyncAction } from '@/hooks/use-async'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { LoadingInline } from '@/components/ui/loading'
import { ProgressStepper } from '@/components/ui/progress-stepper'
import { CreateFlowShell } from '@/components/ui/create-flow-shell'
import {
  QuestionFormEditor,
  type EditableDifficulty,
  type EditableOption,
  type EditableQuestionType,
} from '@/components/questions/question-form-editor'
import { getEditorText } from '@/components/questions/rich-text-editor'
import { uploadQuestionImportFile } from '@/lib/questions/direct-question-import-upload'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tag {
  id: string
  subject: string
  name: string
}

interface ParsedOption {
  label: string
  content: string
  is_correct: boolean
  order: number
}

interface ReviewQuestion {
  content: string
  type: 'multiple_choice' | 'short_answer'
  content_hash: string
  image_url: string | null
  module: string
  options?: ParsedOption[]
  accepted_answers?: string[]
  is_duplicate: boolean
  // Teacher fills these in the review step
  tag_id: string | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  teacher_explanation: string | null
  category: string | null
  skip: boolean
  replace: boolean
}

interface ParseError {
  line?: number
  message: string
}

type QuestionImportStatus = {
  id: string
  status: 'processing' | 'parsed' | 'success' | 'partial_success' | 'failed'
  total_records: number
  success_count: number
  failure_count: number
  error_message: string | null
  parsed_payload?: {
    questions?: Array<Omit<ReviewQuestion, 'skip' | 'replace' | 'tag_id' | 'difficulty' | 'teacher_explanation' | 'category'> & {
      difficulty?: string | null
      tag_id?: string | null
      teacher_explanation?: string | null
      category?: string | null
    }>
    save_disabled_reason?: string | null
  } | null
  parse_errors?: ParseError[] | null
  save_result?: {
    saved?: number
    savedIds?: string[]
    errors?: Array<{ content: string; error: string }>
  } | null
  save_errors?: Array<{ content: string; error: string }> | null
}

const TERMINAL_IMPORT_STATUSES = new Set(['parsed', 'success', 'partial_success', 'failed'])

async function waitForQuestionImport(
  importId: string,
  isDone: (status: QuestionImportStatus) => boolean = (status) => TERMINAL_IMPORT_STATUSES.has(status.status),
  errors?: { errCheck: string; errTimeout: string }
) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const res = await fetch(`/api/question-imports/${importId}`, { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok || json.error) {
      throw new Error(json.error ?? (errors?.errCheck ?? 'Cannot check import status.'))
    }

    const status = json.data as QuestionImportStatus
    if (isDone(status)) return status
    await new Promise((resolve) => setTimeout(resolve, attempt < 15 ? 2000 : 5000))
  }

  throw new Error(errors?.errTimeout ?? 'Import is still processing. Please check again later.')
}

function toReviewQuestions(status: QuestionImportStatus): ReviewQuestion[] {
  return (status.parsed_payload?.questions ?? []).map((q) => ({
    ...q,
    tag_id: q.tag_id ?? null,
    difficulty: (q.difficulty as ReviewQuestion['difficulty']) ?? null,
    teacher_explanation: q.teacher_explanation ?? null,
    category: q.category ?? null,
    skip: false,
    replace: false,
  }))
}

function generateReviewHash(question: ReviewQuestion): string {
  const correctAnswer = question.type === 'multiple_choice'
    ? question.options?.find((opt) => opt.is_correct)?.content ?? ''
    : question.accepted_answers?.join('|') ?? ''
  const value = `${getEditorText(question.content)}${getEditorText(correctAnswer)}`
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i)
    hash |= 0
  }
  return `review-${Math.abs(hash).toString(16)}`
}

function ImportedQuestionImagePreview({ imageUrl, compact = false }: { imageUrl: string | null; compact?: boolean }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [imageUrl])

  if (!imageUrl || failed) return null

  return (
    <div className={compact ? 'mb-3 pl-10' : 'mb-4'}>
      <div className="overflow-hidden rounded-[8px] border border-slate-200 bg-white">
        <img
          src={imageUrl}
          alt="Question preview"
          loading="lazy"
          onError={() => setFailed(true)}
          className={compact
            ? 'mx-auto max-h-64 max-w-full object-contain'
            : 'mx-auto max-h-[520px] max-w-full object-contain'
          }
        />
      </div>
    </div>
  )
}

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const t = useTranslations('teacher.questions')
  return (
    <ProgressStepper
      currentStep={step}
      steps={[
        { n: 1, label: t('uploadStep1') },
        { n: 2, label: t('uploadStep2') },
        { n: 3, label: t('uploadStep3') },
      ]}
    />
  )
}

// ─── Step 1: Upload ──────────────────────────────────────────────────────────

function UploadStep({
  onParsed,
}: {
  onParsed: (questions: ReviewQuestion[], filename: string, uploadImportId: string | null) => void
}) {
  const t = useTranslations('teacher.questions')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parseErrors, setParseErrors] = useState<ParseError[]>([])
  const [useDeepSeekParser, setUseDeepSeekParser] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { loading, run: handleFile } = useAsyncAction(async (file: File) => {
    if (!file.name.endsWith('.docx') && !file.name.endsWith('.pdf')) {
      setError(t('errFileType'))
      return
    }
    setError(null)
    setParseErrors([])

    try {
      const upload = await uploadQuestionImportFile(file, {
        parserMode: useDeepSeekParser ? 'deepseek' : 'default',
      })
      const importId = upload.upload_import_id
      if (!importId) {
        setError(t('errNoImportId'))
        return
      }

      const status = await waitForQuestionImport(
        importId,
        (s) => s.status === 'parsed' || s.status === 'failed',
        { errCheck: t('errImportCheck'), errTimeout: t('errImportPending') }
      )
      if (status.status === 'failed') {
        setError(status.error_message ?? t('errParseFailed'))
        if (status.parse_errors?.length) setParseErrors(status.parse_errors)
        return
      }

      onParsed(toReviewQuestions(status), file.name, importId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errConnect'))
    }
  })

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  return (
    <div className="max-w-xl">
      <label className="mb-4 flex items-start gap-3 rounded-[8px] border border-hairline-light bg-surface-card p-4">
        <input
          type="checkbox"
          checked={useDeepSeekParser}
          disabled={loading}
          onChange={(event) => setUseDeepSeekParser(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{t('deepSeekParserToggle')}</span>
          <span className="mt-1 block text-xs leading-5 text-mute-light">{t('deepSeekParserHint')}</span>
        </span>
      </label>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !loading && inputRef.current?.click()}
        className={[
          'flex flex-col items-center justify-center gap-4 rounded-[12px] border-2 border-dashed cursor-pointer transition-colors py-16 px-8',
          dragging
            ? 'border-primary bg-blue-50'
            : 'border-ash-light hover:border-primary hover:bg-surface-card',
          loading ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        {loading ? (
          <LoadingInline
            label={t('parsingFile')}
            className="flex flex-col items-center gap-4 text-sm text-mute-light"
            spinnerClassName="h-10 w-10 text-primary"
          />
        ) : (
          <>
            <div className="w-16 h-16 rounded-[12px] bg-surface-card flex items-center justify-center">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-primary">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-medium text-ink">{t('dropZoneTitle')}</p>
              <p className="text-sm text-mute-light mt-1">{t('dropZoneHint')}</p>
            </div>
          </>
        )}
      </div>

      {/* Errors */}
      {error && (
        <div className="mt-4 rounded-[8px] bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-warning mb-2">{error}</p>
          {parseErrors.length > 0 && (
            <ul className="text-xs text-warning space-y-1 list-disc list-inside">
              {parseErrors.map((e, i) => (
                <li key={i}>
                  {e.line ? `${t('parseErrorLine', { n: e.line })} ` : ''}{e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Format guide */}
      <div className="mt-6 rounded-[8px] bg-surface-card border border-hairline-light p-4 space-y-2">
        <p className="text-xs font-semibold text-ink">{t('formatTitle')}</p>
        <ul className="text-xs text-mute-light space-y-1 list-disc list-inside">
          <li>Heading module: <code className="bg-surface-soft px-1 rounded">Module 1: Reading and Writing</code></li>
          <li>{t('formatItemQuestion')} <code className="bg-surface-soft px-1 rounded">Question N</code></li>
          <li>{t('formatItemCorrectAnswer')}</li>
          <li>Short answer: <code className="bg-surface-soft px-1 rounded">Answer:</code></li>
        </ul>
      </div>
    </div>
  )
}

// ─── Step 2: Review ──────────────────────────────────────────────────────────

function ReviewStep({
  questions,
  filename,
  uploadImportId,
  tags,
  onSaved,
  onBack,
}: {
  questions: ReviewQuestion[]
  filename: string
  uploadImportId: string | null
  tags: Tag[]
  onSaved: (saved: number) => void
  onBack: () => void
}) {
  const t = useTranslations('teacher.questions')
  const [items, setItems] = useState<ReviewQuestion[]>(questions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const rwTags = tags.filter((tag) => tag.subject === 'reading_writing')
  const mathTags = tags.filter((tag) => tag.subject === 'math')

  const taggedCount = items.filter((q) => !q.skip && q.tag_id).length
  const difficultyCount = items.filter((q) => !q.skip && q.difficulty).length
  const activeCount = items.filter((q) => !q.skip).length

  function update(idx: number, patch: Partial<ReviewQuestion>) {
    setItems((prev) => prev.map((q, i) => {
      if (i !== idx) return q
      const next = { ...q, ...patch }
      const changedAnswerShape = Boolean(patch.content || patch.options || patch.accepted_answers || patch.type)
      return {
        ...next,
        content_hash: changedAnswerShape ? generateReviewHash(next) : next.content_hash,
        is_duplicate: changedAnswerShape ? false : next.is_duplicate,
      }
    }))
  }

  const toSave = items.filter((q) => !q.skip)

  async function handleSave() {
    for (const q of toSave) {
      if (!getEditorText(q.content)) {
        setError(t('errAllContent'))
        return
      }
      if (q.type === 'multiple_choice') {
        if (!q.options?.some((opt) => opt.is_correct) || !q.options.every((opt) => getEditorText(opt.content))) {
          setError(t('errAllMc'))
          return
        }
      }
      if (q.type === 'short_answer' && !q.accepted_answers?.some((answer) => answer.trim())) {
        setError(t('errAllSa'))
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/questions/bulk-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: items, upload_import_id: uploadImportId ?? undefined }),
      })
      const json = await res.json()
      if (!res.ok && !json.data) {
        setError(json.error ?? t('errSaveFailed'))
        return
      }
      const importId = json.data?.upload_import_id ?? uploadImportId
      if (!importId) {
        setError(t('errNoSaveId'))
        return
      }

      const status = await waitForQuestionImport(
        importId,
        (s) => ['success', 'partial_success', 'failed'].includes(s.status),
        { errCheck: t('errImportCheck'), errTimeout: t('errImportPending') }
      )
      if (status.status === 'failed') {
        setError(status.error_message ?? t('errSaveFailed'))
        return
      }

      onSaved(status.save_result?.saved ?? status.success_count ?? 0)
    } catch {
      setError(t('errConnect'))
    } finally {
      setSaving(false)
    }
  }

  function updateType(idx: number, type: EditableQuestionType) {
    const current = items[idx]
    update(idx, {
      type,
      options: type === 'multiple_choice'
        ? (current.options?.length ? current.options : [
          { label: 'A', content: '', is_correct: true, order: 1 },
          { label: 'B', content: '', is_correct: false, order: 2 },
          { label: 'C', content: '', is_correct: false, order: 3 },
          { label: 'D', content: '', is_correct: false, order: 4 },
        ])
        : current.options,
      accepted_answers: type === 'short_answer' ? (current.accepted_answers?.length ? current.accepted_answers : ['']) : current.accepted_answers,
    })
  }

  function updateOptions(idx: number, options: EditableOption[]) {
    update(idx, {
      options: options.map((option, optionIdx) => ({
        label: option.label,
        content: option.content,
        is_correct: option.is_correct,
        order: optionIdx + 1,
      })),
    })
  }

  function tagSelector(q: ReviewQuestion, idx: number) {
    return (
      <div>
        <label className="mb-2 block text-sm font-medium text-ink">{t('topicSelectorLabel')}</label>
        <select
          value={q.tag_id ?? ''}
          onChange={(e) => update(idx, { tag_id: e.target.value || null })}
          className="h-12 w-full rounded-[8px] border border-slate-200 bg-slate-50 px-4 text-base text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary"
        >
          <option value="">{t('selectTopicOpt')}</option>
          <optgroup label="Reading & Writing">
            {rwTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </optgroup>
          <optgroup label="Math">
            {mathTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </optgroup>
        </select>
      </div>
    )
  }

  return (
    <CreateFlowShell>
    <div>
      {/* Summary bar */}
      <div className="mb-6 p-4 bg-surface-card rounded-[12px] border border-hairline-light">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="text-sm font-semibold text-ink truncate">{filename}</p>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs text-mute-light">
                <span className="w-2 h-2 rounded-full bg-primary/60 inline-block" />
                {t('reviewTotalCount', { count: items.length })}
              </span>
              {items.filter(q => q.is_duplicate).length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                  <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                  {t('reviewDuplicates', { count: items.filter(q => q.is_duplicate).length })}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs text-mute-light">
                <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                {t('reviewSkippedCount', { count: items.filter(q => q.skip).length })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onBack}
              disabled={saving}
              className="text-sm text-mute-light hover:text-ink transition-colors px-3 py-1.5 rounded-[6px] hover:bg-surface-soft disabled:opacity-50"
            >
              {t('reviewBack')}
            </button>
            <Button onClick={handleSave} loading={saving} disabled={toSave.length === 0}>
              {t('saveBtnLabel', { count: toSave.length })}
            </Button>
          </div>
        </div>

        {/* Completion progress */}
        {activeCount > 0 && (
          <div className="mt-3 pt-3 border-t border-hairline-light flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-1">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round(((taggedCount + difficultyCount) / (activeCount * 2)) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-mute-light whitespace-nowrap">
                {t('taggedProgress', { tagged: taggedCount, total: activeCount, difficulty: difficultyCount })}
              </span>
            </div>
          </div>
        )}
      </div>

      {uploadImportId && (
        <SaveDisabledNotice importId={uploadImportId} />
      )}

      {error && (
        <div className="mb-4 rounded-[8px] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-warning">{error}</p>
        </div>
      )}

      {/* Question list */}
      <div className="space-y-3">
        {items.map((q, idx) => {
          const cardAccent = q.skip
            ? 'border-l-4 border-l-slate-300 opacity-60'
            : q.is_duplicate
              ? 'border-l-4 border-l-orange-400'
              : (q.tag_id && q.difficulty)
                ? 'border-l-4 border-l-emerald-400'
                : 'border-l-4 border-l-blue-300'
          return (
          <Card key={idx} className={['p-5 transition-all', cardAccent].join(' ')}>
            {/* Header row */}
            <div className="flex items-start gap-3 mb-3">
              <span className={[
                'shrink-0 w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center mt-0.5',
                q.skip ? 'bg-slate-100 text-slate-400' : 'bg-surface-soft text-mute-light',
              ].join(' ')}>
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <Badge variant={q.type === 'multiple_choice' ? 'info' : 'default'}>
                    {q.type === 'multiple_choice' ? t('badgeMcLabel') : t('badgeSaLabel')}
                  </Badge>
                  {q.module && (
                    <span className="text-xs text-mute-light bg-surface-soft px-2 py-0.5 rounded-full">{q.module}</span>
                  )}
                  {q.category && (
                    <span className="text-xs text-mute-light bg-surface-soft px-2 py-0.5 rounded-full">{q.category}</span>
                  )}
                  {q.is_duplicate && !q.skip && (
                    <span className="text-xs text-orange-700 font-medium bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                      {t('badgeDuplicate')}
                    </span>
                  )}
                  {q.skip && (
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{t('badgeSkipped')}</span>
                  )}
                  {!q.skip && q.tag_id && q.difficulty && (
                    <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                      {t('badgeReady')}
                    </span>
                  )}
                </div>
                <p className={['text-sm leading-relaxed line-clamp-3', q.skip ? 'text-mute-light line-through' : 'text-ink'].join(' ')}>
                  {getEditorText(q.content)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {!q.skip && (
                  <button
                    type="button"
                    onClick={() => setEditingIndex(editingIndex === idx ? null : idx)}
                    className={[
                      'text-xs font-medium px-3 py-1.5 rounded-[6px] border transition-colors',
                      editingIndex === idx
                        ? 'bg-primary text-white border-primary'
                        : 'text-primary border-primary/30 hover:bg-primary/5',
                    ].join(' ')}
                  >
                    {editingIndex === idx ? t('collapseBtn') : t('editQuestionBtn')}
                  </button>
                )}
                <button
                  onClick={() => update(idx, { skip: !q.skip, replace: false })}
                  className={[
                    'text-xs font-medium px-3 py-1.5 rounded-[6px] border transition-colors',
                    q.skip
                      ? 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                      : 'text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-warning hover:border-warning/30',
                  ].join(' ')}
                >
                  {q.skip ? t('restoreBtn') : t('skipBtn')}
                </button>
              </div>
            </div>

            {!q.skip && (
              <>
                {editingIndex === idx ? (
                  <div className="pl-10">
                    <ImportedQuestionImagePreview imageUrl={q.image_url} />
                    <QuestionFormEditor
                      compact
                      type={q.type as EditableQuestionType}
                      onTypeChange={(type) => updateType(idx, type)}
                      content={q.content}
                      onContentChange={(value) => update(idx, { content: value })}
                      options={(q.options ?? []) as EditableOption[]}
                      onOptionsChange={(nextOptions) => updateOptions(idx, nextOptions)}
                      acceptedAnswers={q.accepted_answers ?? ['']}
                      onAcceptedAnswersChange={(answers) => update(idx, { accepted_answers: answers })}
                      difficulty={q.difficulty as EditableDifficulty | null}
                      onDifficultyChange={(nextDifficulty) => update(idx, { difficulty: nextDifficulty })}
                      explanation={q.teacher_explanation ?? ''}
                      onExplanationChange={(value) => update(idx, { teacher_explanation: value || null })}
                      tagSelector={tagSelector(q, idx)}
                    />
                  </div>
                ) : (
                  <>
                <ImportedQuestionImagePreview imageUrl={q.image_url} compact />

                {/* Options preview (MC) */}
                {q.type === 'multiple_choice' && q.options && (
                  <div className="grid grid-cols-2 gap-1.5 mb-3 pl-10">
                    {q.options.map((opt) => (
                      <div
                        key={opt.label}
                        className={[
                          'flex items-start gap-2 px-3 py-2 rounded-[6px] text-xs border',
                          opt.is_correct
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium'
                            : 'bg-surface-soft border-transparent text-mute-light',
                        ].join(' ')}
                      >
                        <span className={['font-bold shrink-0', opt.is_correct ? 'text-emerald-700' : ''].join(' ')}>{opt.label}.</span>
                        <span className="flex-1 line-clamp-2">{getEditorText(opt.content)}</span>
                        {opt.is_correct && (
                          <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Accepted answers preview (SA) */}
                {q.type === 'short_answer' && q.accepted_answers && (
                  <div className="mb-3 pl-10">
                    <p className="text-xs text-mute-light mb-1">{t('acceptedAnswerLabel')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {q.accepted_answers.map((a, i) => (
                        <span key={i} className="text-xs bg-green-50 text-green-800 px-2 py-0.5 rounded-full">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                  </>
                )}

                {/* Duplicate action */}
                {q.is_duplicate && editingIndex !== idx && (
                  <div className="mb-3 pl-10 flex items-center gap-3">
                    <p className="text-xs text-orange-600">{t('duplicatePrompt')}</p>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`dup-${idx}`}
                        checked={!q.replace}
                        onChange={() => update(idx, { replace: false })}
                        className="accent-primary"
                      />
                      <span className="text-xs text-ink">{t('keepBoth')}</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`dup-${idx}`}
                        checked={q.replace}
                        onChange={() => update(idx, { replace: true })}
                        className="accent-primary"
                      />
                      <span className="text-xs text-ink">{t('replaceOld')}</span>
                    </label>
                  </div>
                )}

                {/* Tag + difficulty pickers */}
                {editingIndex !== idx && (
                <div className="pl-10 flex items-center gap-3 flex-wrap">
                  {/* Tag selector */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-mute-light whitespace-nowrap">{t('topicSelectorLabel')}</label>
                    <select
                      value={q.tag_id ?? ''}
                      onChange={(e) => update(idx, { tag_id: e.target.value || null })}
                      className="text-xs border border-ash-light rounded-[6px] px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    >
                      <option value="">{t('selectTopicOpt')}</option>
                      <optgroup label="Reading &amp; Writing">
                        {rwTags.map((tag) => (
                          <option key={tag.id} value={tag.id}>{tag.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Math">
                        {mathTags.map((tag) => (
                          <option key={tag.id} value={tag.id}>{tag.name}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Difficulty selector */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-mute-light whitespace-nowrap">{t('diffSelectorLabel')}</label>
                    <div className="flex gap-1">
                      {[
                        { value: 'easy', label: t('filterEasy'), color: 'bg-green-100 text-green-700' },
                        { value: 'medium', label: t('filterMedium'), color: 'bg-yellow-100 text-yellow-700' },
                        { value: 'hard', label: t('filterHard'), color: 'bg-red-100 text-red-700' },
                      ].map((d) => (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() =>
                            update(idx, {
                              difficulty: q.difficulty === d.value
                                ? null
                                : (d.value as 'easy' | 'medium' | 'hard'),
                            })
                          }
                          className={[
                            'px-2 py-1 rounded-full text-xs font-medium transition-all border',
                            q.difficulty === d.value
                              ? `${d.color} border-current`
                              : 'bg-surface-soft text-mute-light border-transparent hover:border-ash-light',
                          ].join(' ')}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                )}
              </>
            )}
          </Card>
          )
        })}
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 mt-6 py-4 bg-white/95 backdrop-blur-sm border-t border-hairline-light flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-mute-light">
            {t('savingProgress', { save: toSave.length, total: items.length })}
          </p>
          {items.filter(q => q.skip).length > 0 && (
            <span className="text-xs text-slate-400">· {t('reviewSkippedCount', { count: items.filter(q => q.skip).length })}</span>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="text-sm text-mute-light hover:text-ink transition-colors px-3 py-2 rounded-[6px] hover:bg-surface-soft disabled:opacity-50"
          >
            {t('uploadCancelBtn')}
          </button>
          <Button onClick={handleSave} loading={saving} disabled={toSave.length === 0}>
            {t('saveToBankBtn')}
          </Button>
        </div>
      </div>
    </div>
    </CreateFlowShell>
  )
}

function SaveDisabledNotice({ importId }: { importId: string }) {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/question-imports/${importId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setMessage(json.data?.parsed_payload?.save_disabled_reason ?? null)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [importId])

  if (!message) return null
  return (
    <div className="mb-4 rounded-[8px] bg-amber-50 border border-amber-200 px-4 py-3">
      <p className="text-sm text-amber-800">{message}</p>
    </div>
  )
}

// ─── Step 3: Done ─────────────────────────────────────────────────────────────

function DoneStep({ saved, onReset }: { saved: number; onReset: () => void }) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('teacher.questions')
  return (
    <div className="max-w-sm mx-auto text-center py-16">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-green-600">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-ink mb-2">{t('doneTitle')}</h2>
      <p className="text-sm text-mute-light mb-8">
        {t('doneDesc', { saved })}
      </p>
      <div className="flex flex-col gap-3">
        <Button onClick={() => {
          router.push(`/${locale}/teacher/questions`)
          router.refresh()
        }}>
          {t('viewBankBtn')}
        </Button>
        <Button variant="ghost" onClick={onReset}>
          {t('uploadAnotherBtn')}
        </Button>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function UploadDocxClient({ tags }: { tags: Tag[] }) {
  const t = useTranslations('teacher.questions')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [questions, setQuestions] = useState<ReviewQuestion[]>([])
  const [filename, setFilename] = useState('')
  const [uploadImportId, setUploadImportId] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)

  function handleParsed(qs: ReviewQuestion[], name: string, importId: string | null) {
    setQuestions(qs)
    setFilename(name)
    setUploadImportId(importId)
    setStep(2)
  }

  function handleSaved(count: number) {
    setSavedCount(count)
    setStep(3)
  }

  function reset() {
    setStep(1)
    setQuestions([])
    setFilename('')
    setUploadImportId(null)
    setSavedCount(0)
  }

  return (
    <div>
      <PageHeader
        title={t('uploadTitle')}
        breadcrumbs={[
          { label: t('title'), href: '/teacher/questions' },
          { label: t('breadcrumbUpload') },
        ]}
      />

      <StepIndicator step={step} />

      {step === 1 && <UploadStep onParsed={handleParsed} />}
      {step === 2 && (
        <ReviewStep
          questions={questions}
          filename={filename}
          uploadImportId={uploadImportId}
          tags={tags}
          onSaved={handleSaved}
          onBack={reset}
        />
      )}
      {step === 3 && <DoneStep saved={savedCount} onReset={reset} />}
    </div>
  )
}
