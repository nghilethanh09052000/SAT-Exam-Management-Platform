'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
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

interface EditQuestionData {
  question: {
    id: string
    type: string
    content: string
    stimulus: string | null
    prompt: string | null
    subject: string | null
    difficulty: string | null
    teacher_explanation: string | null
    ai_explanation: string | null
  }
  options: Array<{
    id: string
    label: string
    content: string
    is_correct: boolean
    order: number
  }>
  accepted_answers: Array<{ id: string; answer_text: string }>
  tags: Tag[]
  tag_ids: string[]
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
  const [aiLoading, setAiLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<EditableQuestionType>('multiple_choice')
  const [content, setContent] = useState('')
  const [stimulus, setStimulus] = useState('')
  const [prompt, setPrompt] = useState('')
  const [subject, setSubject] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<EditableDifficulty | null>('medium')
  const [explanation, setExplanation] = useState('')
  const [aiExplanation, setAiExplanation] = useState('')
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTagId, setSelectedTagId] = useState('')
  const [options, setOptions] = useState<EditableOption[]>([])
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>([''])

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setFetchLoading(true)
      setLoadError(null)

      try {
        const res = await fetch(`/api/questions/${questionId}/edit-data`, {
          signal: controller.signal,
        })
        const result = await res.json() as { data: EditQuestionData | null; error: string | null }

        if (!res.ok || result.error || !result.data?.question) {
          throw new Error(result.error ?? t('errSystem'))
        }

        const { question, options: loadedOptions, accepted_answers, tags, tag_ids } = result.data

        setType(question.type as EditableQuestionType)
        setContent(question.content ?? '')
        setStimulus(question.stimulus ?? '')
        setPrompt(question.prompt ?? '')
        setSubject(question.subject ?? null)
        setDifficulty((question.difficulty as EditableDifficulty | null) ?? 'medium')
        setExplanation(question.teacher_explanation ?? '')
        setAiExplanation(question.ai_explanation ?? '')

        setOptions(loadedOptions.map((o) => ({
          id: o.id,
          label: o.label,
          content: o.content,
          is_correct: o.is_correct,
        })))
        setAcceptedAnswers(
          accepted_answers.length > 0
            ? accepted_answers.map((answer) => answer.answer_text)
            : ['']
        )

        setTags(tags)
        setSelectedTagId(tag_ids[0] ?? '')
      } catch (loadErr) {
        if (controller.signal.aborted) return
        setLoadError(loadErr instanceof Error ? loadErr.message : t('errSystem'))
      } finally {
        if (!controller.signal.aborted) setFetchLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [questionId, t])

  async function handleSave() {
    setError(null)
    const hasSplit = Boolean(stimulus.trim())
    const effectiveContent = hasSplit ? (prompt.trim() || stimulus.trim()) : content
    if (!getEditorText(effectiveContent)) { setError(t('errMissingContent')); return }
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
      const hasSplit = Boolean(stimulus.trim())
      const resolvedContent = hasSplit
        ? [stimulus.trim(), prompt.trim()].filter(Boolean).join('\n\n')
        : content.trim()

      const body: Record<string, unknown> = {
        content: resolvedContent,
        stimulus: hasSplit ? stimulus.trim() : null,
        prompt:   hasSplit ? prompt.trim()   : null,
        subject:  subject ?? null,
        type,
        difficulty,
        teacher_explanation: explanation.trim() || null,
        ai_explanation: aiExplanation.trim() || null,
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

  async function uploadEditorImage(file: File) {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/questions/images', {
      method: 'POST',
      body: formData,
    })
    const json = await res.json()
    if (!res.ok || json.error || !json.url) {
      throw new Error(json.error ?? t('errSystem'))
    }
    return json.url as string
  }

  async function handleGenerateExplanation() {
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

    setAiLoading(true)
    try {
      const body: Record<string, unknown> = {
        content: content.trim(),
        type,
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

      const res = await fetch(`/api/questions/${questionId}/ai-explanation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json() as { data: { explanation?: string } | null; error: string | null }
      if (!res.ok || result.error || !result.data?.explanation) {
        setError(result.error ?? t('errSystem'))
        return
      }

      setAiExplanation(result.data.explanation)
    } catch {
      setError(t('errSystem'))
    } finally {
      setAiLoading(false)
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
            <optgroup label={t('groupRW')}>
              {rwTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
            </optgroup>
          )}
          {mathTags.length > 0 && (
            <optgroup label={t('groupMath')}>
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

  if (loadError) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {loadError}
        </div>
        <Button className="mt-4" variant="ghost" onClick={() => router.push(`/${locale}/teacher/questions/${questionId}`)}>
          {tCommon('cancel')}
        </Button>
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
          stimulus={stimulus}
          onStimulusChange={setStimulus}
          prompt={prompt}
          onPromptChange={setPrompt}
          subject={subject}
          onSubjectChange={setSubject}
          onUploadImage={uploadEditorImage}
          options={options}
          onOptionsChange={setOptions}
          acceptedAnswers={acceptedAnswers}
          onAcceptedAnswersChange={setAcceptedAnswers}
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          explanation={explanation}
          onExplanationChange={setExplanation}
          aiExplanation={aiExplanation}
          onAiExplanationChange={setAiExplanation}
          onGenerateAiExplanation={handleGenerateExplanation}
          generateAiExplanationLoading={aiLoading}
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
