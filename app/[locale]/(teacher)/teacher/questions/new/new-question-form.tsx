'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useAsyncAction } from '@/hooks/use-async'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import {
  QuestionFormEditor,
  type EditableDifficulty,
  type EditableOption,
  type EditableQuestionType,
} from '@/components/questions/question-form-editor'
import { getEditorText } from '@/components/questions/rich-text-editor'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tag {
  id: string
  subject: string
  name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NewQuestionForm({ tags }: { tags: Tag[] }) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('teacher.questions')
  const [error, setError] = useState<string | null>(null)

  const [type, setType]               = useState<EditableQuestionType>('multiple_choice')
  const [content, setContent]         = useState('')
  const [stimulus, setStimulus]       = useState('')
  const [prompt, setPrompt]           = useState('')
  const [subject, setSubject]         = useState<string | null>(null)
  const [difficulty, setDifficulty]   = useState<EditableDifficulty | null>('medium')
  const [explanation, setExplanation] = useState('')
  const [selectedTagId, setSelectedTagId] = useState<string>('')

  const [options, setOptions] = useState<EditableOption[]>([
    { label: 'A', content: '', is_correct: false },
    { label: 'B', content: '', is_correct: false },
    { label: 'C', content: '', is_correct: false },
    { label: 'D', content: '', is_correct: false },
  ])
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>([''])

  const rwTags   = tags.filter((tag) => tag.subject === 'reading_writing')
  const mathTags = tags.filter((tag) => tag.subject === 'math')

  async function uploadEditorImage(file: File) {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/questions/images', {
      method: 'POST',
      body: formData,
    })
    const json = await res.json()
    if (!res.ok || json.error || !json.url) {
      throw new Error(json.error ?? t('errGeneric'))
    }
    return json.url as string
  }

  const { loading, run: saveQuestion } = useAsyncAction(async () => {
    try {
      const correctAnswer = type === 'multiple_choice'
        ? options.find((o) => o.is_correct)?.content ?? ''
        : acceptedAnswers.find((a) => a.trim()) ?? ''

      // When split-screen is active, derive the combined content from
      // stimulus + prompt so the content field stays consistent.
      const hasSplit = Boolean(stimulus.trim())
      const resolvedContent = hasSplit
        ? [stimulus.trim(), prompt.trim()].filter(Boolean).join('\n\n')
        : content.trim()
      const hashBase = hasSplit ? getEditorText(prompt || stimulus) : getEditorText(content)

      const body = {
        type,
        content: resolvedContent,
        stimulus: hasSplit ? stimulus.trim() : null,
        prompt:   hasSplit ? prompt.trim()   : null,
        subject:  subject ?? null,
        difficulty,
        content_hash: generateHash(`${hashBase}|${getEditorText(correctAnswer)}`),
        teacher_explanation: explanation.trim() || null,
        tag_ids: selectedTagId ? [selectedTagId] : [],
        options: type === 'multiple_choice'
          ? options.map((o, i) => ({ ...o, content: o.content.trim(), order: i + 1 }))
          : undefined,
        accepted_answers: type === 'short_answer'
          ? acceptedAnswers.map((a) => a.trim()).filter(Boolean)
          : undefined,
      }

      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) { setError(json.error); return }
      router.push(`/${locale}/teacher/questions`)
      router.refresh()
    } catch {
      setError(t('errGeneric'))
    }
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const hasSplit = Boolean(stimulus.trim())
    const effectiveContent = hasSplit ? (prompt.trim() || stimulus.trim()) : content
    if (!getEditorText(effectiveContent)) { setError(t('errNoContent')); return }
    if (type === 'multiple_choice') {
      if (!options.some((o) => o.is_correct)) { setError(t('errNoCorrect')); return }
      if (!options.every((o) => getEditorText(o.content))) { setError(t('errAllOptions')); return }
    }
    if (type === 'short_answer' && !acceptedAnswers.some((a) => a.trim())) {
      setError(t('errNoAnswerSa'))
      return
    }

    await saveQuestion()
  }

  const tagSelector = (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">
          {t('topicLabel')}
          {tags.length === 0 && (
            <span className="ml-2 text-xs text-mute-light font-normal">{t('noTagsHint')}</span>
          )}
        </p>
        {selectedTagId && (
          <button
            type="button"
            onClick={() => setSelectedTagId('')}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200 hover:text-ink"
          >
            {t('clearTag')}
          </button>
        )}
      </div>

      {tags.length > 0 ? (
        <div className="space-y-4">
          {rwTags.length > 0 && (
            <div className="rounded-[8px] border border-blue-100 bg-blue-50/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-blue-600">{t('groupRW')}</p>
              <div className="flex flex-wrap gap-2">
                {rwTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setSelectedTagId(selectedTagId === tag.id ? '' : tag.id)}
                    className={[
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                      selectedTagId === tag.id
                        ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-200'
                        : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-100',
                    ].join(' ')}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mathTags.length > 0 && (
            <div className="rounded-[8px] border border-violet-100 bg-violet-50/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-violet-600">{t('groupMath')}</p>
              <div className="flex flex-wrap gap-2">
                {mathTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setSelectedTagId(selectedTagId === tag.id ? '' : tag.id)}
                    className={[
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                      selectedTagId === tag.id
                        ? 'border-violet-600 bg-violet-600 text-white shadow-sm shadow-violet-200'
                        : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-100',
                    ].join(' ')}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs italic text-mute-light">
          {t('noTagsEmpty', { table: 'tags' })}
        </p>
      )}
    </div>
  )

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={t('newTitle')}
        breadcrumbs={[
          { label: t('title'), href: '/teacher/questions' },
          { label: t('breadcrumbNew') },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-warning">{error}</p>
          </div>
        )}

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
          tagSelector={tagSelector}
        />

        <div className="sticky bottom-0 z-10 flex items-center gap-3 border-t border-slate-200 bg-white/90 py-4 backdrop-blur">
          <Button type="submit" loading={loading}>{t('saveBtn')}</Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>{t('cancelBtn')}</Button>
        </div>
      </form>
    </div>
  )
}
