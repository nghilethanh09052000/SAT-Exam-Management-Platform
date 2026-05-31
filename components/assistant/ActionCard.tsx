'use client'

import { useState } from 'react'
import { CheckCircle, Pencil, X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'

export type ProposalStep = {
  step:        number
  tool:        string
  description: string
  args:        Record<string, unknown>
}

export type ActionProposal = {
  title: string
  steps: ProposalStep[]
}

// Tool → friendly Vietnamese label
const TOOL_LABELS: Record<string, string> = {
  create_course:    '📚 Tạo khóa học',
  create_class:     '🏫 Tạo lớp học',
  enroll_students:  '👥 Thêm học sinh',
  setup_mock_test:  '📝 Tạo bài kiểm tra',
  create_question:  '❓ Tạo câu hỏi',
}

interface Props {
  proposal:  ActionProposal
  executed:  boolean
  onApprove: (proposal: ActionProposal) => void
  onCancel:  () => void
}

export function ActionCard({ proposal, executed, onApprove, onCancel }: Props) {
  const [expanded, setExpanded]         = useState(false)
  const [editMode, setEditMode]         = useState(false)
  const [editedSteps, setEditedSteps]   = useState<ProposalStep[]>(proposal.steps)

  if (executed) {
    return (
      <div className="my-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
          <span className="font-medium">{proposal.title}</span>
          <span className="text-green-600">— Đã thực hiện</span>
        </div>
      </div>
    )
  }

  const handleArgChange = (stepIdx: number, key: string, value: string) => {
    setEditedSteps(prev => prev.map((s, i) =>
      i === stepIdx ? { ...s, args: { ...s.args, [key]: value } } : s
    ))
  }

  return (
    <div className="my-2 rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shrink-0">
          <Sparkles className="h-3 w-3" />
        </div>
        <span className="flex-1 text-sm font-semibold text-ink">{proposal.title}</span>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-ink-muted hover:text-ink transition-colors"
        >
          {expanded
            ? <ChevronUp className="h-4 w-4" />
            : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Steps list */}
      <div className="px-4 pb-2 space-y-1">
        {(editMode ? editedSteps : proposal.steps).map((step, idx) => (
          <div key={step.step} className="rounded-lg border border-ash-light bg-white px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {step.step}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-ink">
                  {TOOL_LABELS[step.tool] ?? step.tool}
                </p>
                <p className="text-xs text-ink-muted mt-0.5">{step.description}</p>

                {/* Editable args */}
                {editMode && expanded && (
                  <div className="mt-2 space-y-1.5">
                    {Object.entries(step.args).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 text-xs text-ink-muted font-mono">{key}</span>
                        <input
                          className="flex-1 rounded border border-ash-light px-2 py-0.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary/40"
                          value={String(val ?? '')}
                          onChange={e => handleArgChange(idx, key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Read-only arg summary when not editing */}
                {!editMode && expanded && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Object.entries(step.args)
                      .filter(([k]) => !['teacher_id', 'created_by'].includes(k))
                      .map(([k, v]) => (
                        <span key={k} className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                          {k}: {String(v ?? '').slice(0, 40)}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-primary/10 bg-white px-4 py-2.5">
        {editMode ? (
          <>
            <button
              onClick={() => {
                onApprove({ ...proposal, steps: editedSteps })
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Lưu &amp; Xác nhận
            </button>
            <button
              onClick={() => { setEditMode(false); setEditedSteps(proposal.steps) }}
              className="flex items-center gap-1 rounded-lg border border-ash-light bg-white px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-soft transition-colors"
            >
              Huỷ chỉnh sửa
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onApprove(proposal)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Xác nhận &amp; Thực hiện
            </button>
            <button
              onClick={() => { setEditMode(true); setExpanded(true) }}
              className="flex items-center gap-1 rounded-lg border border-ash-light bg-white px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-soft transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Chỉnh sửa
            </button>
            <button
              onClick={onCancel}
              className="flex items-center gap-1 rounded-lg border border-ash-light bg-white px-2 py-1.5 text-xs text-ink-muted hover:bg-surface-soft transition-colors"
              title="Huỷ"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
