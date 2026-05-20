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
  tags: TagRow[]
}

interface TagRow {
  id: string
  subject: string
  name: string
}

interface Props {
  questions: QuestionRow[]
  tags: TagRow[]
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

function stripHtml(value: string) {
  return value
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function QuestionBankClient({ questions, tags }: Props) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  // ── Filter & search ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      const previewText = stripHtml(q.content)
      const matchSearch = !search || previewText.toLowerCase().includes(search.toLowerCase())
      const matchType = typeFilter === 'all' || q.type === typeFilter
      const matchDiff = difficultyFilter === 'all' || q.difficulty === difficultyFilter
      const matchTag = tagFilter === 'all' || q.tags.some((tag) => tag.id === tagFilter)
      return matchSearch && matchType && matchDiff && matchTag
    })
  }, [questions, search, typeFilter, difficultyFilter, tagFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageClamp = Math.min(page, totalPages)
  const paged = filtered.slice((pageClamp - 1) * PAGE_SIZE, pageClamp * PAGE_SIZE)

  function setFilter(key: 'type' | 'difficulty' | 'tag', val: string) {
    setPage(1)
    if (key === 'type') setTypeFilter(val)
    else if (key === 'difficulty') setDifficultyFilter(val)
    else setTagFilter(val)
  }

  const multipleChoiceCount = questions.filter((q) => q.type === 'multiple_choice').length
  const shortAnswerCount = questions.filter((q) => q.type === 'short_answer').length
  const difficultyCounts = {
    easy: questions.filter((q) => q.difficulty === 'easy').length,
    medium: questions.filter((q) => q.difficulty === 'medium').length,
    hard: questions.filter((q) => q.difficulty === 'hard').length,
  }
  const selectedTag = tags.find((tag) => tag.id === tagFilter)

  const CARD_THEMES = {
    easy: {
      rail: 'from-emerald-400 to-teal-500',
      glow: 'hover:shadow-emerald-100',
      icon: 'bg-emerald-50 text-emerald-600',
    },
    medium: {
      rail: 'from-amber-400 to-orange-500',
      glow: 'hover:shadow-amber-100',
      icon: 'bg-amber-50 text-amber-600',
    },
    hard: {
      rail: 'from-rose-500 to-pink-500',
      glow: 'hover:shadow-rose-100',
      icon: 'bg-rose-50 text-rose-600',
    },
    default: {
      rail: 'from-blue-500 to-indigo-600',
      glow: 'hover:shadow-blue-100',
      icon: 'bg-blue-50 text-blue-600',
    },
  } as const

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Tổng câu hỏi', value: questions.length, detail: 'Trong ngân hàng', tone: 'from-blue-500 to-indigo-600' },
          { label: 'Trắc nghiệm', value: multipleChoiceCount, detail: 'Multiple choice', tone: 'from-violet-500 to-purple-600' },
          { label: 'Điền đáp án', value: shortAnswerCount, detail: 'Short answer', tone: 'from-cyan-500 to-sky-600' },
          { label: 'Độ khó', value: `${difficultyCounts.easy}/${difficultyCounts.medium}/${difficultyCounts.hard}`, detail: 'Dễ · TB · Khó', tone: 'from-emerald-400 via-amber-400 to-rose-500' },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="relative overflow-hidden rounded-2xl border border-white/70 bg-white p-4 shadow-sm animate-fade-up"
            style={{ animationDelay: `${i * 55}ms` }}
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${stat.tone}`} />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mute-light">{stat.label}</p>
            <p className="mt-2 text-2xl font-display font-bold text-ink">{stat.value}</p>
            <p className="mt-1 text-xs text-mute-light">{stat.detail}</p>
          </div>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm animate-fade-in">
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

        {/* Tag filter */}
        <select
          value={tagFilter}
          onChange={(e) => setFilter('tag', e.target.value)}
          className="h-9 max-w-[260px] rounded-lg border border-ash-light bg-canvas-light px-3 text-xs text-ink outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">Mọi chủ đề</option>
          <optgroup label="Reading & Writing">
            {tags.filter((tag) => tag.subject === 'reading_writing').map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </optgroup>
          <optgroup label="Math">
            {tags.filter((tag) => tag.subject === 'math').map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </optgroup>
        </select>

        {/* Count */}
        <span className="ml-auto text-xs text-mute-light shrink-0">
          {filtered.length} câu hỏi
        </span>
      </div>
      {selectedTag && (
        <div className="mt-3 flex items-center gap-2 text-xs text-mute-light">
          <span>Đang lọc chủ đề:</span>
          <Badge variant="info">{selectedTag.name}</Badge>
          <button
            type="button"
            onClick={() => setFilter('tag', 'all')}
            className="font-medium text-primary hover:text-blue-700"
          >
            Xóa lọc
          </button>
        </div>
      )}
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
          <div className="grid gap-3">
            {paged.map((q, index) => {
              const theme = CARD_THEMES[(q.difficulty as keyof typeof CARD_THEMES) ?? 'default'] ?? CARD_THEMES.default
              const previewText = stripHtml(q.content)
              return (
              <Link
                key={q.id}
                href={`/teacher/questions/${q.id}`}
                className={`group relative overflow-hidden rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${theme.glow} animate-fade-up`}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${theme.rail}`} />
                <div className="flex items-center gap-4 pl-2">
                <div className={`hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${theme.icon}`}>
                  <span className="text-sm font-bold">{q.type === 'multiple_choice' ? 'MC' : 'SA'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate max-w-2xl group-hover:text-primary transition-colors">
                    {previewText.slice(0, 120)}
                    {previewText.length > 120 ? '…' : ''}
                  </p>
                  <p className="text-xs text-mute-light mt-1">
                    {new Date(q.created_at).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {q.tags.slice(0, 1).map((tag) => (
                    <Badge key={tag.id} variant="default">{tag.name}</Badge>
                  ))}
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
                </div>
              </Link>
            )})}
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
