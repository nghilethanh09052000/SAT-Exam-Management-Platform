'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
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
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const [type, setType]               = useState<EditableQuestionType>('multiple_choice')
  const [content, setContent]         = useState('')
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

  const rwTags   = tags.filter((t) => t.subject === 'reading_writing')
  const mathTags = tags.filter((t) => t.subject === 'math')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!getEditorText(content)) {
      setError('Vui lòng nhập nội dung câu hỏi.')
      return
    }
    if (type === 'multiple_choice') {
      if (!options.some((o) => o.is_correct)) {
        setError('Vui lòng chọn đáp án đúng.')
        return
      }
      if (!options.every((o) => getEditorText(o.content))) {
        setError('Vui lòng điền nội dung cho tất cả các lựa chọn.')
        return
      }
    }
    if (type === 'short_answer' && !acceptedAnswers.some((a) => a.trim())) {
      setError('Vui lòng nhập ít nhất 1 đáp án chấp nhận.')
      return
    }

    setLoading(true)
    try {
      const correctAnswer = type === 'multiple_choice'
        ? options.find((o) => o.is_correct)?.content ?? ''
        : acceptedAnswers.find((a) => a.trim()) ?? ''
      const body = {
        type,
        content: content.trim(),
        difficulty,
        content_hash: generateHash(`${getEditorText(content)}|${getEditorText(correctAnswer)}`),
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
      setError('Đã có lỗi xảy ra. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const tagSelector = (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">
          Chủ đề
          {tags.length === 0 && (
            <span className="ml-2 text-xs text-mute-light font-normal">(chưa có tag — admin cần thêm vào DB)</span>
          )}
        </p>
        {selectedTagId && (
          <button
            type="button"
            onClick={() => setSelectedTagId('')}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200 hover:text-ink"
          >
            Bỏ chọn
          </button>
        )}
      </div>

      {tags.length > 0 ? (
        <div className="space-y-4">
          {rwTags.length > 0 && (
            <div className="rounded-[8px] border border-blue-100 bg-blue-50/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-blue-600">Reading &amp; Writing</p>
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
              <p className="mb-2 text-xs font-semibold uppercase text-violet-600">Math</p>
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
          Chưa có chủ đề nào. Admin cần thêm tags vào bảng <code className="bg-surface-soft px-1 rounded">tags</code> trước.
        </p>
      )}
    </div>
  )

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Tạo câu hỏi mới"
        breadcrumbs={[
          { label: 'Ngân hàng câu hỏi', href: '/teacher/questions' },
          { label: 'Tạo mới' },
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
          <Button type="submit" loading={loading}>Lưu câu hỏi</Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>Hủy</Button>
        </div>
      </form>
    </div>
  )
}
