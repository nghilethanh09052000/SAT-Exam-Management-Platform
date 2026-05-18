'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

interface Option {
  id: string
  label: string
  content: string
  is_correct: boolean
  order: number
}

interface LogEntry {
  id: string
  questionId: string
  submissionId: string
  studentNote: string | null
  createdAt: string
  assignmentTitle: string
  assignmentId: string | null
  attemptNumber: number | null
  skillTags: string[]
  selectedOptionId: string | null
  answerText: string | null
  question: {
    content: string
    type: string
    options: Option[]
  } | null
}

interface ErrorLogClientProps {
  logs: LogEntry[]
}

export function ErrorLogClient({ logs }: ErrorLogClientProps) {
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(logs.map((l) => [l.id, l.studentNote ?? '']))
  )
  const [saving, setSaving] = useState<string | null>(null)
  const [assignmentFilter, setAssignmentFilter] = useState('all')
  const [skillFilter, setSkillFilter] = useState('all')
  const [redoLog, setRedoLog] = useState<LogEntry | null>(null)
  const [redoChoice, setRedoChoice] = useState<string | null>(null)

  const assignments = Array.from(
    new Map(
      logs
        .filter((log) => log.assignmentId)
        .map((log) => [log.assignmentId as string, log.assignmentTitle])
    ).entries()
  )
  const skills = Array.from(new Set(logs.flatMap((log) => log.skillTags))).sort()
  const filteredLogs = logs.filter((log) => {
    const matchesAssignment = assignmentFilter === 'all' || log.assignmentId === assignmentFilter
    const matchesSkill = skillFilter === 'all' || log.skillTags.includes(skillFilter)
    return matchesAssignment && matchesSkill
  })

  async function saveNote(logId: string) {
    setSaving(logId)
    try {
      await fetch(`/api/error-log/${logId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_note: notes[logId] }),
      })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-ink">Sổ Tay Lỗi Sai</h1>
        <p className="text-sm text-mute-light mt-1">
          {filteredLogs.length}/{logs.length} câu hỏi bạn đã trả lời sai
        </p>
      </div>

      {logs.length > 0 && (
        <div className="grid gap-3 rounded-card bg-surface-card p-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="block text-xs font-medium text-mute-light">Lọc theo bài tập</span>
            <select
              value={assignmentFilter}
              onChange={(event) => setAssignmentFilter(event.target.value)}
              className="h-10 w-full rounded-card border border-ash-light bg-white px-3 text-sm text-ink"
            >
              <option value="all">Tất cả bài tập</option>
              {assignments.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-xs font-medium text-mute-light">Lọc theo kỹ năng</span>
            <select
              value={skillFilter}
              onChange={(event) => setSkillFilter(event.target.value)}
              className="h-10 w-full rounded-card border border-ash-light bg-white px-3 text-sm text-ink"
            >
              <option value="all">Tất cả kỹ năng</option>
              {skills.map((skill) => (
                <option key={skill} value={skill}>
                  {skill}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {logs.length === 0 ? (
        <EmptyState
          title="Không có lỗi sai nào"
          description="Tuyệt vời! Bạn chưa có câu trả lời sai nào được ghi lại."
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="bg-surface-card rounded-card p-5 space-y-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="error">Sai</Badge>
                  <span className="text-sm text-mute-light">
                    {log.assignmentTitle}
                  </span>
                  {log.attemptNumber && (
                    <span className="text-xs text-mute-light">· Lần {log.attemptNumber}</span>
                  )}
                </div>
                <span className="text-xs text-mute-light">
                  {new Date(log.createdAt).toLocaleDateString('vi-VN')}
                </span>
              </div>

              {/* Question */}
              {log.question && (
                <div className="space-y-3">
                  <p className="text-sm text-ink leading-relaxed">
                    {log.question.content.slice(0, 200)}
                    {log.question.content.length > 200 ? '...' : ''}
                  </p>

                  {log.question.type === 'multiple_choice' && (
                    <div className="space-y-1.5">
                      {log.question.options.map((opt) => (
                        <div
                          key={opt.id}
                          className={[
                            'flex items-center gap-2 px-3 py-2 rounded-[6px] text-xs',
                            opt.is_correct
                              ? 'bg-green-50 text-green-800 font-medium'
                              : opt.id === log.selectedOptionId
                              ? 'bg-red-50 text-red-700 font-medium'
                              : 'bg-canvas-light text-mute-light',
                          ].join(' ')}
                        >
                          <span className="font-bold">{opt.label}.</span>
                          {opt.content}
                          {opt.is_correct && (
                            <span className="ml-auto text-green-700">✓ Đúng</span>
                          )}
                          {opt.id === log.selectedOptionId && !opt.is_correct && (
                            <span className="ml-auto text-red-700">Đáp án của bạn</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {log.skillTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {log.skillTags.map((skill) => (
                    <span key={skill} className="rounded-full bg-surface-soft px-2.5 py-1 text-xs text-mute-light">
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              {/* Note */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-mute-light">Ghi chú cá nhân</p>
                <div className="flex gap-2">
                  <textarea
                    value={notes[log.id] ?? ''}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [log.id]: e.target.value }))
                    }
                    placeholder="Ghi chú của bạn về câu hỏi này..."
                    rows={2}
                    className="flex-1 px-3 py-2 text-sm border border-ash-light rounded-[6px] resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={() => saveNote(log.id)}
                    disabled={saving === log.id}
                    className="px-3 py-2 text-xs font-medium bg-primary text-white rounded-[6px] hover:bg-primary-pressed transition-colors disabled:opacity-50"
                  >
                    {saving === log.id ? 'Đang lưu...' : 'Lưu'}
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  setRedoLog(log)
                  setRedoChoice(null)
                }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Làm lại câu này
              </button>
            </div>
          ))}
        </div>
      )}

      {redoLog?.question?.type === 'multiple_choice' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-card bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-display font-semibold text-ink">Làm lại câu hỏi</h2>
                <p className="mt-1 text-sm text-mute-light">{redoLog.assignmentTitle}</p>
              </div>
              <button
                onClick={() => setRedoLog(null)}
                className="text-mute-light hover:text-ink"
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <p className="mb-4 text-sm leading-relaxed text-ink">{redoLog.question.content}</p>
            <div className="space-y-2">
              {redoLog.question.options.map((option) => {
                const selected = redoChoice === option.id
                const reveal = redoChoice !== null
                return (
                  <button
                    key={option.id}
                    onClick={() => setRedoChoice(option.id)}
                    className={[
                      'flex w-full items-start gap-3 rounded-card border px-4 py-3 text-left text-sm transition-colors',
                      reveal && option.is_correct
                        ? 'border-green-400 bg-green-50'
                        : reveal && selected && !option.is_correct
                        ? 'border-red-400 bg-red-50'
                        : selected
                        ? 'border-primary bg-blue-50'
                        : 'border-hairline-light bg-canvas-light',
                    ].join(' ')}
                  >
                    <span className="font-semibold">{option.label}.</span>
                    <span>{option.content}</span>
                  </button>
                )
              })}
            </div>

            {redoChoice && (
              <p className="mt-4 text-sm font-medium text-ink">
                {redoLog.question.options.find((option) => option.id === redoChoice)?.is_correct
                  ? 'Chính xác.'
                  : 'Chưa đúng. Đáp án đúng đã được tô xanh để bạn xem lại.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
