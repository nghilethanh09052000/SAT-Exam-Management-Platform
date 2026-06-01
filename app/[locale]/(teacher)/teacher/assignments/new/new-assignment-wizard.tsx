'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingBlock, LoadingInline } from '@/components/ui/loading'
import { Modal } from '@/components/ui/modal'
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
import { RichHtml } from '@/lib/rich-html'

// ─── Types ────────────────────────────────────────────────────────────────────

// Defined at module level so it's stable across renders (avoids StrictMode issues)
interface ClassTarget {
  _id: string
  courseId: string
  classId: string
  weekId: string
}

// Color themes for class-target rows — solid colors, no gradient
const ROW_THEMES = [
  {
    wrap:   'border border-blue-100 border-l-[4px] border-l-blue-500 bg-blue-50',
    badge:  'bg-blue-500 text-white',
    label:  'text-blue-600',
  },
  {
    wrap:   'border border-violet-100 border-l-[4px] border-l-violet-500 bg-violet-50',
    badge:  'bg-violet-500 text-white',
    label:  'text-violet-600',
  },
  {
    wrap:   'border border-emerald-100 border-l-[4px] border-l-emerald-500 bg-emerald-50',
    badge:  'bg-emerald-500 text-white',
    label:  'text-emerald-600',
  },
  {
    wrap:   'border border-orange-100 border-l-[4px] border-l-orange-500 bg-orange-50',
    badge:  'bg-orange-500 text-white',
    label:  'text-orange-600',
  },
] as const

interface Question {
  id: string
  type: string
  subject: string | null
  /** Plain-text preview from the DB generated column (max 200 chars). Used in the list. */
  content_preview: string
  difficulty: string | null
  created_at: string
}

interface Course {
  id: string
  title: string
}

interface Class {
  id: string
  title: string
  course_id: string
}

interface Week {
  id: string
  title: string
  class_id: string
  order: number
}

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
  tag_id: string | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  teacher_explanation: string | null
  category: string | null
  skip: boolean
  replace: boolean
}

interface Props {
  // questions are no longer passed as props — the wizard fetches them lazily
  courses: Course[]
  classes: Class[]
  weeks: Week[]
  tags: Tag[]
  initialClassId?: string
  initialWeekId?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type QuestionImportStatus = {
  id: string
  status: 'processing' | 'parsed' | 'success' | 'partial_success' | 'failed'
  success_count: number
  error_message: string | null
  parsed_payload?: {
    questions?: Array<Omit<ReviewQuestion, 'skip' | 'replace' | 'tag_id' | 'difficulty' | 'teacher_explanation' | 'category'> & {
      difficulty?: string | null
      tag_id?: string | null
      teacher_explanation?: string | null
      category?: string | null
    }>
  } | null
  parse_errors?: Array<{ line?: number; message: string }> | null
  save_result?: {
    saved?: number
    savedIds?: string[]
    errors?: Array<{ content: string; error: string }>
  } | null
}

async function waitForQuestionImport(
  importId: string,
  isDone: (status: QuestionImportStatus) => boolean,
  { errCheck, errTimeout }: { errCheck: string; errTimeout: string }
) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const res = await fetch(`/api/question-imports/${importId}`, { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok || json.error) {
      throw new Error(json.error ?? errCheck)
    }

    const status = json.data as QuestionImportStatus
    if (isDone(status)) return status
    await new Promise((resolve) => setTimeout(resolve, attempt < 15 ? 2000 : 5000))
  }

  throw new Error(errTimeout)
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

const DIFFICULTY_VARIANT: Record<string, 'success' | 'warning' | 'error'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'error',
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
  return `assignment-review-${Math.abs(hash).toString(16)}`
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={[
      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors',
      done ? 'bg-primary text-white' : active ? 'bg-primary text-white' : 'bg-surface-soft text-mute-light',
    ].join(' ')}>
      {done ? (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : n}
    </div>
  )
}

// ─── Docx upload sub-flow ─────────────────────────────────────────────────────

type DocxPhase = 'upload' | 'review'

function DocxUploadPane({
  tags,
  onQuestionsReady,
}: {
  tags: Tag[]
  onQuestionsReady: (savedIds: string[], count: number) => void
}) {
  const t = useTranslations('teacher.assignments')
  const [phase, setPhase] = useState<DocxPhase>('upload')
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const [uploadImportId, setUploadImportId] = useState<string | null>(null)
  const [items, setItems] = useState<ReviewQuestion[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const rwTags = tags.filter((tag) => tag.subject === 'reading_writing')
  const mathTags = tags.filter((tag) => tag.subject === 'math')

  // ── Parse docx ──────────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    if (!file.name.endsWith('.docx') && !file.name.endsWith('.pdf')) {
      setParseError(t('errFileType'))
      return
    }
    setParseError(null)
    setParsing(true)

    try {
      const upload = await uploadQuestionImportFile(file, { sourceContext: 'assignment_wizard' })
      const importId = upload.upload_import_id
      if (!importId) {
        setParseError(t('errNoImportId'))
        return
      }

      const status = await waitForQuestionImport(
        importId,
        (s) => s.status === 'parsed' || s.status === 'failed',
        { errCheck: t('errImportCheck'), errTimeout: t('errImportPending') }
      )
      if (status.status === 'failed') {
        setParseError(status.error_message ?? status.parse_errors?.[0]?.message ?? t('errParseFile'))
        return
      }

      setItems(toReviewQuestions(status))
      setFilename(file.name)
      setUploadImportId(importId)
      setPhase('review')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : t('errConnectRetry'))
    } finally {
      setParsing(false)
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateItem(idx: number, patch: Partial<ReviewQuestion>) {
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

  function updateQuestionType(idx: number, type: EditableQuestionType) {
    const current = items[idx]
    updateItem(idx, {
      type,
      options: type === 'multiple_choice'
        ? (current.options?.length ? current.options : [
          { label: 'A', content: '', is_correct: true, order: 1 },
          { label: 'B', content: '', is_correct: false, order: 2 },
          { label: 'C', content: '', is_correct: false, order: 3 },
          { label: 'D', content: '', is_correct: false, order: 4 },
        ])
        : current.options,
      accepted_answers: type === 'short_answer'
        ? (current.accepted_answers?.length ? current.accepted_answers : [''])
        : current.accepted_answers,
    })
  }

  function updateQuestionOptions(idx: number, options: EditableOption[]) {
    updateItem(idx, {
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
        <label className="mb-2 block text-sm font-medium text-ink">{t('topicLabel')}</label>
        <select
          value={q.tag_id ?? ''}
          onChange={(e) => updateItem(idx, { tag_id: e.target.value || null })}
          className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-base text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary"
        >
          <option value="">-- {t('topicLabel')} --</option>
          <optgroup label={t('groupRW')}>
            {rwTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </optgroup>
          <optgroup label={t('groupMath')}>
            {mathTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </optgroup>
        </select>
      </div>
    )
  }

  const toSave = items.filter((q) => !q.skip)

  // ── Save to bank then hand IDs back to wizard ────────────────────────────
  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/questions/bulk-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: items, upload_import_id: uploadImportId ?? undefined }),
      })
      const json = await res.json()
      if (!res.ok && !json.data) {
        setSaveError(json.error ?? t('errSaveQuestions'))
        return
      }
      const importId = json.data?.upload_import_id ?? uploadImportId
      if (!importId) {
        setSaveError(t('errNoSaveId'))
        return
      }

      const status = await waitForQuestionImport(
        importId,
        (s) => ['success', 'partial_success', 'failed'].includes(s.status),
        { errCheck: t('errImportCheck'), errTimeout: t('errImportPending') }
      )
      if (status.status === 'failed') {
        setSaveError(status.error_message ?? t('errSaveQuestions'))
        return
      }

      const savedIds: string[] = status.save_result?.savedIds ?? []
      onQuestionsReady(savedIds, savedIds.length)
    } catch {
      setSaveError(t('errConnectRetry'))
    } finally {
      setSaving(false)
    }
  }

  // ── Upload phase ─────────────────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !parsing && inputRef.current?.click()}
          className={[
            'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors py-12 px-8',
            dragging ? 'border-primary bg-blue-50' : 'border-ash-light hover:border-primary hover:bg-surface-card',
            parsing ? 'pointer-events-none opacity-60' : '',
          ].join(' ')}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".docx,.pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />

          {parsing ? (
            <LoadingInline
              label={t('docxParsing')}
              className="flex flex-col items-center gap-4 text-sm text-mute-light"
              spinnerClassName="h-8 w-8 text-primary"
            />
          ) : (
            <>
              <div className="w-14 h-14 rounded-xl bg-indigo-50 flex items-center justify-center">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-medium text-ink text-sm">{t('docxDragging')}</p>
                <p className="text-xs text-mute-light mt-1">{t('docxClickHint')}</p>
              </div>
            </>
          )}
        </div>

        {parseError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-warning">{parseError}</p>
          </div>
        )}

        <div className="rounded-lg bg-surface-card border border-hairline-light p-4 space-y-1.5">
          <p className="text-xs font-semibold text-ink">{t('docxFormatTitle')}</p>
          <ul className="text-xs text-mute-light space-y-1 list-disc list-inside">
            <li>Heading: <code className="bg-surface-soft px-1 rounded">Module 1: Reading and Writing</code></li>
            <li>{t('docxFormatQuestion')} <code className="bg-surface-soft px-1 rounded">Question N</code></li>
            <li>{t('docxFormatCorrectAnswer')}</li>
          </ul>
        </div>
      </div>
    )
  }

  // ── Review phase ──────────────────────────────────────────────────────────
  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-4 p-4 bg-surface-card rounded-lg border border-hairline-light">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink truncate">{filename}</p>
          <p className="text-xs text-mute-light mt-0.5">
            {t('docxSelectedCount', { total: items.length, save: toSave.length })}
          </p>
        </div>
        <button
          onClick={() => { setPhase('upload'); setItems([]); setFilename(''); setUploadImportId(null) }}
          className="text-xs text-mute-light hover:text-ink transition-colors shrink-0"
        >
          {t('docxBack')}
        </button>
      </div>

      {saveError && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-warning">{saveError}</p>
        </div>
      )}

      {/* Question list */}
      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
        {items.map((q, idx) => (
          <Card key={q.content_hash + idx} className={['p-4 transition-opacity', q.skip ? 'opacity-40' : ''].join(' ')}>
            <div className="flex items-start gap-3 mb-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-surface-soft text-mute-light text-xs font-bold flex items-center justify-center mt-0.5">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <Badge variant={q.type === 'multiple_choice' ? 'info' : 'default'}>
                    {q.type === 'multiple_choice' ? 'TN' : 'SA'}
                  </Badge>
                  {q.module && <span className="text-xs text-mute-light">{q.module}</span>}
                </div>
                <p className="text-xs text-ink leading-relaxed line-clamp-2">{getEditorText(q.content)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {!q.skip && (
                  <button
                    type="button"
                    onClick={() => setEditingIndex(idx)}
                    className="text-xs font-medium text-primary hover:text-blue-700"
                  >
                    {t('viewEdit')}
                  </button>
                )}
                <button
                  onClick={() => updateItem(idx, { skip: !q.skip, replace: false })}
                  className="text-xs text-mute-light hover:text-warning transition-colors"
                >
                  {q.skip ? t('restoreQuestion') : t('skipQuestion')}
                </button>
              </div>
            </div>

            {!q.skip && (
              <div className="pl-9 flex items-center gap-3 flex-wrap">
                {/* Tag */}
                <select
                  value={q.tag_id ?? ''}
                  onChange={(e) => updateItem(idx, { tag_id: e.target.value || null })}
                  className="text-xs border border-ash-light rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">-- {t('topicLabel')} --</option>
                  <optgroup label={t('groupRW')}>
                    {rwTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                  </optgroup>
                  <optgroup label={t('groupMath')}>
                    {mathTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                  </optgroup>
                </select>

                {/* Difficulty */}
                <div className="flex gap-1">
                  {([
                    { value: 'easy', label: t('filterEasy'), color: 'bg-green-100 text-green-700' },
                    { value: 'medium', label: t('filterMedium'), color: 'bg-yellow-100 text-yellow-700' },
                    { value: 'hard', label: t('filterHard'), color: 'bg-red-100 text-red-700' },
                  ] as { value: string; label: string; color: string }[]).map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => updateItem(idx, { difficulty: q.difficulty === d.value ? null : (d.value as 'easy' | 'medium' | 'hard') })}
                      className={[
                        'px-2 py-0.5 rounded-full text-xs font-medium transition-all border',
                        q.difficulty === d.value ? `${d.color} border-current` : 'bg-surface-soft text-mute-light border-transparent hover:border-ash-light',
                      ].join(' ')}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Modal
        open={editingIndex !== null}
        onClose={() => setEditingIndex(null)}
        title={editingIndex !== null ? t('editModalTitle', { n: editingIndex + 1 }) : t('viewEdit')}
        size="xl"
      >
        {editingIndex !== null && items[editingIndex] && (
          <div className="space-y-4">
            {items[editingIndex].category && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                {t('docxCategoryLabel', { category: items[editingIndex].category })}
              </div>
            )}
            <QuestionFormEditor
              compact
              type={items[editingIndex].type as EditableQuestionType}
              onTypeChange={(type) => updateQuestionType(editingIndex, type)}
              content={items[editingIndex].content}
              onContentChange={(value) => updateItem(editingIndex, { content: value })}
              options={(items[editingIndex].options ?? []) as EditableOption[]}
              onOptionsChange={(nextOptions) => updateQuestionOptions(editingIndex, nextOptions)}
              acceptedAnswers={items[editingIndex].accepted_answers ?? ['']}
              onAcceptedAnswersChange={(answers) => updateItem(editingIndex, { accepted_answers: answers })}
              difficulty={items[editingIndex].difficulty as EditableDifficulty | null}
              onDifficultyChange={(difficulty) => updateItem(editingIndex, { difficulty })}
              explanation={items[editingIndex].teacher_explanation ?? ''}
              onExplanationChange={(value) => updateItem(editingIndex, { teacher_explanation: value || null })}
              tagSelector={tagSelector(items[editingIndex], editingIndex)}
            />
            <div className="flex justify-end gap-3 border-t border-hairline-light pt-4">
              <Button variant="ghost" onClick={() => setEditingIndex(null)}>{t('closeBtn')}</Button>
              <Button onClick={() => setEditingIndex(null)}>{t('doneBtn')}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Save bar */}
      <div className="mt-4 pt-4 border-t border-hairline-light flex items-center justify-between">
        <p className="text-xs text-mute-light">{t('docxSaveSummary', { save: toSave.length, total: items.length })}</p>
        <Button onClick={handleSave} loading={saving} disabled={toSave.length === 0}>
          {t('saveToBank', { count: toSave.length })}
        </Button>
      </div>
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function NewAssignmentWizard({
  courses,
  classes,
  weeks,
  tags,
  initialClassId = '',
  initialWeekId = '',
}: Props) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('teacher.assignments')

  const DIFFICULTY_LABEL: Record<string, string> = {
    easy: t('filterEasy'),
    medium: t('filterMedium'),
    hard: t('filterHard'),
  }

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1 mode: bank picker vs docx upload
  const [sourceMode, setSourceMode] = useState<'bank' | 'docx'>('bank')

  // Step 1: question selection (bank mode)
  const [questionSearch, setQuestionSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [diffFilter, setDiffFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Keeps the full question record for everything that's currently selected, so the
  // "added to assignment" panel can show titles/badges even after the user filters or
  // paginates away from a question. Keyed by question id.
  const [selectedMeta, setSelectedMeta] = useState<Map<string, Question>>(new Map())

  // Preview modal — list item uses content_preview; modal fetches full HTML on demand
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewFetching, setPreviewFetching] = useState(false)

  // Docx mode: status message after save
  const [docxSavedCount, setDocxSavedCount] = useState(0)
  const [docxDone, setDocxDone] = useState(false)

  // ── Lazy question loading via /api/questions ────────────────────────────────
  // Questions are fetched from the server with server-side filtering + keyset pagination
  // instead of being passed as props. This keeps the initial page load fast regardless
  // of how large the question bank grows.
  const [questions, setQuestions] = useState<Question[]>([])
  const [qLoading, setQLoading] = useState(true)
  const [qError, setQError] = useState<string | null>(null)
  const [hasNextPage, setHasNextPage] = useState(false)
  // keyset cursor — stored in a ref so it doesn't trigger re-renders
  const cursorRef = useRef<{ created_at: string; id: string } | null>(null)

  // Debounce the search input so we don't fire an API call on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(questionSearch), 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [questionSearch])

  // Fetch (or re-fetch from page 1) whenever a filter changes
  useEffect(() => {
    cursorRef.current = null
    setQuestions([])
    setHasNextPage(false)
    setQError(null)
    setQLoading(true)

    const params = new URLSearchParams()
    if (typeFilter !== 'all') params.set('type', typeFilter)
    if (diffFilter !== 'all') params.set('difficulty', diffFilter)
    if (subjectFilter !== 'all') params.set('subject', subjectFilter)
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())

    fetch(`/api/questions?${params}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setQError(json.error); return }
        const rows = (json.data ?? []) as Question[]
        setQuestions(rows)
        setHasNextPage(json.has_next ?? false)
        if (rows.length > 0) {
          cursorRef.current = { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
        }
      })
      .catch(() => setQError(t('errLoadQuestions')))
      .finally(() => setQLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, diffFilter, subjectFilter, debouncedSearch])

  function loadMoreQuestions() {
    if (!hasNextPage || qLoading || !cursorRef.current) return
    setQLoading(true)

    const params = new URLSearchParams()
    if (typeFilter !== 'all') params.set('type', typeFilter)
    if (diffFilter !== 'all') params.set('difficulty', diffFilter)
    if (subjectFilter !== 'all') params.set('subject', subjectFilter)
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
    params.set('after_created_at', cursorRef.current.created_at)
    params.set('after_id', cursorRef.current.id)

    fetch(`/api/questions?${params}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setQError(json.error); return }
        const rows = (json.data ?? []) as Question[]
        setQuestions((prev) => [...prev, ...rows])
        setHasNextPage(json.has_next ?? false)
        if (rows.length > 0) {
          cursorRef.current = { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
        }
      })
      .catch(() => setQError(t('errLoadMoreQuestions')))
      .finally(() => setQLoading(false))
  }

  // Step 2: settings
  const [title, setTitle] = useState('')

  // ── Multi-class targets ────────────────────────────────────────────────────
  const [classTargets, setClassTargets] = useState<ClassTarget[]>([{
    _id: crypto.randomUUID(),
    courseId: classes.find((cls) => cls.id === initialClassId)?.course_id ?? '',
    classId: initialClassId,
    weekId: initialWeekId,
  }])

  function addTarget() {
    // UUID is computed OUTSIDE the updater so React StrictMode's double-invoke
    // doesn't add two entries with different IDs.
    const newTarget: ClassTarget = { _id: crypto.randomUUID(), courseId: '', classId: '', weekId: '' }
    setClassTargets((prev) => [...prev, newTarget])
  }
  function removeTarget(_id: string) {
    setClassTargets((prev) => prev.length > 1 ? prev.filter((t) => t._id !== _id) : prev)
  }
  function updateTarget(_id: string, patch: Partial<Omit<ClassTarget, '_id'>>) {
    setClassTargets((prev) => prev.map((t) => {
      if (t._id !== _id) return t
      const next = { ...t, ...patch }
      if ('courseId' in patch) { next.classId = ''; next.weekId = '' }
      if ('classId' in patch) { next.weekId = '' }
      return next
    }))
  }

  const [deadline, setDeadline] = useState('')
  const [isTimed, setIsTimed] = useState(false)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState('60')
  const [shuffleQuestions, setShuffleQuestions] = useState(false)
  const [shuffleOptions, setShuffleOptions] = useState(false)
  const [publishNow, setPublishNow] = useState(true)
  const [maxRetakes, setMaxRetakes] = useState('1')

  // Submission state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleQuestion(q: Question) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(q.id)) next.delete(q.id)
      else next.add(q.id)
      return next
    })
    setSelectedMeta((prev) => {
      const next = new Map(prev)
      if (next.has(q.id)) next.delete(q.id)
      else next.set(q.id, q)
      return next
    })
  }

  // Removes a single question from the selection (used by the right-hand panel)
  function removeSelected(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
    setSelectedMeta((prev) => { const next = new Map(prev); next.delete(id); return next })
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setSelectedMeta(new Map())
  }

  // Selects / deselects the currently visible page of questions
  function toggleAll() {
    const allVisible = questions.every((q) => selectedIds.has(q.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisible && questions.length > 0) {
        questions.forEach((q) => next.delete(q.id))
      } else {
        questions.forEach((q) => next.add(q.id))
      }
      return next
    })
    setSelectedMeta((prev) => {
      const next = new Map(prev)
      if (allVisible && questions.length > 0) {
        questions.forEach((q) => next.delete(q.id))
      } else {
        questions.forEach((q) => next.set(q.id, q))
      }
      return next
    })
  }

  // Opens the preview modal and lazily fetches the full HTML content for this question
  async function openPreview(q: Question) {
    setPreviewQuestion(q)
    setPreviewHtml(null)
    setPreviewFetching(true)
    try {
      const res = await fetch(`/api/questions/${q.id}`, { cache: 'no-store' })
      const json = await res.json()
      if (!json.error) setPreviewHtml(json.data.content as string)
    } finally {
      setPreviewFetching(false)
    }
  }

  // Called when docx upload flow finishes saving questions to bank
  function handleDocxSaved(savedIds: string[], count: number) {
    setDocxSavedCount(count)
    setDocxDone(true)
    // Auto-select all newly saved questions by ID. No bank metadata is available for
    // freshly-imported questions, so the selection panel just reflects the count here.
    setSelectedIds(new Set(savedIds))
    setSelectedMeta(new Map())
  }

  // ── Create & publish ───────────────────────────────────────────────────────

  async function handleCreate() {
    if (!title.trim()) { setError(t('errNoName')); return }
    const validTargets = classTargets.filter((t) => t.classId)
    if (validTargets.length === 0) { setError(t('errNoClass')); return }
    if (validTargets.some((t) => !t.weekId)) { setError(t('errNoWeekTarget')); return }
    // Duplicate check: same class_id + week_id pair cannot appear twice
    const pairKeys = validTargets.map((t) => `${t.classId}::${t.weekId}`)
    if (pairKeys.length !== new Set(pairKeys).size) { setError(t('errDuplicateTarget')); return }
    if (!deadline) { setError(t('errNoDeadline')); return }
    if (selectedIds.size === 0) { setError(t('errNoQuestions')); return }

    setError(null)
    setLoading(true)

    try {
      // 1. Create the assignment template
      const assignRes = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      })
      const assignJson = await assignRes.json()
      if (assignJson.error) { setError(assignJson.error); return }
      const assignmentId: string = assignJson.data.id

      const sharedSettings = {
        assignment_id: assignmentId,
        deadline: new Date(deadline).toISOString(),
        is_timed: isTimed,
        time_limit_seconds: isTimed ? Number(timeLimitMinutes) * 60 : null,
        shuffle_questions: shuffleQuestions,
        shuffle_options: shuffleOptions,
        max_retakes: Number(maxRetakes),
        published_at: publishNow ? new Date().toISOString() : null,
      }

      // 2. In parallel: save questions + create one instance per class target
      const [qRes, ...instResponses] = await Promise.all([
        fetch(`/api/assignments/${assignmentId}/questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question_ids: Array.from(selectedIds) }),
        }),
        ...validTargets.map((target) =>
          fetch('/api/assignment-instances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...sharedSettings, class_id: target.classId, week_id: target.weekId }),
          })
        ),
      ])

      const qJson = await qRes.json()
      if (qJson.error) { setError(qJson.error); return }

      const instJsons = await Promise.all(instResponses.map((r) => r.json()))
      const firstInstError = instJsons.find((j) => j.error)
      if (firstInstError) { setError(firstInstError.error); return }

      router.push(`/${locale}/teacher/assignments`)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <CreateFlowShell>
    <div className={step === 1 ? 'max-w-6xl' : 'max-w-4xl'}>
      <PageHeader
        title={t('wizardTitle')}
        breadcrumbs={[
          { label: t('title'), href: '/teacher/assignments' },
          { label: t('breadcrumbCreate') },
        ]}
      />

      <ProgressStepper
        currentStep={step}
        steps={[
          { n: 1, label: t('step1Label') },
          { n: 2, label: t('step2Label') },
          { n: 3, label: t('step3Label') },
        ]}
      />

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-warning">{error}</p>
        </div>
      )}

      {/* ── STEP 1: SELECT QUESTIONS ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">

          {/* Mode switcher */}
          <div className="flex gap-2 p-1 bg-surface-soft rounded-xl w-fit">
            <button
              onClick={() => { setSourceMode('bank'); setDocxDone(false) }}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                sourceMode === 'bank'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-mute-light hover:text-ink',
              ].join(' ')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              {t('modeBank')}
            </button>
            <button
              onClick={() => setSourceMode('docx')}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                sourceMode === 'docx'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-mute-light hover:text-ink',
              ].join(' ')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {t('modeDocx')}
            </button>
          </div>

          {/* ── Bank mode ────────────────────────────────────────────────────── */}
          {sourceMode === 'bank' && (
            <>
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mute-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder={t('searchQuestion')}
                    value={questionSearch}
                    onChange={(e) => setQuestionSearch(e.target.value)}
                    className="w-full pl-9 pr-4 h-9 rounded-lg border border-ash-light text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-canvas-light text-ink placeholder:text-mute-light"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {[{ val: 'all', label: t('filterAll') }, { val: 'multiple_choice', label: t('filterMc') }, { val: 'short_answer', label: t('filterSa') }].map((opt) => (
                    <button key={opt.val} onClick={() => setTypeFilter(opt.val)} className={['px-3 py-1.5 rounded-full text-xs font-medium transition-colors', typeFilter === opt.val ? 'bg-primary text-white' : 'bg-surface-soft text-mute-light hover:text-ink'].join(' ')}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  {[{ val: 'all', label: t('filterAllDiff') }, { val: 'easy', label: t('filterEasy') }, { val: 'medium', label: t('filterMedium') }, { val: 'hard', label: t('filterHard') }].map((opt) => (
                    <button key={opt.val} onClick={() => setDiffFilter(opt.val)} className={['px-3 py-1.5 rounded-full text-xs font-medium transition-colors', diffFilter === opt.val ? 'bg-ink text-canvas-light' : 'bg-surface-soft text-mute-light hover:text-ink'].join(' ')}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  {[{ val: 'all', label: t('filterSubjectAll') }, { val: 'math', label: t('filterSubjectMath') }, { val: 'reading_writing', label: t('filterSubjectRW') }].map((opt) => (
                    <button key={opt.val} onClick={() => setSubjectFilter(opt.val)} className={['px-3 py-1.5 rounded-full text-xs font-medium transition-colors', subjectFilter === opt.val ? 'bg-violet-600 text-white' : 'bg-surface-soft text-mute-light hover:text-ink'].join(' ')}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Two-column layout: question list (left) + running selection (right) */}
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
              <div className="space-y-4 min-w-0">

              {/* Select all + count */}
              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={toggleAll}
                  disabled={questions.length === 0}
                  className="text-primary hover:underline text-xs font-medium disabled:opacity-40"
                >
                  {questions.length > 0 && questions.every((q) => selectedIds.has(q.id))
                    ? t('deselectPage')
                    : t('selectPage')}
                </button>
                <span className="text-mute-light text-xs">
                  {hasNextPage
                    ? t('selectedCountShowing', { count: selectedIds.size, showing: questions.length })
                    : t('selectedCountOf', { count: selectedIds.size, total: questions.length })}
                </span>
              </div>

              {/* Question list */}
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {qLoading && questions.length === 0 ? (
                  <LoadingBlock label={t('loadingQuestions')} />
                ) : qError ? (
                  <p className="text-sm text-warning text-center py-8">{qError}</p>
                ) : questions.length === 0 ? (
                  <p className="text-sm text-mute-light text-center py-8">{t('noQuestionsFound')}</p>
                ) : (
                  <>
                    {questions.map((q) => {
                      const selected = selectedIds.has(q.id)
                      return (
                        <div
                          key={q.id}
                          className={[
                            'flex items-center gap-4 px-5 py-3.5 rounded-card transition-colors border-2',
                            selected ? 'border-primary bg-primary/5' : 'border-transparent bg-surface-card hover:bg-surface-soft',
                          ].join(' ')}
                        >
                          <button
                            type="button"
                            onClick={() => toggleQuestion(q)}
                            className={['w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 border-2 transition-colors', selected ? 'bg-primary border-primary' : 'border-ash-light'].join(' ')}
                            aria-label={selected ? t('deselectThis') : t('selectThis')}
                          >
                            {selected && (
                              <svg fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5} className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-ink truncate">
                              {q.content_preview.slice(0, 100)}{q.content_preview.length > 100 ? '…' : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => openPreview(q)}
                              className="text-xs font-medium text-primary hover:text-blue-700"
                            >
                              {t('qView')}
                            </button>
                            {q.type === 'multiple_choice' ? <Badge variant="info">{t('badgeMc')}</Badge> : <Badge variant="default">{t('badgeSa')}</Badge>}
                            {q.difficulty && <Badge variant={DIFFICULTY_VARIANT[q.difficulty] ?? 'default'}>{DIFFICULTY_LABEL[q.difficulty]}</Badge>}
                          </div>
                        </div>
                      )
                    })}

                    {/* Load more */}
                    {hasNextPage && (
                      <div className="pt-2 text-center">
                        <button
                          onClick={loadMoreQuestions}
                          disabled={qLoading}
                          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          {qLoading ? t('loadingQuestions') : t('loadMoreQuestions')}
                        </button>
                      </div>
                    )}
                    {qLoading && questions.length > 0 && (
                      <LoadingBlock
                        label={t('loadingQuestions')}
                        className="py-2"
                        spinnerClassName="h-3.5 w-3.5"
                      />
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button disabled={selectedIds.size === 0} onClick={() => { setError(null); setStep(2) }}>
                  {t('nextStepCount', { count: selectedIds.size })}
                </Button>
                <Button variant="ghost" onClick={() => router.back()}>{t('cancelBtn')}</Button>
              </div>
              </div>

              {/* ── Right: running selection panel ───────────────────────────── */}
              <aside className="lg:sticky lg:top-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                      {selectedIds.size}
                    </span>
                    <p className="text-sm font-semibold text-slate-800 truncate">{t('selectedPanelTitle')}</p>
                  </div>
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="shrink-0 text-xs font-medium text-mute-light hover:text-warning transition-colors"
                    >
                      {t('selectedPanelClear')}
                    </button>
                  )}
                </div>

                {selectedIds.size === 0 ? (
                  <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                      <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-xs leading-relaxed text-mute-light">{t('selectedPanelEmpty')}</p>
                  </div>
                ) : (
                  <ul className="max-h-[460px] divide-y divide-slate-100 overflow-y-auto">
                    {Array.from(selectedIds).map((id, idx) => {
                      const meta = selectedMeta.get(id)
                      const label = meta ? `${meta.content_preview.slice(0, 70)}${meta.content_preview.length > 70 ? '…' : ''}` : null
                      return (
                        <li key={id} className="group flex items-start gap-2.5 px-4 py-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            {label
                              ? <p className="text-xs leading-snug text-ink line-clamp-2">{label}</p>
                              : <p className="text-xs italic text-mute-light">{t('badgeMc')} · {id.slice(0, 8)}</p>}
                            {meta && (
                              <div className="mt-1 flex items-center gap-1.5">
                                {meta.type === 'multiple_choice' ? <Badge variant="info">{t('badgeMc')}</Badge> : <Badge variant="default">{t('badgeSa')}</Badge>}
                                {meta.difficulty && <Badge variant={DIFFICULTY_VARIANT[meta.difficulty] ?? 'default'}>{DIFFICULTY_LABEL[meta.difficulty]}</Badge>}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSelected(id)}
                            aria-label={t('removeSelected')}
                            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </aside>
              </div>

              <Modal
                open={previewQuestion !== null}
                onClose={() => { setPreviewQuestion(null); setPreviewHtml(null) }}
                title={t('previewTitle')}
                size="xl"
              >
                {previewQuestion && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {previewQuestion.type === 'multiple_choice'
                        ? <Badge variant="info">{t('filterMc')}</Badge>
                        : <Badge variant="default">{t('filterSa')}</Badge>}
                      {previewQuestion.difficulty && (
                        <Badge variant={DIFFICULTY_VARIANT[previewQuestion.difficulty] ?? 'default'}>
                          {DIFFICULTY_LABEL[previewQuestion.difficulty] ?? previewQuestion.difficulty}
                        </Badge>
                      )}
                    </div>
                    {previewFetching ? (
                      <LoadingBlock label={t('loadingQuestions')} />
                    ) : previewHtml ? (
                      <RichHtml
                        html={previewHtml}
                        className="prose prose-sm max-w-none rounded-xl border border-hairline-light bg-white p-4 text-ink [&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full"
                      />
                    ) : (
                      <p className="text-sm text-mute-light py-8 text-center">{previewQuestion.content_preview}</p>
                    )}
                    <div className="flex justify-end gap-3 border-t border-hairline-light pt-4">
                      <Button
                        variant={selectedIds.has(previewQuestion.id) ? 'secondary' : 'primary'}
                        onClick={() => toggleQuestion(previewQuestion)}
                      >
                        {selectedIds.has(previewQuestion.id) ? t('deselectThis') : t('selectThis')}
                      </Button>
                      <Button variant="ghost" onClick={() => { setPreviewQuestion(null); setPreviewHtml(null) }}>{t('closeBtn')}</Button>
                    </div>
                  </div>
                )}
              </Modal>
            </>
          )}

          {/* ── Docx mode ────────────────────────────────────────────────────── */}
          {sourceMode === 'docx' && (
            <>
              {docxDone ? (
                /* Success state — questions saved, ready to proceed */
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-5 bg-green-50 border border-green-200 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-600">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-green-800">
                        {t('docxSuccess', { count: docxSavedCount })}
                      </p>
                      <p className="text-xs text-green-700 mt-0.5">
                        {t('docxSuccessDesc')}
                      </p>
                    </div>
                    <button
                      onClick={() => { setDocxDone(false); clearSelection() }}
                      className="text-xs text-green-700 hover:text-green-900 underline shrink-0"
                    >
                      {t('uploadAnother')}
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button disabled={selectedIds.size === 0} onClick={() => { setError(null); setStep(2) }}>
                      {t('nextStepCount', { count: selectedIds.size })}
                    </Button>
                    <Button variant="ghost" onClick={() => router.back()}>{t('cancelBtn')}</Button>
                  </div>
                </div>
              ) : (
                <DocxUploadPane tags={tags} onQuestionsReady={handleDocxSaved} />
              )}
            </>
          )}
        </div>
      )}

      {/* ── STEP 2: SETTINGS ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4 max-w-2xl">

          {/* Assignment name */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <Input
              label={t('labelAssignmentName')}
              placeholder={t('assignmentNamePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* ── Class targets ──────────────────────────────────────────────── */}
          <div className="space-y-2.5">

            {/* Section header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">{t('assignToClasses')}</p>
              </div>
              <button
                type="button"
                onClick={addTarget}
                className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {t('addClassBtn')}
              </button>
            </div>

            {(() => {
              // Compute which rows are duplicates (same classId + weekId) so we can warn inline
              const pairCounts: Record<string, number> = {}
              classTargets.forEach((t) => {
                if (t.classId && t.weekId) {
                  const key = `${t.classId}::${t.weekId}`
                  pairCounts[key] = (pairCounts[key] ?? 0) + 1
                }
              })
              return classTargets.map((target, idx) => {
              const isDuplicate  = !!(target.classId && target.weekId && (pairCounts[`${target.classId}::${target.weekId}`] ?? 0) > 1)
              const theme        = ROW_THEMES[idx % ROW_THEMES.length]
              const targetClasses = classes.filter((c) => c.course_id === target.courseId)
              const targetWeeks   = weeks.filter((w) => w.class_id === target.classId)
              const selectCls    = 'h-9 w-full px-3 rounded-lg border border-slate-200 bg-white text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

              return (
                <div
                  key={target._id}
                  className={`flex items-start gap-3 rounded-xl px-4 py-4 shadow-sm ${isDuplicate ? 'border border-red-300 border-l-[4px] border-l-red-500 bg-red-50' : theme.wrap}`}
                >
                  {/* Solid-colour number badge */}
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black shadow-sm ${isDuplicate ? 'bg-red-500 text-white' : theme.badge}`}>
                    {idx + 1}
                  </span>

                  {/* Selects */}
                  <div className="flex-1 space-y-2.5">

                    {/* Course + Class — side by side */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className={`block text-[10px] font-black uppercase tracking-widest ${isDuplicate ? 'text-red-600' : theme.label}`}>
                          {t('labelCourse')}
                        </label>
                        <select
                          value={target.courseId}
                          onChange={(e) => updateTarget(target._id, { courseId: e.target.value })}
                          className={selectCls}
                        >
                          <option value="">{t('selectCourse')}</option>
                          {courses.map((c) => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className={`block text-[10px] font-black uppercase tracking-widest ${isDuplicate ? 'text-red-600' : theme.label}`}>
                          {t('labelClass')}
                        </label>
                        <select
                          value={target.classId}
                          onChange={(e) => updateTarget(target._id, { classId: e.target.value })}
                          disabled={!target.courseId}
                          className={selectCls}
                        >
                          <option value="">{t('selectClass')}</option>
                          {targetClasses.map((c) => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Week — full width */}
                    <div className="space-y-1">
                      <label className={`block text-[10px] font-black uppercase tracking-widest ${isDuplicate ? 'text-red-600' : theme.label}`}>
                        {t('labelWeek')}
                      </label>
                      <select
                        value={target.weekId}
                        onChange={(e) => updateTarget(target._id, { weekId: e.target.value })}
                        disabled={!target.classId}
                        className={selectCls}
                      >
                        <option value="">{t('selectWeek')}</option>
                        {targetWeeks.map((w) => (
                          <option key={w.id} value={w.id}>{w.title}</option>
                        ))}
                      </select>
                    </div>

                    {/* Duplicate warning */}
                    {isDuplicate && (
                      <div className="flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5">
                        <svg className="w-3.5 h-3.5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                        <span className="text-xs font-semibold text-red-600">{t('warnDuplicateRow')}</span>
                      </div>
                    )}
                  </div>

                  {/* Remove */}
                  {classTargets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTarget(target._id)}
                      aria-label="Remove"
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-white/70 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )
            })
            })()}
          </div>

          {/* ── Shared settings ────────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
            <Input
              label={t('labelDeadline')}
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
            />

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsTimed(!isTimed)}
                  className={['relative w-10 h-[22px] rounded-full transition-colors', isTimed ? 'bg-primary' : 'bg-slate-300'].join(' ')}
                >
                  <span className={['absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform', isTimed ? 'translate-x-[18px]' : ''].join(' ')} />
                </button>
                <span className="text-sm font-medium text-slate-700">{t('timeLimit')}</span>
              </div>
              {isTimed && (
                <Input
                  label={t('timeLimitMinutes')}
                  type="number"
                  min="1"
                  max="300"
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <p className="text-sm font-bold text-slate-800">{t('advancedOptions')}</p>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-sm text-slate-700">{t('shuffleQuestions')}</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-sm text-slate-700">{t('shuffleOptions')}</span>
            </label>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{t('maxRetakes')}</label>
              <select
                value={maxRetakes}
                onChange={(e) => setMaxRetakes(e.target.value)}
                className="w-40 h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white text-ink"
              >
                {[1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>{t('maxRetakesUnit', { n })}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button variant="secondary" onClick={() => setStep(1)}>{t('backBtn')}</Button>
            <Button onClick={() => { setError(null); setStep(3) }}>{t('nextBtn')}</Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: CONFIRM & PUBLISH ────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5 max-w-xl">
          <Card className="p-6 space-y-4">
            <p className="text-sm font-medium text-ink mb-2">{t('confirmTitle')}</p>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between border-b border-hairline-light pb-2">
                <span className="text-mute-light">{t('confirmName')}</span>
                <span className="font-medium text-ink">{title || '—'}</span>
              </div>
              <div className="flex items-center justify-between border-b border-hairline-light pb-2">
                <span className="text-mute-light">{t('confirmQuestions')}</span>
                <span className="font-medium text-ink">{t('confirmQuestionsValue', { count: selectedIds.size })}</span>
              </div>
              <div className="flex items-center justify-between border-b border-hairline-light pb-2">
                <span className="text-mute-light">{t('confirmSource')}</span>
                <span className="font-medium text-ink">{sourceMode === 'docx' ? t('sourceDocx') : t('sourceBank')}</span>
              </div>
              {/* Multi-class targets summary */}
              {classTargets.filter((t) => t.classId).length > 0 && (
                <div className="border-b border-hairline-light pb-2 space-y-2">
                  <div className="flex items-start justify-between">
                    <span className="text-mute-light shrink-0">{t('confirmClasses')}</span>
                    <div className="flex flex-col items-end gap-1.5 ml-4">
                      {classTargets.filter((t) => t.classId).map((target) => {
                        const courseName = courses.find((c) => c.id === target.courseId)?.title ?? '—'
                        const className  = classes.find((c) => c.id === target.classId)?.title ?? '—'
                        const weekName   = target.weekId ? (weeks.find((w) => w.id === target.weekId)?.title ?? '—') : null
                        return (
                          <div key={target._id} className="text-right">
                            <span className="font-medium text-ink text-xs">{courseName} · {className}</span>
                            {weekName && <span className="text-mute-light text-xs"> · {weekName}</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between border-b border-hairline-light pb-2">
                <span className="text-mute-light">{t('confirmDeadline')}</span>
                <span className="font-medium text-ink">
                  {deadline ? new Date(deadline).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
              </div>
              {isTimed && (
                <div className="flex items-center justify-between border-b border-hairline-light pb-2">
                  <span className="text-mute-light">{t('confirmTimeLimit')}</span>
                  <span className="font-medium text-ink">{t('confirmTimeLimitValue', { minutes: timeLimitMinutes })}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-mute-light">{t('confirmRetakes')}</span>
                <span className="font-medium text-ink">{t('confirmRetakesValue', { count: maxRetakes })}</span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <label className="flex items-center gap-3 cursor-pointer">
              <button
                type="button"
                onClick={() => setPublishNow(!publishNow)}
                className={['relative w-10 h-[22px] rounded-full transition-colors', publishNow ? 'bg-primary' : 'bg-ash-light'].join(' ')}
              >
                <span className={['absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform', publishNow ? 'translate-x-[18px]' : ''].join(' ')} />
              </button>
              <div>
                <p className="text-sm font-medium text-ink">{t('publishNow')}</p>
                <p className="text-xs text-mute-light">{t('publishNowDesc')}</p>
              </div>
            </label>
          </Card>

          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => setStep(2)}>{t('backBtn')}</Button>
            <Button loading={loading} onClick={handleCreate}>
              {publishNow ? t('saveAndPublish') : t('saveOnly')}
            </Button>
          </div>
        </div>
      )}
    </div>
    </CreateFlowShell>
  )
}
