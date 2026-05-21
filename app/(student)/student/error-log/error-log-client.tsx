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
  weekId: string | null
  weekTitle: string
  weekOrder: number
  sourceType: 'weekly' | 'practice' | 'mock'
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
  const [sourceFilter, setSourceFilter] = useState<'all' | LogEntry['sourceType']>('all')
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
  const sourceLabels: Record<LogEntry['sourceType'], string> = {
    weekly: 'Bài tập tuần',
    practice: 'Luyện đề',
    mock: 'Đề thi thử',
  }
  const sourceOrder: LogEntry['sourceType'][] = ['weekly', 'practice', 'mock']
  const filteredLogs = logs.filter((log) => {
    const matchesAssignment = assignmentFilter === 'all' || log.assignmentId === assignmentFilter
    const matchesSkill = skillFilter === 'all' || log.skillTags.includes(skillFilter)
    const matchesSource = sourceFilter === 'all' || log.sourceType === sourceFilter
    return matchesAssignment && matchesSkill && matchesSource
  })
  const weekGroups = Array.from(
    filteredLogs.reduce((map, log) => {
      const key = log.weekId ?? 'unassigned'
      const existing = map.get(key)
      if (existing) {
        existing.logs.push(log)
      } else {
        map.set(key, {
          id: key,
          title: log.weekTitle,
          order: log.weekOrder,
          logs: [log],
        })
      }
      return map
    }, new Map<string, { id: string; title: string; order: number; logs: LogEntry[] }>())
  ).map(([, value]) => value).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))

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
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[34px] border border-white/80 bg-white/90 p-7 shadow-sm shadow-blue-100/70 backdrop-blur md:p-8">
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-[#ff6b8a]/15 blur-3xl" />
        <div className="absolute bottom-0 right-36 h-48 w-48 rounded-full bg-[#5b7cfa]/20 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6d7cff]">Error Log</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-[#232635] md:text-5xl">Sổ Tay Lỗi Sai</h1>
          <p className="mt-3 text-lg font-semibold text-[#6f7688]">
          {filteredLogs.length}/{logs.length} câu hỏi bạn đã trả lời sai
          </p>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="grid gap-4 rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-sm shadow-blue-100/60 backdrop-blur lg:grid-cols-3">
          <label className="space-y-2 text-sm">
            <span className="block text-sm font-black text-[#6f7688]">Lọc theo bài tập</span>
            <select
              value={assignmentFilter}
              onChange={(event) => setAssignmentFilter(event.target.value)}
              className="h-12 w-full rounded-[14px] border border-[#d7dbe7] bg-white px-4 text-base font-semibold text-[#252837] outline-none transition-shadow focus:ring-4 focus:ring-[#5b7cfa]/15"
            >
              <option value="all">Tất cả bài tập</option>
              {assignments.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="block text-sm font-black text-[#6f7688]">Lọc theo loại bài</span>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as typeof sourceFilter)}
              className="h-12 w-full rounded-[14px] border border-[#d7dbe7] bg-white px-4 text-base font-semibold text-[#252837] outline-none transition-shadow focus:ring-4 focus:ring-[#5b7cfa]/15"
            >
              <option value="all">Tất cả loại bài</option>
              {sourceOrder.map((source) => (
                <option key={source} value={source}>
                  {sourceLabels[source]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="block text-sm font-black text-[#6f7688]">Lọc theo kỹ năng</span>
            <select
              value={skillFilter}
              onChange={(event) => setSkillFilter(event.target.value)}
              className="h-12 w-full rounded-[14px] border border-[#d7dbe7] bg-white px-4 text-base font-semibold text-[#252837] outline-none transition-shadow focus:ring-4 focus:ring-[#5b7cfa]/15"
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
        <div className="space-y-8">
          {weekGroups.map((week) => (
            <section key={week.id} className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-black text-[#252837]">{week.title}</h2>
                <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-black text-[#7b8295] shadow-sm">
                  {week.logs.length} lỗi sai
                </span>
              </div>

              {sourceOrder
                .map((source) => ({
                  source,
                  logs: week.logs.filter((log) => log.sourceType === source),
                }))
                .filter((group) => group.logs.length > 0)
                .map((group) => (
                  <div key={`${week.id}-${group.source}`} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-[#7f88a3]">
                        {sourceLabels[group.source]}
                      </h3>
                      <span className="h-px flex-1 bg-[#e0e5f2]" />
                      <span className="text-xs font-black text-[#9aa2b6]">{group.logs.length} câu</span>
                    </div>

                    <div className="space-y-5">
          {group.logs.map((log) => (
            <div
              key={log.id}
              className="group overflow-hidden rounded-[28px] border border-white/80 bg-white/[0.92] p-6 shadow-sm shadow-blue-100/60 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-100"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="error">Sai</Badge>
                  <span className="text-base font-bold text-[#6f7688]">
                    {log.assignmentTitle}
                  </span>
                  {log.attemptNumber && (
                    <span className="text-sm font-semibold text-[#9aa2b6]">· Lần {log.attemptNumber}</span>
                  )}
                </div>
                <span className="text-xs font-bold text-[#9aa2b6]">
                  {new Date(log.createdAt).toLocaleDateString('vi-VN')}
                </span>
              </div>

              {/* Question */}
              {log.question && (
                <div className="space-y-3">
                  <p className="text-xl font-semibold leading-relaxed text-[#111827]">
                    {log.question.content.slice(0, 200)}
                    {log.question.content.length > 200 ? '...' : ''}
                  </p>

                  {log.question.type === 'multiple_choice' && (
                    <div className="space-y-1.5">
                      {log.question.options.map((opt) => (
                        <div
                          key={opt.id}
                          className={[
                            'flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-sm',
                            opt.is_correct
                              ? 'bg-green-50 text-green-800 font-bold'
                              : opt.id === log.selectedOptionId
                              ? 'bg-red-50 text-red-700 font-bold'
                              : 'bg-[#f7f9ff] text-[#7b8295]',
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
                    <span key={skill} className="rounded-full bg-[#eef3ff] px-3 py-1 text-xs font-bold text-[#5b72f6]">
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              {/* Note */}
              <div className="space-y-2">
                <p className="text-sm font-black text-[#6f7688]">Ghi chú cá nhân</p>
                <div className="flex gap-2">
                  <textarea
                    value={notes[log.id] ?? ''}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [log.id]: e.target.value }))
                    }
                    placeholder="Ghi chú của bạn về câu hỏi này..."
                    rows={2}
                    className="flex-1 resize-none rounded-[14px] border border-[#d7dbe7] px-4 py-3 text-sm outline-none transition-shadow focus:ring-4 focus:ring-[#5b7cfa]/15"
                  />
                  <button
                    onClick={() => saveNote(log.id)}
                    disabled={saving === log.id}
                    className="rounded-[14px] bg-gradient-to-r from-[#4f7cff] to-[#7c4dff] px-5 py-2 text-xs font-black text-white shadow-lg shadow-indigo-500/20 transition-transform hover:scale-105 disabled:opacity-50"
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
                className="text-base font-black text-[#0b73d9] hover:underline"
              >
                Làm lại câu này
              </button>
            </div>
          ))}
                    </div>
                  </div>
                ))}
            </section>
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
