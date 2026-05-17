'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { createBrowserClient } from '@/lib/supabase/browser'

interface OptionForm {
  id?: string
  label: string
  content: string
  is_correct: boolean
}

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'hard', label: 'Khó' },
]

export default function EditQuestionPage() {
  const router = useRouter()
  const params = useParams()
  const questionId = params.id as string

  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<'multiple_choice' | 'short_answer'>('multiple_choice')
  const [content, setContent] = useState('')
  const [difficulty, setDifficulty] = useState<string>('medium')
  const [explanation, setExplanation] = useState('')
  const [options, setOptions] = useState<OptionForm[]>([
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
      if (!q) { router.push('/teacher/questions'); return }

      setType(q.type as 'multiple_choice' | 'short_answer')
      setContent(q.content ?? '')
      setDifficulty(q.difficulty ?? 'medium')
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

      setFetchLoading(false)
    }
    load()
  }, [questionId]) // eslint-disable-line react-hooks/exhaustive-deps

  function setCorrect(idx: number) {
    setOptions((prev) => prev.map((o, i) => ({ ...o, is_correct: i === idx })))
  }

  function updateOption(idx: number, field: 'content', value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, [field]: value } : o)))
  }

  function updateAnswer(idx: number, value: string) {
    setAcceptedAnswers((prev) => prev.map((a, i) => (i === idx ? value : a)))
  }

  function addAnswer() {
    setAcceptedAnswers((prev) => [...prev, ''])
  }

  function removeAnswer(idx: number) {
    setAcceptedAnswers((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setError(null)
    if (!content.trim()) { setError('Vui lòng nhập nội dung câu hỏi.'); return }
    if (type === 'multiple_choice') {
      const hasCorrect = options.some((o) => o.is_correct)
      const allFilled = options.every((o) => o.content.trim())
      if (!hasCorrect) { setError('Vui lòng chọn đáp án đúng.'); return }
      if (!allFilled) { setError('Vui lòng điền nội dung cho tất cả các lựa chọn.'); return }
    } else {
      const validAnswers = acceptedAnswers.filter((a) => a.trim())
      if (validAnswers.length === 0) { setError('Vui lòng nhập ít nhất 1 đáp án.'); return }
    }

    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        content: content.trim(),
        type,
        difficulty,
        teacher_explanation: explanation.trim() || null,
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
        setError(result.error ?? 'Lỗi khi cập nhật câu hỏi.')
        return
      }

      // The detail page is a Server Component and may already be present in the
      // client router cache from the breadcrumb path into this edit screen.
      // Navigate back, then force a fresh server render so the saved options are
      // visible immediately instead of only after a manual browser refresh.
      router.replace(`/teacher/questions/${questionId}`)
      router.refresh()
    } catch {
      setError('Lỗi hệ thống, vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (fetchLoading) {
    return (
      <div className="max-w-2xl">
        <div className="h-8 bg-ash-light rounded animate-pulse mb-4 w-48" />
        <div className="h-40 bg-ash-light rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Chỉnh sửa câu hỏi"
        breadcrumbs={[
          { label: 'Ngân hàng câu hỏi', href: '/teacher/questions' },
          { label: 'Chi tiết', href: `/teacher/questions/${questionId}` },
          { label: 'Chỉnh sửa' },
        ]}
      />

      <div className="space-y-5">
        {/* Question type */}
        <Card className="p-5">
          <p className="text-sm font-medium text-mute-light mb-3">Loại câu hỏi</p>
          <div className="flex gap-3">
            {(['multiple_choice', 'short_answer'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={[
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  type === t
                    ? 'bg-primary text-white'
                    : 'bg-surface-soft text-mute-light hover:text-ink',
                ].join(' ')}
              >
                {t === 'multiple_choice' ? 'Trắc nghiệm' : 'Điền đáp án'}
              </button>
            ))}
          </div>
        </Card>

        {/* Content */}
        <Card className="p-5">
          <p className="text-sm font-medium text-mute-light mb-2">Nội dung câu hỏi <span className="text-red-500">*</span></p>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Nhập nội dung câu hỏi..."
            rows={4}
          />
        </Card>

        {/* Multiple choice options */}
        {type === 'multiple_choice' && (
          <Card className="p-5">
            <p className="text-sm font-medium text-mute-light mb-3">Các lựa chọn <span className="text-red-500">*</span></p>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={opt.label} className="flex items-center gap-3">
                  <button
                    onClick={() => setCorrect(idx)}
                    className={[
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
                      opt.is_correct
                        ? 'bg-green-500 text-white'
                        : 'bg-ash-light text-mute-light hover:bg-ash',
                    ].join(' ')}
                    title="Chọn làm đáp án đúng"
                  >
                    {opt.label}
                  </button>
                  <Input
                    value={opt.content}
                    onChange={(e) => updateOption(idx, 'content', e.target.value)}
                    placeholder={`Lựa chọn ${opt.label}...`}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-mute-light mt-2">Nhấn vào chữ cái để chọn đáp án đúng</p>
          </Card>
        )}

        {/* Short answer */}
        {type === 'short_answer' && (
          <Card className="p-5">
            <p className="text-sm font-medium text-mute-light mb-3">Đáp án chấp nhận <span className="text-red-500">*</span></p>
            <div className="space-y-2">
              {acceptedAnswers.map((ans, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={ans}
                    onChange={(e) => updateAnswer(idx, e.target.value)}
                    placeholder={`Đáp án ${idx + 1}...`}
                  />
                  {acceptedAnswers.length > 1 && (
                    <button onClick={() => removeAnswer(idx)} className="text-mute-light hover:text-red-500 shrink-0">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addAnswer}>+ Thêm đáp án</Button>
            </div>
          </Card>
        )}

        {/* Difficulty */}
        <Card className="p-5">
          <p className="text-sm font-medium text-mute-light mb-3">Độ khó</p>
          <div className="flex gap-3">
            {DIFFICULTY_OPTIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDifficulty(d.value)}
                className={[
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  difficulty === d.value
                    ? 'bg-primary text-white'
                    : 'bg-surface-soft text-mute-light hover:text-ink',
                ].join(' ')}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Explanation */}
        <Card className="p-5">
          <p className="text-sm font-medium text-mute-light mb-2">Giải thích (tùy chọn)</p>
          <Textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Nhập giải thích cho câu hỏi..."
            rows={3}
          />
        </Card>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button loading={loading} onClick={handleSave}>Lưu thay đổi</Button>
          <Button variant="ghost" onClick={() => router.push(`/teacher/questions/${questionId}`)}>
            Hủy
          </Button>
        </div>
      </div>
    </div>
  )
}
