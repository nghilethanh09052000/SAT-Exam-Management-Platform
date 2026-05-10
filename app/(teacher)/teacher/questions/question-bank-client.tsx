'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'

interface QuestionRow {
  id: string
  type: string
  content: string
  difficulty: string | null
  created_at: string
}

interface Props {
  questions: QuestionRow[]
}

const PAGE_SIZE = 20

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
}

const DIFFICULTY_VARIANTS: Record<string, 'success' | 'warning' | 'error'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'error',
}

export function QuestionBankClient({ questions }: Props) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  // ── Filter & search ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      const matchSearch = !search || q.content.toLowerCase().includes(search.toLowerCase())
      const matchType = typeFilter === 'all' || q.type === typeFilter
      const matchDiff = difficultyFilter === 'all' || q.difficulty === difficultyFilter
      return matchSearch && matchType && matchDiff
    })
  }, [questions, search, typeFilter, difficultyFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageClamp = Math.min(page, totalPages)
  const paged = filtered.slice((pageClamp - 1) * PAGE_SIZE, pageClamp * PAGE_SIZE)

  function setFilter(key: 'type' | 'difficulty', val: string) {
    setPage(1)
    if (key === 'type') setTypeFilter(val)
    else setDifficultyFilter(val)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mute-light"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Tìm kiếm câu hỏi..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-4 h-9 rounded-lg border border-ash-light text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-canvas-light text-ink placeholder:text-mute-light"
          />
        </div>

        {/* Type filter pills */}
        <div className="flex items-center gap-1.5">
          {[
            { val: 'all', label: 'Tất cả' },
            { val: 'multiple_choice', label: 'Trắc nghiệm' },
            { val: 'short_answer', label: 'Điền đáp án' },
          ].map((opt) => (
            <button
              key={opt.val}
              onClick={() => setFilter('type', opt.val)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                typeFilter === opt.val
                  ? 'bg-primary text-white'
                  : 'bg-surface-soft text-mute-light hover:text-ink',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Difficulty filter pills */}
        <div className="flex items-center gap-1.5">
          {[
            { val: 'all', label: 'Mọi độ khó' },
            { val: 'easy', label: 'Dễ' },
            { val: 'medium', label: 'Trung bình' },
            { val: 'hard', label: 'Khó' },
          ].map((opt) => (
            <button
              key={opt.val}
              onClick={() => setFilter('difficulty', opt.val)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                difficultyFilter === opt.val
                  ? 'bg-ink text-canvas-light'
                  : 'bg-surface-soft text-mute-light hover:text-ink',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Count */}
        <span className="ml-auto text-xs text-mute-light shrink-0">
          {filtered.length} câu hỏi
        </span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Không tìm thấy câu hỏi nào"
          description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm"
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {paged.map((q) => (
              <Link
                key={q.id}
                href={`/teacher/questions/${q.id}`}
                className="flex items-center gap-4 px-5 py-4 bg-surface-card rounded-card hover:bg-surface-soft transition-colors block"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate max-w-2xl">
                    {q.content.slice(0, 120)}
                    {q.content.length > 120 ? '…' : ''}
                  </p>
                  <p className="text-xs text-mute-light mt-1">
                    {new Date(q.created_at).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {q.type === 'multiple_choice' ? (
                    <Badge variant="info">Trắc nghiệm</Badge>
                  ) : (
                    <Badge variant="default">Điền đáp án</Badge>
                  )}
                  {q.difficulty && (
                    <Badge variant={DIFFICULTY_VARIANTS[q.difficulty] ?? 'default'}>
                      {DIFFICULTY_LABELS[q.difficulty] ?? q.difficulty}
                    </Badge>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={pageClamp <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Trước
              </Button>
              <span className="text-sm text-mute-light px-3">
                Trang {pageClamp} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={pageClamp >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
