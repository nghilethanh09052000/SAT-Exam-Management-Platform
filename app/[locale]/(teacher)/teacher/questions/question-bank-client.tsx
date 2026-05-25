'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from '@/i18n/navigation'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { useTranslations, useLocale } from 'next-intl'

interface QuestionRow {
  id: string
  type: string
  content_preview: string   // plain-text excerpt from DB generated column
  difficulty: string | null
  created_at: string
  tags: TagRow[]
}

interface TagRow {
  id: string
  subject: string
  name: string
}

interface Stats {
  total: number
  multipleChoice: number
  shortAnswer: number
  easy: number
  medium: number
  hard: number
}

interface Props {
  initialQuestions: QuestionRow[]
  initialHasNext: boolean
  stats: Stats
  tags: TagRow[]
}

type Cursor = { created_at: string; id: string } | null

const DIFFICULTY_VARIANTS: Record<string, 'success' | 'warning' | 'error'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'error',
}


export function QuestionBankClient({ initialQuestions, initialHasNext, stats, tags }: Props) {
  const t = useTranslations('teacher.questions')
  const locale = useLocale()

  const DIFFICULTY_LABELS: Record<string, string> = {
    easy: t('filterEasy'),
    medium: t('filterMedium'),
    hard: t('filterHard'),
  }

  const [search, setSearch]           = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilter]           = useState<string>('all')
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all')
  const [tagFilter, setTagFilter]             = useState<string>('all')

  const [questions, setQuestions] = useState(initialQuestions)
  const [hasNext, setHasNext]     = useState(initialHasNext)
  const [fetching, setFetching]   = useState(false)

  // Cursor stack for keyset navigation
  // cursor = WHERE clause anchor for the current page (null = first page)
  // prevCursors = stack of anchors for previous pages
  const [cursor, setCursor]           = useState<Cursor>(null)
  const [prevCursors, setPrevCursors] = useState<Cursor[]>([])

  const isInitialMount = useRef(true)

  // ── Debounce search ─────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(timer)
  }, [search])

  // ── Fetch helper ────────────────────────────────────────────────────────────
  const fetchPage = useCallback(async (
    fetchCursor: Cursor,
    filters: { type: string; difficulty: string; tag: string; search: string }
  ) => {
    setFetching(true)
    try {
      const params = new URLSearchParams()
      if (filters.type !== 'all')       params.set('type',       filters.type)
      if (filters.difficulty !== 'all') params.set('difficulty', filters.difficulty)
      if (filters.tag !== 'all')        params.set('tag_id',     filters.tag)
      if (filters.search)               params.set('search',     filters.search)
      if (fetchCursor) {
        params.set('after_created_at', fetchCursor.created_at)
        params.set('after_id',         fetchCursor.id)
      }
      const res  = await fetch(`/api/questions?${params}`)
      const json = await res.json()
      setQuestions(json.data ?? [])
      setHasNext(json.has_next ?? false)
    } catch {
      // silent — keep current state on network error
    } finally {
      setFetching(false)
    }
  }, [])

  // ── Re-fetch when any filter changes (reset to page 1) ──────────────────────
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    setCursor(null)
    setPrevCursors([])
    fetchPage(null, {
      type:       typeFilter,
      difficulty: difficultyFilter,
      tag:        tagFilter,
      search:     debouncedSearch,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, difficultyFilter, tagFilter, debouncedSearch])

  // ── Navigation ──────────────────────────────────────────────────────────────
  function goToNext() {
    if (!hasNext || questions.length === 0 || fetching) return
    const last       = questions[questions.length - 1]
    const nextCursor: Cursor = { created_at: last.created_at, id: last.id }
    setPrevCursors((prev) => [...prev, cursor])
    setCursor(nextCursor)
    fetchPage(nextCursor, {
      type: typeFilter, difficulty: difficultyFilter, tag: tagFilter, search: debouncedSearch,
    })
  }

  function goToPrev() {
    if (prevCursors.length === 0 || fetching) return
    const newPrev   = [...prevCursors]
    const prevCursor = newPrev.pop()!
    setPrevCursors(newPrev)
    setCursor(prevCursor)
    fetchPage(prevCursor, {
      type: typeFilter, difficulty: difficultyFilter, tag: tagFilter, search: debouncedSearch,
    })
  }

  function setFilter(key: 'type' | 'difficulty' | 'tag', val: string) {
    if (key === 'type')       setTypeFilter(val)
    else if (key === 'difficulty') setDifficultyFilter(val)
    else setTagFilter(val)
    // useEffect above handles the fetch reset
  }

  const selectedTag  = tags.find((tag) => tag.id === tagFilter)
  const currentPage  = prevCursors.length + 1

  const CARD_THEMES = {
    easy:    { rail: 'from-emerald-400 to-teal-500',  glow: 'hover:shadow-emerald-100', icon: 'bg-emerald-50 text-emerald-600' },
    medium:  { rail: 'from-amber-400 to-orange-500',  glow: 'hover:shadow-amber-100',   icon: 'bg-amber-50 text-amber-600'   },
    hard:    { rail: 'from-rose-500 to-pink-500',     glow: 'hover:shadow-rose-100',    icon: 'bg-rose-50 text-rose-600'     },
    default: { rail: 'from-blue-500 to-indigo-600',   glow: 'hover:shadow-blue-100',    icon: 'bg-blue-50 text-blue-600'     },
  } as const

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Stats cards — always show full-bank counts, not filtered */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t('statTotal'),      value: stats.total,          detail: t('statTotalDetail'),      tone: 'from-blue-500 to-indigo-600'              },
          { label: t('statMc'),         value: stats.multipleChoice, detail: t('typeMcFull'),            tone: 'from-violet-500 to-purple-600'            },
          { label: t('statSa'),         value: stats.shortAnswer,    detail: t('typeSaFull'),            tone: 'from-cyan-500 to-sky-600'                 },
          { label: t('statDifficulty'), value: `${stats.easy}/${stats.medium}/${stats.hard}`, detail: t('statDifficultyDetail'), tone: 'from-emerald-400 via-amber-400 to-rose-500' },
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
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 h-9 rounded-lg border border-ash-light text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-canvas-light text-ink placeholder:text-mute-light"
            />
          </div>

          {/* Type pills */}
          <div className="flex items-center gap-1.5">
            {[
              { val: 'all',             label: t('filterAll') },
              { val: 'multiple_choice', label: t('filterMc')  },
              { val: 'short_answer',    label: t('filterSa')  },
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

          {/* Difficulty pills */}
          <div className="flex items-center gap-1.5">
            {[
              { val: 'all',    label: t('filterAllDiff') },
              { val: 'easy',   label: t('filterEasy')    },
              { val: 'medium', label: t('filterMedium')  },
              { val: 'hard',   label: t('filterHard')    },
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
            <option value="all">{t('filterAllTopics')}</option>
            <optgroup label={t('groupRW')}>
              {tags.filter((tag) => tag.subject === 'reading_writing').map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </optgroup>
            <optgroup label={t('groupMath')}>
              {tags.filter((tag) => tag.subject === 'math').map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </optgroup>
          </select>

          <span className="ml-auto text-xs text-mute-light shrink-0">
            {fetching
              ? t('loadingStatus')
              : hasNext
                ? t('questionCountMore', { count: questions.length })
                : t('questionCountExact', { count: questions.length })}
          </span>
        </div>

        {selectedTag && (
          <div className="mt-3 flex items-center gap-2 text-xs text-mute-light">
            <span>{t('filterActiveTag')}</span>
            <Badge variant="info">{selectedTag.name}</Badge>
            <button
              type="button"
              onClick={() => setFilter('tag', 'all')}
              className="font-medium text-primary hover:text-blue-700"
            >
              {t('clearFilter')}
            </button>
          </div>
        )}
      </div>

      {/* Question list */}
      {!fetching && questions.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDesc')}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      ) : (
        <>
          <div className={`grid gap-3 transition-opacity duration-150 ${fetching ? 'opacity-50 pointer-events-none' : ''}`}>
            {questions.map((q, index) => {
              const theme = CARD_THEMES[(q.difficulty as keyof typeof CARD_THEMES) ?? 'default'] ?? CARD_THEMES.default
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
                        {q.content_preview}
                      </p>
                      <p className="text-xs text-mute-light mt-1">
                        {new Date(q.created_at).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {q.tags.slice(0, 1).map((tag) => (
                        <Badge key={tag.id} variant="default">{tag.name}</Badge>
                      ))}
                      {q.type === 'multiple_choice'
                        ? <Badge variant="info">{t('typeMcFull')}</Badge>
                        : <Badge variant="default">{t('typeSaFull')}</Badge>
                      }
                      {q.difficulty && (
                        <Badge variant={DIFFICULTY_VARIANTS[q.difficulty] ?? 'default'}>
                          {DIFFICULTY_LABELS[q.difficulty] ?? q.difficulty}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Pagination — keyset: no total pages, just prev/next */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <span className="text-xs text-mute-light">{t('pageLabel', { n: currentPage })}</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={prevCursors.length === 0 || fetching}
                onClick={goToPrev}
              >
                {t('prevPage')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!hasNext || fetching}
                onClick={goToNext}
              >
                {t('nextPage')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
