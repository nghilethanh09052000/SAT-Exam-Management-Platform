'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { RichTextEditor } from './rich-text-editor'
import type { ReactNode } from 'react'

export type EditableQuestionType = 'multiple_choice' | 'short_answer'
export type EditableDifficulty = 'easy' | 'medium' | 'hard'

export interface EditableOption {
  id?: string
  label: string
  content: string
  is_correct: boolean
}

interface QuestionFormEditorProps {
  type: EditableQuestionType
  onTypeChange: (type: EditableQuestionType) => void
  content: string
  onContentChange: (value: string) => void
  onUploadImage?: (file: File) => Promise<string>
  options: EditableOption[]
  onOptionsChange: (options: EditableOption[]) => void
  acceptedAnswers: string[]
  onAcceptedAnswersChange: (answers: string[]) => void
  difficulty: EditableDifficulty | null
  onDifficultyChange: (difficulty: EditableDifficulty | null) => void
  explanation?: string
  onExplanationChange?: (value: string) => void
  aiExplanation?: string
  onAiExplanationChange?: (value: string) => void
  onGenerateAiExplanation?: () => void
  generateAiExplanationLoading?: boolean
  tagSelector?: ReactNode
  compact?: boolean
}

const DIFFICULTY_CLASSNAMES: Record<EditableDifficulty, string> = {
  easy: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  hard: 'bg-red-100 text-red-700 border-red-200',
}

function setCorrectOption(options: EditableOption[], idx: number) {
  return options.map((o, i) => ({ ...o, is_correct: i === idx }))
}

function setOptionContent(options: EditableOption[], idx: number, content: string) {
  return options.map((o, i) => (i === idx ? { ...o, content } : o))
}

function EditorSection({
  children,
  compact,
  className = '',
}: {
  children: ReactNode
  compact: boolean
  className?: string
}) {
  if (compact) {
    return <div className={['border-t border-slate-100 pt-4 first:border-t-0 first:pt-0', className].join(' ')}>{children}</div>
  }

  return <Card className={['p-5', className].join(' ')}>{children}</Card>
}

export function QuestionFormEditor({
  type,
  onTypeChange,
  content,
  onContentChange,
  onUploadImage,
  options,
  onOptionsChange,
  acceptedAnswers,
  onAcceptedAnswersChange,
  difficulty,
  onDifficultyChange,
  explanation,
  onExplanationChange,
  aiExplanation,
  onAiExplanationChange,
  onGenerateAiExplanation,
  generateAiExplanationLoading = false,
  tagSelector,
  compact = false,
}: QuestionFormEditorProps) {
  const t = useTranslations('questionEditor')
  function updateAnswer(idx: number, value: string) {
    onAcceptedAnswersChange(acceptedAnswers.map((a, i) => (i === idx ? value : a)))
  }

  function addAnswer() {
    onAcceptedAnswersChange([...acceptedAnswers, ''])
  }

  function removeAnswer(idx: number) {
    onAcceptedAnswersChange(acceptedAnswers.filter((_, i) => i !== idx))
  }

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      <EditorSection compact={compact}>
        <p className="mb-3 text-sm font-medium text-ink">{t('typeLabel')} <span className="text-red-500">*</span></p>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'multiple_choice', label: t('typeMc') },
            { value: 'short_answer', label: t('typeSa') },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onTypeChange(item.value as EditableQuestionType)}
              className={[
                'rounded-[8px] px-4 py-2 text-sm font-medium transition-colors',
                type === item.value ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:text-ink',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </EditorSection>

      <EditorSection compact={compact}>
        <RichTextEditor
          label={t('questionLabel')}
          value={content}
          onChange={onContentChange}
          onUploadImage={onUploadImage}
          required
          placeholder={t('questionPlaceholder')}
          minHeight={compact ? 150 : 240}
        />
      </EditorSection>

      {type === 'multiple_choice' && (
        <EditorSection compact={compact} className="space-y-3">
          <p className="text-sm font-medium text-ink">{t('optionsLabel')} <span className="text-red-500">*</span></p>
          {options.map((opt, idx) => (
            <div key={opt.label} className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
              <button
                type="button"
                onClick={() => onOptionsChange(setCorrectOption(options, idx))}
                className={[
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                  opt.is_correct
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-primary hover:text-primary',
                ].join(' ')}
                title={t('selectCorrect')}
              >
                {opt.label}
              </button>
              <div className="space-y-1">
                <RichTextEditor
                  label={t('optionLabelPrefix', { label: opt.label })}
                  value={opt.content}
                  onChange={(value) => onOptionsChange(setOptionContent(options, idx, value))}
                  onUploadImage={onUploadImage}
                  required
                  placeholder={t('optionPlaceholder', { label: opt.label })}
                  minHeight={compact ? 90 : 120}
                />
                {opt.is_correct && <p className="text-xs font-semibold text-emerald-600">{t('correctAnswerBadge')}</p>}
              </div>
            </div>
          ))}
          <p className="text-xs text-mute-light">{t('clickLetterHint')}</p>
        </EditorSection>
      )}

      {type === 'short_answer' && (
        <EditorSection compact={compact} className="space-y-3">
          <p className="text-sm font-medium text-ink">{t('acceptedLabel')} <span className="text-red-500">*</span></p>
          {acceptedAnswers.map((answer, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={answer}
                onChange={(e) => updateAnswer(idx, e.target.value)}
                placeholder={t('answerPlaceholder', { n: idx + 1 })}
              />
              {acceptedAnswers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAnswer(idx)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title={t('removeAnswer')}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={addAnswer}>{t('addAnswer')}</Button>
        </EditorSection>
      )}

      <EditorSection compact={compact} className="space-y-5">
        {tagSelector}
        <div>
          <p className="mb-2 text-sm font-medium text-ink">{t('diffLabel')}</p>
          <div className="flex flex-wrap gap-2">
            {(['easy', 'medium', 'hard'] as EditableDifficulty[]).map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => onDifficultyChange(difficulty === diff ? null : diff)}
                className={[
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-all',
                  difficulty === diff ? DIFFICULTY_CLASSNAMES[diff] : 'border-transparent bg-slate-100 text-slate-500 hover:text-ink',
                ].join(' ')}
              >
                {t(`diff${diff.charAt(0).toUpperCase() + diff.slice(1)}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
        </div>
      </EditorSection>

      {(onExplanationChange || onAiExplanationChange) && (
        <EditorSection compact={compact} className="space-y-5">
          {onExplanationChange && (
            <RichTextEditor
              label={t('explanationLabel')}
              value={explanation ?? ''}
              onChange={onExplanationChange}
              onUploadImage={onUploadImage}
              placeholder={t('explanationPlaceholder')}
              minHeight={compact ? 120 : 160}
            />
          )}

          {onAiExplanationChange && (
            <div className="border-t border-slate-100 pt-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink">{t('aiExplanationLabel')}</p>
                {onGenerateAiExplanation && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={generateAiExplanationLoading}
                    onClick={onGenerateAiExplanation}
                  >
                    {t('generateExplanation')}
                  </Button>
                )}
              </div>
              <RichTextEditor
                label={t('aiExplanationEditorLabel')}
                value={aiExplanation ?? ''}
                onChange={onAiExplanationChange}
                onUploadImage={onUploadImage}
                placeholder={t('aiExplanationPlaceholder')}
                minHeight={compact ? 120 : 160}
              />
            </div>
          )}
        </EditorSection>
      )}
    </div>
  )
}
