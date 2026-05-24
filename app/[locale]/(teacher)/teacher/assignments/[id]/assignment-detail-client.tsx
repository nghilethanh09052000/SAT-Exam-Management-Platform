'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string
  title: string
  created_at: string
}

interface InstanceRow {
  id: string
  deadline: string
  published_at: string | null
  is_timed: boolean
  time_limit_seconds: number | null
  max_retakes: number
  classes: { id: string; title: string } | null
  weeks: { id: string; title: string } | null
}

interface SubmissionRow {
  id: string
  instance_id: string
  student_id: string
  attempt_number: number
  status: string
  raw_score: number | null
  total_questions: number | null
  submitted_at: string | null
  time_spent_seconds: number | null
  profiles: { full_name: string; phone: string | null } | null
}

interface QuestionOption {
  id: string
  label: string
  content: string
  is_correct: boolean
  order: number
}

// Full detail is fetched lazily on "Xem" click — not loaded on page mount
interface QuestionDetail {
  id: string
  type: string
  content: string
  difficulty: string | null
  ai_explanation: string | null
  teacher_explanation: string | null
  question_options: QuestionOption[]
  question_accepted_answers: { id: string; answer_text: string }[]
}

// Lightweight list row — only what is needed for the table
interface QuestionRow {
  id: string
  order: number
  score_weight: number
  module: string
  question: {
    id: string
    type: string
    content: string
    difficulty: string | null
  }
}

interface Props {
  assignment: Assignment
  instances: InstanceRow[]
  submissions: SubmissionRow[]
  questions: QuestionRow[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSeconds(s: number | null) {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function scorePercent(raw: number | null, total: number | null) {
  if (!raw || !total) return null
  return Math.round((raw / total) * 100)
}

// ─── Question Detail (lazy-loaded) ───────────────────────────────────────────

function QuestionDetailView({
  detail,
  aq,
}: {
  detail: QuestionDetail
  aq: QuestionRow
}) {
  const options = [...(detail.question_options ?? [])].sort((a, b) => a.order - b.order)
  const answers = detail.question_accepted_answers ?? []

  const diffLabel: Record<string, string> = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' }
  const diffVariant: Record<string, 'success' | 'warning' | 'error'> = { easy: 'success', medium: 'warning', hard: 'error' }
  const diff = detail.difficulty ?? ''

  return (
    <div className="space-y-5">
      {/* Meta row */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-surface-soft text-mute-light font-medium">
          {detail.type === 'multiple_choice' ? 'Trắc nghiệm' : 'Trả lời ngắn'}
        </span>
        {diff && <Badge variant={diffVariant[diff] ?? 'muted'}>{diffLabel[diff] ?? diff}</Badge>}
        {aq.module && (
          <span className="px-2.5 py-1 rounded-full bg-surface-soft text-mute-light font-medium">{aq.module}</span>
        )}
        <span className="px-2.5 py-1 rounded-full bg-surface-soft text-mute-light font-medium">{aq.score_weight} điểm</span>
      </div>

      {/* Question content */}
      <div>
        <p className="text-xs font-semibold text-mute-light uppercase tracking-wide mb-1.5">Nội dung</p>
        <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{detail.content}</p>
      </div>

      {/* Options (MCQ) */}
      {options.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-mute-light uppercase tracking-wide mb-2">Đáp án</p>
          <div className="space-y-2">
            {options.map((opt) => (
              <div
                key={opt.id}
                className={[
                  'flex items-start gap-3 rounded-lg px-4 py-2.5 text-sm',
                  opt.is_correct
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-surface-soft text-ink',
                ].join(' ')}
              >
                <span className="shrink-0 font-bold w-5">{opt.label}.</span>
                <span className="flex-1">{opt.content}</span>
                {opt.is_correct && (
                  <svg className="shrink-0 w-4 h-4 text-green-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accepted answers (short answer) */}
      {answers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-mute-light uppercase tracking-wide mb-2">Đáp án chấp nhận</p>
          <div className="flex flex-wrap gap-2">
            {answers.map((a) => (
              <span key={a.id} className="px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-800 text-sm font-medium">
                {a.answer_text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Explanations */}
      {(detail.ai_explanation || detail.teacher_explanation) && (
        <div className="space-y-3 pt-2 border-t border-hairline-light">
          {detail.teacher_explanation && (
            <div>
              <p className="text-xs font-semibold text-mute-light uppercase tracking-wide mb-1">Giải thích của giáo viên</p>
              <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{detail.teacher_explanation}</p>
            </div>
          )}
          {detail.ai_explanation && (
            <div>
              <p className="text-xs font-semibold text-mute-light uppercase tracking-wide mb-1">Giải thích AI</p>
              <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{detail.ai_explanation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignmentDetailClient({ assignment, instances, submissions, questions }: Props) {
  const questionCount = questions.length
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(instances[0]?.id ?? '')
  const [publishLoading, setPublishLoading] = useState<string | null>(null)
  const [questionSearch, setQuestionSearch] = useState('')
  // selectedQuestion = the lightweight row; detailLoading/questionDetail = lazy fetch state
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionRow | null>(null)
  const [questionDetail, setQuestionDetail] = useState<QuestionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function openQuestion(aq: QuestionRow) {
    setSelectedQuestion(aq)
    setQuestionDetail(null)
    setDetailLoading(true)
    try {
      const res  = await fetch(`/api/questions/${aq.question.id}`)
      const json = await res.json()
      if (json.data) setQuestionDetail(json.data as QuestionDetail)
    } catch {
      // leave detailLoading=false, modal shows error state
    } finally {
      setDetailLoading(false)
    }
  }

  const filteredQuestions = useMemo(() => {
    const q = questionSearch.trim().toLowerCase()
    if (!q) return questions
    return questions.filter((aq) =>
      aq.question.content.toLowerCase().includes(q) ||
      aq.module.toLowerCase().includes(q)
    )
  }, [questions, questionSearch])

  const selectedInstance = instances.find((i) => i.id === selectedInstanceId)

  const instanceSubmissions = submissions.filter((s) => s.instance_id === selectedInstanceId)
  const submittedCount = instanceSubmissions.filter((s) => s.status === 'submitted').length

  const now = new Date().toISOString()

  // Stats for selected instance
  const scores = instanceSubmissions
    .filter((s) => s.status === 'submitted' && s.raw_score !== null && s.total_questions)
    .map((s) => Math.round(((s.raw_score ?? 0) / (s.total_questions ?? 1)) * 100))

  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  const maxScore = scores.length > 0 ? Math.max(...scores) : null
  const minScore = scores.length > 0 ? Math.min(...scores) : null

  async function togglePublish(instance: InstanceRow) {
    setPublishLoading(instance.id)
    try {
      const newPublishedAt = instance.published_at ? null : new Date().toISOString()
      const res = await fetch(`/api/assignment-instances/${instance.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published_at: newPublishedAt }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        alert(`Lỗi: ${json.error ?? 'Không thể cập nhật'}`)
        return
      }
      window.location.reload()
    } finally {
      setPublishLoading(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="relative overflow-hidden border border-white/70 bg-white p-5 shadow-sm animate-fade-up">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
          <p className="text-xs text-mute-light mb-1">Số câu hỏi</p>
          <p className="text-2xl font-display font-bold text-ink">{questionCount}</p>
        </Card>
        <Card className="relative overflow-hidden border border-white/70 bg-white p-5 shadow-sm animate-fade-up" style={{ animationDelay: '60ms' }}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
          <p className="text-xs text-mute-light mb-1">Lần giao</p>
          <p className="text-2xl font-display font-bold text-ink">{instances.length}</p>
        </Card>
        <Card className="relative overflow-hidden border border-white/70 bg-white p-5 shadow-sm animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
          <p className="text-xs text-mute-light mb-1">Tổng lượt nộp</p>
          <p className="text-2xl font-display font-bold text-ink">{submissions.filter((s) => s.status === 'submitted').length}</p>
        </Card>
      </div>

      {/* Questions table */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-4">
          <h2 className="font-display font-semibold text-ink shrink-0">Danh sách câu hỏi</h2>
          <div className="w-72">
            <Input
              placeholder="Tìm câu hỏi..."
              value={questionSearch}
              onChange={(e) => setQuestionSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-card border border-hairline-light">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline-light bg-surface-soft">
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase tracking-wide w-10">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase tracking-wide">Nội dung</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase tracking-wide w-32">Loại</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase tracking-wide w-28">Độ khó</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-mute-light uppercase tracking-wide w-24">Điểm</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="bg-canvas-light divide-y divide-hairline-light">
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-mute-light">
                    {questionSearch ? 'Không tìm thấy câu hỏi phù hợp' : 'Chưa có câu hỏi nào'}
                  </td>
                </tr>
              ) : (
                filteredQuestions.map((aq, idx) => {
                  const diff = aq.question.difficulty ?? ''
                  const diffLabel: Record<string, string> = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' }
                  const diffVariant: Record<string, 'success' | 'warning' | 'error'> = { easy: 'success', medium: 'warning', hard: 'error' }
                  const typeLabel = aq.question.type === 'multiple_choice' ? 'Trắc nghiệm' : 'Trả lời ngắn'

                  return (
                    <tr key={aq.id} className="hover:bg-surface-soft transition-colors">
                      <td className="px-4 py-3 text-mute-light text-xs">{idx + 1}</td>
                      <td className="px-4 py-3 text-ink max-w-xs">
                        <p className="line-clamp-2">{aq.question.content}</p>
                        {aq.module && <p className="text-xs text-mute-light mt-0.5">{aq.module}</p>}
                      </td>
                      <td className="px-4 py-3 text-mute-light text-xs">{typeLabel}</td>
                      <td className="px-4 py-3">
                        {diff ? (
                          <Badge variant={diffVariant[diff] ?? 'muted'}>{diffLabel[diff] ?? diff}</Badge>
                        ) : (
                          <span className="text-mute-light text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink text-xs">{aq.score_weight}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openQuestion(aq)}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          Xem
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Question detail modal — content fetched lazily on open */}
      {selectedQuestion && (
        <Modal
          open={!!selectedQuestion}
          onClose={() => { setSelectedQuestion(null); setQuestionDetail(null) }}
          title={`Câu ${questions.indexOf(selectedQuestion) + 1}`}
          size="xl"
        >
          {detailLoading ? (
            <div className="flex items-center justify-center py-12 text-mute-light text-sm">
              Đang tải...
            </div>
          ) : questionDetail ? (
            <QuestionDetailView detail={questionDetail} aq={selectedQuestion} />
          ) : (
            <div className="flex items-center justify-center py-12 text-mute-light text-sm">
              Không thể tải câu hỏi. Vui lòng thử lại.
            </div>
          )}
        </Modal>
      )}

      {/* Instance tabs (if multiple classes/weeks) */}
      {instances.length > 0 && (
        <div>
          <h2 className="font-display font-semibold text-ink mb-3">Danh sách lần giao</h2>
          <div className="space-y-2">
            {instances.map((inst) => {
              const isExpired = inst.deadline < now
              const isPublished = !!inst.published_at
              const instSubs = submissions.filter((s) => s.instance_id === inst.id && s.status === 'submitted')

              return (
                <button
                  key={inst.id}
                  onClick={() => setSelectedInstanceId(inst.id)}
                  className={[
                    'w-full flex items-center gap-4 px-5 py-4 rounded-card text-left transition-colors border-2',
                    selectedInstanceId === inst.id
                      ? 'border-primary bg-white shadow-lg shadow-blue-100'
                      : 'border-transparent bg-white/80 hover:bg-white',
                  ].join(' ')}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-ink">
                      {inst.classes?.title ?? '—'}
                      {inst.weeks ? ` · ${inst.weeks.title}` : ''}
                    </p>
                    <p className="text-xs text-mute-light mt-0.5">
                      Hạn: {new Date(inst.deadline).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-mute-light">{instSubs.length} nộp</span>
                    {isExpired ? (
                      <Badge variant="muted">Hết hạn</Badge>
                    ) : isPublished ? (
                      <Badge variant="success">Đang mở</Badge>
                    ) : (
                      <Badge variant="warning">Chưa xuất bản</Badge>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected instance detail */}
      {selectedInstance && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-ink">
              Kết quả: {selectedInstance.classes?.title ?? '—'}
            </h2>
            <Button
              size="sm"
              variant={selectedInstance.published_at ? 'danger' : 'secondary'}
              loading={publishLoading === selectedInstance.id}
              onClick={() => togglePublish(selectedInstance)}
            >
              {selectedInstance.published_at ? 'Thu hồi xuất bản' : 'Xuất bản'}
            </Button>
          </div>

          {/* Class stats */}
          {submittedCount > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <Card className="border border-white/70 bg-white p-4 text-center shadow-sm">
                <p className="text-xs text-mute-light mb-1">Điểm TB</p>
                <p className="text-xl font-bold text-ink">{avgScore !== null ? `${avgScore}%` : '—'}</p>
              </Card>
              <Card className="border border-white/70 bg-white p-4 text-center shadow-sm">
                <p className="text-xs text-mute-light mb-1">Cao nhất</p>
                <p className="text-xl font-bold text-primary">{maxScore !== null ? `${maxScore}%` : '—'}</p>
              </Card>
              <Card className="border border-white/70 bg-white p-4 text-center shadow-sm">
                <p className="text-xs text-mute-light mb-1">Thấp nhất</p>
                <p className="text-xl font-bold text-warning">{minScore !== null ? `${minScore}%` : '—'}</p>
              </Card>
            </div>
          )}

          {/* Submission progress bar */}
          <Card className="border border-white/70 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-ink">Tiến độ nộp bài</p>
              <p className="text-sm text-mute-light">{submittedCount} đã nộp</p>
            </div>
            <div className="h-2 bg-surface-soft rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400 transition-all"
                style={{ width: instanceSubmissions.length > 0 ? `${(submittedCount / instanceSubmissions.length) * 100}%` : '0%' }}
              />
            </div>
          </Card>

          {/* Per-student table */}
          {instanceSubmissions.length === 0 ? (
            <EmptyState
              title="Chưa có học sinh nào làm bài"
              description="Kết quả sẽ hiển thị ở đây sau khi học sinh nộp bài"
              icon={
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              }
            />
          ) : (
            /* Scrollable on small screens */
            <div className="overflow-x-auto rounded-card">
              <div className="min-w-[480px] space-y-1">
                {/* Header */}
                <div className="grid grid-cols-[1fr_80px_80px_80px_100px] gap-4 px-5 py-2 text-xs font-medium text-mute-light uppercase tracking-wide">
                  <span>Học sinh</span>
                  <span className="text-center">Điểm</span>
                  <span className="text-center">Đúng</span>
                  <span className="text-center">Thời gian</span>
                  <span className="text-center">Trạng thái</span>
                </div>

                {instanceSubmissions.map((sub) => {
                  const pct = scorePercent(sub.raw_score, sub.total_questions)
                  const isSubmitted = sub.status === 'submitted'

                  return (
                    <div
                      key={sub.id}
                      className="grid grid-cols-[1fr_80px_80px_80px_100px] gap-4 items-center rounded-2xl border border-white/70 bg-white px-5 py-3.5 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">
                          {sub.profiles?.full_name ?? 'Không rõ'}
                        </p>
                        <p className="text-xs text-mute-light">{sub.profiles?.phone ?? '—'}</p>
                      </div>
                      <div className="text-center">
                        {pct !== null ? (
                          <span className={['font-bold', pct >= 70 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'].join(' ')}>
                            {pct}%
                          </span>
                        ) : '—'}
                      </div>
                      <div className="text-center text-mute-light">
                        {isSubmitted ? `${sub.raw_score ?? 0}/${sub.total_questions ?? questionCount}` : '—'}
                      </div>
                      <div className="text-center text-mute-light text-xs">
                        {formatSeconds(sub.time_spent_seconds)}
                      </div>
                      <div className="flex justify-center">
                        {isSubmitted ? (
                          <Badge variant="success">Đã nộp</Badge>
                        ) : sub.status === 'in_progress' ? (
                          <Badge variant="warning">Đang làm</Badge>
                        ) : (
                          <Badge variant="muted">Chưa làm</Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {instances.length === 0 && (
        <EmptyState
          title="Chưa giao bài tập này cho lớp nào"
          description="Tạo lần giao mới để học sinh có thể làm bài"
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />
      )}
    </div>
  )
}
