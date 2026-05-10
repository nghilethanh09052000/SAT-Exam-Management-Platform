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
          {logs.length} câu hỏi bạn đã trả lời sai
        </p>
      </div>

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
          {logs.map((log) => (
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
                              : 'bg-canvas-light text-mute-light',
                          ].join(' ')}
                        >
                          <span className="font-bold">{opt.label}.</span>
                          {opt.content}
                          {opt.is_correct && (
                            <span className="ml-auto text-green-700">✓ Đúng</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
