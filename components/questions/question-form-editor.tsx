'use client'

import { useState } from 'react'
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
  /** Full combined content (passage + stem). Always kept in sync. */
  content: string
  onContentChange: (value: string) => void
  /** Optional reading passage / stimulus (left panel in split-screen). */
  stimulus?: string
  onStimulusChange?: (value: string) => void
  /** Optional question prompt separate from the stimulus. */
  prompt?: string
  onPromptChange?: (value: string) => void
  subject?: string | null
  onSubjectChange?: (value: string | null) => void
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
  colorClass = '',
}: {
  children: ReactNode
  compact: boolean
  className?: string
  /** When provided the section renders as a colored div instead of the default Card. */
  colorClass?: string
}) {
  if (compact) {
    return <div className={['border-t border-slate-100 pt-4 first:border-t-0 first:pt-0', className].join(' ')}>{children}</div>
  }

  if (colorClass) {
    return (
      <div className={['rounded-card p-5 border shadow-sm', colorClass, className].join(' ')}>
        {children}
      </div>
    )
  }

  return <Card className={['p-5', className].join(' ')}>{children}</Card>
}

export function QuestionFormEditor({
  type,
  onTypeChange,
  content,
  onContentChange,
  stimulus,
  onStimulusChange,
  prompt,
  onPromptChange,
  subject,
  onSubjectChange,
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

  // Whether the split-screen passage toggle is on.
  // Initialise to true if a stimulus was already provided (edit mode).
  const [hasStimulusToggle, setHasStimulusToggle] = useState<boolean>(
    Boolean(stimulus && stimulus.trim().length > 0)
  )

  function updateAnswer(idx: number, value: string) {
    onAcceptedAnswersChange(acceptedAnswers.map((a, i) => (i === idx ? value : a)))
  }

  function addAnswer() {
    onAcceptedAnswersChange([...acceptedAnswers, ''])
  }

  function removeAnswer(idx: number) {
    onAcceptedAnswersChange(acceptedAnswers.filter((_, i) => i !== idx))
  }

  function handleStimulusToggle(enabled: boolean) {
    setHasStimulusToggle(enabled)
    if (!enabled) {
      // Clear stimulus/prompt when toggling off — consolidate back to content
      onStimulusChange?.('')
      onPromptChange?.('')
    }
  }

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      {/* ── Question type ──────────────────────────────────────────────────── */}
      <EditorSection compact={compact} colorClass="bg-indigo-50 border-indigo-200">
        <p className="mb-3 text-sm font-semibold text-indigo-700 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-200 text-indigo-700 text-[10px] font-bold">①</span>
          {t('typeLabel')} <span className="text-red-500">*</span>
        </p>
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
                'rounded-[8px] px-4 py-2 text-sm font-semibold transition-all border',
                type === item.value
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200'
                  : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-100',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </EditorSection>

      {/* ── Subject ────────────────────────────────────────────────────────── */}
      {onSubjectChange !== undefined && (
        <EditorSection compact={compact} colorClass="bg-violet-50 border-violet-200">
          <p className="mb-3 text-sm font-semibold text-violet-700 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-violet-700 text-[10px] font-bold">②</span>
            {t('subjectLabel')}
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { value: null,              label: t('subjectNone'),  active: 'bg-slate-600 text-white border-slate-600 shadow-sm',               inactive: 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'   },
              { value: 'math',            label: t('subjectMath'),  active: 'bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-200', inactive: 'bg-white text-violet-600 border-violet-300 hover:bg-violet-100' },
              { value: 'reading_writing', label: t('subjectRW'),    active: 'bg-sky-500 text-white border-sky-500 shadow-sm shadow-sky-200',        inactive: 'bg-white text-sky-600 border-sky-300 hover:bg-sky-100'          },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => onSubjectChange(opt.value)}
                className={[
                  'rounded-full px-4 py-1.5 text-sm font-semibold transition-all border',
                  subject === opt.value ? opt.active : opt.inactive,
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </EditorSection>
      )}

      {/* ── Passage (stimulus) toggle ──────────────────────────────────────── */}
      {onStimulusChange !== undefined && (
        <EditorSection compact={compact} colorClass="bg-sky-50 border-sky-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-sky-700 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-sky-700 text-[10px] font-bold">③</span>
                {t('stimulusToggleLabel')}
              </p>
              <p className="text-xs text-sky-600/70 mt-0.5 ml-7">{t('stimulusToggleHint')}</p>
            </div>
            <button
              type="button"
              onClick={() => handleStimulusToggle(!hasStimulusToggle)}
              className={[
                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                hasStimulusToggle ? 'bg-sky-500' : 'bg-sky-200',
              ].join(' ')}
              role="switch"
              aria-checked={hasStimulusToggle}
            >
              <span
                className={[
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
                  hasStimulusToggle ? 'translate-x-5' : 'translate-x-0',
                ].join(' ')}
              />
            </button>
          </div>

          {hasStimulusToggle && (
            <div className="mt-4 space-y-4">
              {/* Stimulus / passage */}
              <div className="rounded-[8px] border border-sky-200 bg-white/70 p-4">
                <RichTextEditor
                  label={t('stimulusLabel')}
                  value={stimulus ?? ''}
                  onChange={(v) => onStimulusChange(v)}
                  onUploadImage={onUploadImage}
                  placeholder={t('stimulusPlaceholder')}
                  minHeight={compact ? 180 : 260}
                />
              </div>

              {/* Prompt / question stem */}
              {onPromptChange !== undefined && (
                <div className="rounded-[8px] border border-indigo-200 bg-white/70 p-4">
                  <RichTextEditor
                    label={t('promptLabel')}
                    value={prompt ?? ''}
                    onChange={(v) => onPromptChange(v)}
                    onUploadImage={onUploadImage}
                    required
                    placeholder={t('promptPlaceholder')}
                    minHeight={compact ? 100 : 140}
                  />
                </div>
              )}

              <p className="text-xs text-sky-600/70">{t('stimulusLayoutHint')}</p>
            </div>
          )}
        </EditorSection>
      )}

      {/* ── Main question content (shown when no split-screen) ─────────────── */}
      {(!onStimulusChange || !hasStimulusToggle) && (
        <EditorSection compact={compact} colorClass="bg-amber-50 border-amber-200">
          <RichTextEditor
            label={
              <span className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-amber-700 text-[10px] font-bold">✎</span>
                {t('questionLabel')} <span className="text-red-500">*</span>
              </span>
            }
            value={content}
            onChange={onContentChange}
            onUploadImage={onUploadImage}
            required
            placeholder={t('questionPlaceholder')}
            minHeight={compact ? 150 : 240}
          />
        </EditorSection>
      )}

      {/* ── Options (MC) ───────────────────────────────────────────────────── */}
      {type === 'multiple_choice' && (
        <EditorSection compact={compact} colorClass="bg-emerald-50 border-emerald-200" className="space-y-3">
          <p className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-emerald-700 text-[10px] font-bold">✓</span>
            {t('optionsLabel')} <span className="text-red-500">*</span>
          </p>
          {options.map((opt, idx) => (
            <div key={opt.label} className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
              <button
                type="button"
                onClick={() => onOptionsChange(setCorrectOption(options, idx))}
                className={[
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all',
                  opt.is_correct
                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-200'
                    : 'border-emerald-300 bg-white text-emerald-600 hover:border-emerald-500 hover:bg-emerald-100',
                ].join(' ')}
                title={t('selectCorrect')}
              >
                {opt.label}
              </button>
              <div className="space-y-1">
                <div className={['rounded-[8px] p-3 transition-colors', opt.is_correct ? 'bg-emerald-100/60 border border-emerald-200' : 'bg-white/60 border border-emerald-100'].join(' ')}>
                  <RichTextEditor
                    label={t('optionLabelPrefix', { label: opt.label })}
                    value={opt.content}
                    onChange={(value) => onOptionsChange(setOptionContent(options, idx, value))}
                    onUploadImage={onUploadImage}
                    required
                    placeholder={t('optionPlaceholder', { label: opt.label })}
                    minHeight={compact ? 90 : 120}
                  />
                </div>
                {opt.is_correct && (
                  <p className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <span>✓</span> {t('correctAnswerBadge')}
                  </p>
                )}
              </div>
            </div>
          ))}
          <p className="text-xs text-emerald-600/70">{t('clickLetterHint')}</p>
        </EditorSection>
      )}

      {/* ── Accepted answers (SA) ──────────────────────────────────────────── */}
      {type === 'short_answer' && (
        <EditorSection compact={compact} colorClass="bg-teal-50 border-teal-200" className="space-y-3">
          <p className="text-sm font-semibold text-teal-700 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-200 text-teal-700 text-[10px] font-bold">✓</span>
            {t('acceptedLabel')} <span className="text-red-500">*</span>
          </p>
          {acceptedAnswers.map((answer, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={answer}
                onChange={(e) => updateAnswer(idx, e.target.value)}
                placeholder={t('answerPlaceholder', { n: idx + 1 })}
                className="border-teal-200 focus:border-teal-400 focus:ring-teal-200 bg-white"
              />
              {acceptedAnswers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAnswer(idx)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-teal-400 hover:bg-red-50 hover:text-red-600"
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

      {/* ── Tags + Difficulty ──────────────────────────────────────────────── */}
      <EditorSection compact={compact} colorClass="bg-rose-50 border-rose-200" className="space-y-5">
        {tagSelector}
        <div>
          <p className="mb-2 text-sm font-semibold text-rose-700 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-rose-700 text-[10px] font-bold">★</span>
            {t('diffLabel')}
          </p>
          <div className="flex flex-wrap gap-2">
            {(['easy', 'medium', 'hard'] as EditableDifficulty[]).map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => onDifficultyChange(difficulty === diff ? null : diff)}
                className={[
                  'rounded-full border px-4 py-1.5 text-sm font-semibold transition-all',
                  difficulty === diff
                    ? DIFFICULTY_CLASSNAMES[diff]
                    : diff === 'easy'   ? 'border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50'
                    : diff === 'medium' ? 'border-amber-200 bg-white text-amber-600 hover:bg-amber-50'
                    :                    'border-red-200 bg-white text-red-500 hover:bg-red-50',
                ].join(' ')}
              >
                {t(`diff${diff.charAt(0).toUpperCase() + diff.slice(1)}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
        </div>
      </EditorSection>

      {/* ── Explanations ───────────────────────────────────────────────────── */}
      {(onExplanationChange || onAiExplanationChange) && (
        <EditorSection compact={compact} colorClass="bg-purple-50 border-purple-200" className="space-y-5">
          {onExplanationChange && (
            <RichTextEditor
              label={
                <span className="flex items-center gap-2 text-purple-700 font-semibold text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-200 text-purple-700 text-[10px] font-bold">💡</span>
                  {t('explanationLabel')}
                </span>
              }
              value={explanation ?? ''}
              onChange={onExplanationChange}
              onUploadImage={onUploadImage}
              placeholder={t('explanationPlaceholder')}
              minHeight={compact ? 120 : 160}
            />
          )}

          {onAiExplanationChange && (
            <div className="border-t border-purple-200 pt-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-purple-700 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-200 text-purple-700 text-[10px]">✨</span>
                  {t('aiExplanationLabel')}
                </p>
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
