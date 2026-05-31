'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Wrench, CheckCircle, XCircle, Loader2 } from 'lucide-react'

export interface ToolCallEvent {
  call_id:  string
  name:     string
  args?:    unknown
  summary?: string
  ok?:      boolean
  done:     boolean
}

interface Props {
  event: ToolCallEvent
}

// Human-readable tool names in Vietnamese
const TOOL_LABELS: Record<string, string> = {
  get_class_summary:    'Tóm tắt lớp học',
  get_weak_students:    'Học sinh yếu',
  get_topic_breakdown:  'Phân tích chủ đề',
  list_classes:         'Danh sách lớp',
  get_class_roster:     'Danh sách học sinh',
  list_students:        'Tìm học sinh',
  get_student:          'Chi tiết học sinh',
  get_student_progress: 'Tiến độ học sinh',
  get_class_leaderboard:'Bảng xếp hạng',
  list_assignments:     'Danh sách bài tập',
  get_submission_stats: 'Thống kê bài nộp',
  search_questions:     'Tìm câu hỏi',
  list_questions:       'Ngân hàng câu hỏi',
  get_question:         'Chi tiết câu hỏi',
  list_courses:         'Danh sách khóa học',
  create_assignment:    'Tạo bài tập',
  create_question:      'Tạo câu hỏi',
}

export function ToolCallChip({ event }: Props) {
  const [open, setOpen] = useState(false)

  const label = TOOL_LABELS[event.name] ?? event.name

  return (
    <div className="my-1 rounded-lg border border-ash-light bg-surface-soft text-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink-muted hover:bg-surface-card transition-colors"
      >
        {/* Status icon */}
        {!event.done ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : event.ok ? (
          <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
        ) : (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-warning" />
        )}

        <Wrench className="h-3 w-3 shrink-0 opacity-50" />
        <span className="font-mono text-xs opacity-70">{event.name}</span>
        <span className="text-ink-muted">—</span>
        <span className="flex-1 truncate text-xs">{event.done ? (event.summary ?? label) : label}</span>

        {event.done && (
          open
            ? <ChevronUp className="h-3.5 w-3.5 shrink-0 opacity-50" />
            : <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        )}
      </button>

      {open && event.done && (
        <div className="border-t border-ash-light px-3 py-2">
          {event.args != null && (
            <div className="mb-2">
              <p className="text-xs font-medium text-ink-muted mb-1">Tham số:</p>
              <pre className="text-xs bg-surface-card rounded p-2 overflow-x-auto text-ink-muted whitespace-pre-wrap">
                {JSON.stringify(event.args, null, 2)}
              </pre>
            </div>
          )}
          {event.summary && (
            <p className="text-xs text-ink">{event.summary}</p>
          )}
        </div>
      )}
    </div>
  )
}
