'use client'

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
  options: EditableOption[]
  onOptionsChange: (options: EditableOption[]) => void
  acceptedAnswers: string[]
  onAcceptedAnswersChange: (answers: string[]) => void
  difficulty: EditableDifficulty | null
  onDifficultyChange: (difficulty: EditableDifficulty | null) => void
  explanation?: string
  onExplanationChange?: (value: string) => void
  tagSelector?: ReactNode
  compact?: boolean
}

const DIFFICULTY_OPTIONS: Array<{ value: EditableDifficulty; label: string; className: string }> = [
  { value: 'easy', label: 'Dễ', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'medium', label: 'Trung bình', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'hard', label: 'Khó', className: 'bg-red-100 text-red-700 border-red-200' },
]

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
  options,
  onOptionsChange,
  acceptedAnswers,
  onAcceptedAnswersChange,
  difficulty,
  onDifficultyChange,
  explanation,
  onExplanationChange,
  tagSelector,
  compact = false,
}: QuestionFormEditorProps) {
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
        <p className="mb-3 text-sm font-medium text-ink">Loại câu hỏi <span className="text-red-500">*</span></p>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'multiple_choice', label: 'Trắc nghiệm' },
            { value: 'short_answer', label: 'Điền đáp án' },
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
          label="Câu hỏi"
          value={content}
          onChange={onContentChange}
          required
          placeholder="Nhập nội dung câu hỏi..."
          minHeight={compact ? 150 : 240}
        />
      </EditorSection>

      {type === 'multiple_choice' && (
        <EditorSection compact={compact} className="space-y-3">
          <p className="text-sm font-medium text-ink">Các lựa chọn <span className="text-red-500">*</span></p>
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
                title="Chọn làm đáp án đúng"
              >
                {opt.label}
              </button>
              <div className="space-y-1">
                <RichTextEditor
                  label={`Lựa chọn ${opt.label}`}
                  value={opt.content}
                  onChange={(value) => onOptionsChange(setOptionContent(options, idx, value))}
                  required
                  placeholder={`Nhập lựa chọn ${opt.label}...`}
                  minHeight={compact ? 90 : 120}
                />
                {opt.is_correct && <p className="text-xs font-semibold text-emerald-600">Đáp án đúng</p>}
              </div>
            </div>
          ))}
          <p className="text-xs text-mute-light">Nhấn vào chữ cái để đánh dấu đáp án đúng.</p>
        </EditorSection>
      )}

      {type === 'short_answer' && (
        <EditorSection compact={compact} className="space-y-3">
          <p className="text-sm font-medium text-ink">Đáp án chấp nhận <span className="text-red-500">*</span></p>
          {acceptedAnswers.map((answer, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={answer}
                onChange={(e) => updateAnswer(idx, e.target.value)}
                placeholder={`Đáp án ${idx + 1}...`}
              />
              {acceptedAnswers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAnswer(idx)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Xóa đáp án"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={addAnswer}>+ Thêm đáp án</Button>
        </EditorSection>
      )}

      <EditorSection compact={compact} className="space-y-5">
        {tagSelector}
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Độ khó</p>
          <div className="flex flex-wrap gap-2">
            {DIFFICULTY_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => onDifficultyChange(difficulty === item.value ? null : item.value)}
                className={[
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-all',
                  difficulty === item.value ? item.className : 'border-transparent bg-slate-100 text-slate-500 hover:text-ink',
                ].join(' ')}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </EditorSection>

      {onExplanationChange && (
        <EditorSection compact={compact}>
          <RichTextEditor
            label="Giải thích (tùy chọn)"
            value={explanation ?? ''}
            onChange={onExplanationChange}
            placeholder="Giải thích tại sao đáp án đúng..."
            minHeight={compact ? 120 : 160}
          />
        </EditorSection>
      )}
    </div>
  )
}
