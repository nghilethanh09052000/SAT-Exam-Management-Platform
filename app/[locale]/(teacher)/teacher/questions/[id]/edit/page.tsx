'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { createBrowserClient } from '@/lib/supabase/browser'
import {
  QuestionFormEditor,
  type EditableDifficulty,
  type EditableOption,
  type EditableQuestionType,
} from '@/components/questions/question-form-editor'
import { getEditorText } from '@/components/questions/rich-text-editor'

interface Tag {
  id: string
  subject: string
  name: string
}

export default function EditQuestionPage() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('teacher.questions')
  const tNav = useTranslations('nav')
  const tCommon = useTranslations('common')
  const params = useParams()
  const questionId = params.id as string

  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<EditableQuestionType>('multiple_choice')
  const [content, setContent] = useState('')
  const [difficulty, setDifficulty] = useState<EditableDifficulty | null>('medium')
  const [explanation, setExplanation] = useState('')
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTagId, setSelectedTagId] = useState('')
  const [options, setOptions] = useState<EditableOption[]>([
    { label: 'A', content: '', is_correct: true },
    { label: 'B', content: '', is_correct: false },
    { label: 'C', content: '', is_correct: false },
    { label: 'D', content: '', is_correct: false },
  ])
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>([''])

  const supabase = createBrowserClient()

  useEffect(() => {
    async function load() {
      setFetchLoading(true)
      const { data: qRaw } = await supabase
        .from('questions')
        .select('id, type, content, difficulty, teacher_explanation')
        .eq('id', questionId)
        .single()

      const q = qRaw as { id: string; type: string; content: string; difficulty: string | null; teacher_explanation: string | null } | null
      if (!q) { router.push(`/${locale}/teacher/questions`); return }

      setType(q.type as EditableQuestionType)
      setContent(q.content ?? '')
      setDifficulty((q.difficulty as EditableDifficulty | null) ?? 'medium')
      setExplanation(q.teacher_explanation ?? '')

      // Load options
      const { data: optsRaw } = await supabase
        .from('question_options')
        .select('id, label, content, is_correct, order')
        .eq('question_id', questionId)
        .order('order')
      const opts = optsRaw as { id: string; label: string; content: string; is_correct: boolean; order: number }[] | null

      if (opts && opts.length > 0) {
        setOptions(opts.map((o) => ({
          id: o.id,
          label: o.label,
          content: o.content,
          is_correct: o.is_correct,
        })))
      }

      // Load accepted answers
      const { data: answersRaw } = await supabase
        .from('question_accepted_answers')
        .select('id, answer_text')
        .eq('question_id', questionId)
      const answers = answersRaw as { id: string; answer_text: string }[] | null

      if (answers && answers.length > 0) {
        setAcceptedAnswers(answers.map((a) => a.answer_text))
      }

      const [{ data: tagsRaw }, { data: questionTagsRaw }] = await Promise.all([
        supabase.from('tags').select('id, subject, name').order('subject').order('name'),
        supabase.from('question_tags').select('tag_id').eq('question_id', questionId),
      ])
      const questionTags = (questionTagsRaw ?? []) as { tag_id: string }[]
      setTags((tagsRaw ?? []) as Tag[])
      setSelectedTagId(questionTags[0]?.tag_id ?? '')

      setFetchLoading(false)
    }
    load()
  }, [questionId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setError(null)
    if (!getEditorText(content)) { setError(t('errMissingContent')); return }
    if (type === 'multiple_choice') {
      const hasCorrect = options.some((o) => o.is_correct)
      const allFilled = options.every((o) => getEditorText(o.content))
      if (!hasCorrect) { setError(t('errNoCorrectAnswer')); return }
      if (!allFilled) { setError(t('errEmptyOptions')); return }
    } else {
      const validAnswers = acceptedAnswers.filter((a) => a.trim())
      if (validAnswers.length === 0) { setError(t('errNoAnswer')); return }
    }

    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        content: content.trim(),
        type,
        difficulty,
        teacher_explanation: explanation.trim() || null,
        tag_ids: selectedTagId ? [selectedTagId] : [],
      }

      if (type === 'multiple_choice') {
        body.options = options.map((o) => ({
          label: o.label,
          content: o.content.trim(),
          is_correct: o.is_correct,
        }))
      } else {
        body.accepted_answers = acceptedAnswers.filter((a) => a.trim())
      }

      const res = await fetch(`/api/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json() as { data: unknown; error: string | null }
      if (!res.ok || result.error) {
        setError(result.error ?? t('errUpdateFailed'))
        return
      }

      // The detail page is a Server Component and may already be present in the
      // client router cache from the breadcrumb path into this edit screen.
      // Navigate back, then force a fresh server render so the saved options are
      // visible immediately instead of only after a manual browser refresh.
      router.replace(`/teacher/questions/${questionId}`)
      router.refresh()
    } catch {
      setError(t('errSystem'))
    } finally {
      setLoading(false)
    }
  }

  const rwTags = tags.filter((t) => t.subject === 'reading_writing')
  const mathTags = tags.filter((t) => t.subject === 'math')

  const tagSelector = (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">
        {t('labelTagType')} {tags.length === 0 && <span className="ml-2 text-xs font-normal text-mute-light">{t('noTopicsHint')}</span>}
      </p>
      {tags.length > 0 ? (
        <select
          value={selectedTagId}
          onChange={(e) => setSelectedTagId(e.target.value)}
          className="h-12 w-full rounded-[8px] border border-slate-200 bg-slate-50 px-4 text-base text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary"
        >
          <option value="">{t('selectTopicPlaceholder')}</option>
          {rwTags.length > 0 && (
            <optgroup label="Reading & Writing">
              {rwTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
            </optgroup>
          )}
          {mathTags.length > 0 && (
            <optgroup label="Math">
              {mathTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
            </optgroup>
          )}
        </select>
      ) : (
        <p className="text-xs text-mute-light">{t('adminTagsHint')}</p>
      )}
    </div>
  )

  if (fetchLoading) {
    return (
      <div className="max-w-2xl">
        <div className="h-8 bg-ash-light rounded animate-pulse mb-4 w-48" />
        <div className="h-40 bg-ash-light rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={t('editTitle')}
        breadcrumbs={[
          { label: tNav('questionBank'), href: '/teacher/questions' },
          { label: t('breadcrumbDetail'), href: `/teacher/questions/${questionId}` },
          { label: t('breadcrumbEdit') },
        ]}
      />

      <div className="space-y-5">
        <QuestionFormEditor
          type={type}
          onTypeChange={setType}
          content={content}
          onContentChange={setContent}
          options={options}
          onOptionsChange={setOptions}
          acceptedAnswers={acceptedAnswers}
          onAcceptedAnswersChange={setAcceptedAnswers}
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          explanation={explanation}
          onExplanationChange={setExplanation}
          tagSelector={tagSelector}
        />

        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button loading={loading} onClick={handleSave}>{t('saveChanges')}</Button>
          <Button variant="ghost" onClick={() => router.push(`/${locale}/teacher/questions/${questionId}`)}>
            {tCommon('cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}
