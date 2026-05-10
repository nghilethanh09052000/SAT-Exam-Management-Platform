'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { createBrowserClient } from '@/lib/supabase/browser'

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'hard', label: 'Khó' },
]

interface OptionForm {
  label: string
  content: string
  is_correct: boolean
}

function generateHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

export default function NewQuestionPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<'multiple_choice' | 'short_answer'>('multiple_choice')
  const [content, setContent] = useState('')
  const [difficulty, setDifficulty] = useState<string>('medium')
  const [explanation, setExplanation] = useState('')
  const [options, setOptions] = useState<OptionForm[]>([
    { label: 'A', content: '', is_correct: false },
    { label: 'B', content: '', is_correct: false },
    { label: 'C', content: '', is_correct: false },
    { label: 'D', content: '', is_correct: false },
  ])
  const [acceptedAnswers, setAcceptedAnswers] = useState('')

  function setCorrect(idx: number) {
    setOptions((prev) =>
      prev.map((o, i) => ({ ...o, is_correct: i === idx }))
    )
  }

  function updateOption(idx: number, content: string) {
    setOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, content } : o))
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!content.trim()) {
      setError('Vui lòng nhập nội dung câu hỏi.')
      return
    }
    if (type === 'multiple_choice' && !options.some((o) => o.is_correct)) {
      setError('Vui lòng chọn đáp án đúng.')
      return
    }

    setLoading(true)
    try {
      const body = {
        type,
        content: content.trim(),
        difficulty,
        content_hash: generateHash(content.trim()),
        teacher_explanation: explanation || null,
        options: type === 'multiple_choice'
          ? options.map((o, i) => ({ ...o, order: i + 1 }))
          : undefined,
        accepted_answers: type === 'short_answer'
          ? acceptedAnswers.split('\n').map((a) => a.trim()).filter(Boolean)
          : undefined,
      }

      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
        return
      }
      router.push('/teacher/questions')
    } catch {
      setError('Đã có lỗi xảy ra. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Tạo câu hỏi mới"
        breadcrumbs={[
          { label: 'Ngân hàng câu hỏi', href: '/teacher/questions' },
          { label: 'Tạo mới' },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-[6px] bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-warning">{error}</p>
          </div>
        )}

        {/* Type selector */}
        <Card className="p-5">
          <p className="text-sm font-medium text-ink mb-3">Loại câu hỏi</p>
          <div className="flex gap-3">
            {[
              { value: 'multiple_choice', label: 'Trắc nghiệm' },
              { value: 'short_answer', label: 'Điền đáp án' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value as typeof type)}
                className={[
                  'px-4 py-2 rounded-full text-sm font-medium transition-colors',
                  type === opt.value
                    ? 'bg-primary text-white'
                    : 'bg-surface-soft text-mute-light hover:text-ink',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Content */}
        <Card className="p-5">
          <Textarea
            label="Nội dung câu hỏi"
            placeholder="Nhập câu hỏi..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            required
          />
        </Card>

        {/* Options (multiple choice) */}
        {type === 'multiple_choice' && (
          <Card className="p-5 space-y-3">
            <p className="text-sm font-medium text-ink">Các lựa chọn</p>
            {options.map((opt, i) => (
              <div key={opt.label} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCorrect(i)}
                  className={[
                    'w-8 h-8 shrink-0 rounded-full border-2 text-xs font-bold transition-colors',
                    opt.is_correct
                      ? 'bg-primary border-primary text-white'
                      : 'border-ash-light text-mute-light hover:border-primary hover:text-primary',
                  ].join(' ')}
                  title="Đánh dấu là đáp án đúng"
                >
                  {opt.label}
                </button>
                <input
                  type="text"
                  placeholder={`Lựa chọn ${opt.label}`}
                  value={opt.content}
                  onChange={(e) => updateOption(i, e.target.value)}
                  className="flex-1 h-10 px-3 rounded-[6px] border border-ash-light text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {opt.is_correct && (
                  <span className="text-xs text-green-600 font-medium shrink-0">Đúng</span>
                )}
              </div>
            ))}
            <p className="text-xs text-mute-light">
              Nhấn vào chữ cái để đánh dấu đáp án đúng
            </p>
          </Card>
        )}

        {/* Accepted answers (short answer) */}
        {type === 'short_answer' && (
          <Card className="p-5">
            <Textarea
              label="Đáp án chấp nhận (mỗi dòng một đáp án)"
              placeholder="8&#10;8.0&#10;eight"
              value={acceptedAnswers}
              onChange={(e) => setAcceptedAnswers(e.target.value)}
              rows={4}
            />
          </Card>
        )}

        {/* Difficulty */}
        <Card className="p-5">
          <p className="text-sm font-medium text-ink mb-3">Độ khó</p>
          <div className="flex gap-3">
            {DIFFICULTY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDifficulty(opt.value)}
                className={[
                  'px-4 py-2 rounded-full text-sm font-medium transition-colors',
                  difficulty === opt.value
                    ? 'bg-primary text-white'
                    : 'bg-surface-soft text-mute-light hover:text-ink',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Explanation */}
        <Card className="p-5">
          <Textarea
            label="Giải thích (tùy chọn)"
            placeholder="Giải thích tại sao đáp án đúng..."
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={3}
          />
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={loading}>
            Lưu câu hỏi
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Hủy
          </Button>
        </div>
      </form>
    </div>
  )
}
