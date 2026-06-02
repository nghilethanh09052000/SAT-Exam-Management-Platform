'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

export interface TopicItem {
  id: string
  name: string
  count: number
  byDifficulty: { easy: number; medium: number; hard: number; all: number }
  /** Latest saved result per difficulty, if the student has submitted one. */
  lastResults?: Record<string, { raw: number; total: number }>
}

export interface TopicSubject {
  key: 'reading_writing' | 'math'
  label: string
  topics: TopicItem[]
}

interface TopicBankProps {
  subjects: TopicSubject[]
  tabKey?: string
}

const SET_SIZE = 12
const MAX_SETS = 12
type Difficulty = 'easy' | 'medium' | 'hard' | 'all'

const SUBJECT_ACCENT: Record<string, { bar: string; soft: string; text: string }> = {
  reading_writing: { bar: 'bg-[#4f7cff]', soft: 'bg-[#eef3ff]', text: 'text-[#4f68f5]' },
  math: { bar: 'bg-[#16a34a]', soft: 'bg-[#eafaf0]', text: 'text-[#15803d]' },
}

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'all']

const DIFFICULTY_ACCENT: Record<Difficulty, { bar: string; soft: string; text: string; chip: string; panel: string }> = {
  easy: { bar: 'bg-[#16a34a]', soft: 'bg-[#eafaf0]', text: 'text-[#15803d]', chip: 'bg-[#dcf5e6] text-[#15803d]', panel: 'bg-[#f5fcf8]' },
  medium: { bar: 'bg-[#d97706]', soft: 'bg-[#fef3e2]', text: 'text-[#b45309]', chip: 'bg-[#fcecd2] text-[#b45309]', panel: 'bg-[#fffaf2]' },
  hard: { bar: 'bg-[#e11d48]', soft: 'bg-[#fdeaef]', text: 'text-[#be123c]', chip: 'bg-[#fbd9e2] text-[#be123c]', panel: 'bg-[#fff6f8]' },
  all: { bar: 'bg-[#4f7cff]', soft: 'bg-[#eef3ff]', text: 'text-[#4f68f5]', chip: 'bg-[#e2ebff] text-[#4f68f5]', panel: 'bg-[#f7f9ff]' },
}

export function TopicBank({ subjects, tabKey = 'topics' }: TopicBankProps) {
  const t = useTranslations('student.topicBank')

  const firstTopic = subjects.find((s) => s.topics.length > 0)?.topics[0] ?? null
  const [selectedId, setSelectedId] = useState<string | null>(firstTopic?.id ?? null)

  const allTopics = subjects.flatMap((s) =>
    s.topics.map((topic) => ({ ...topic, subject: s.key }))
  )
  const selected = allTopics.find((topic) => topic.id === selectedId) ?? null
  const accent = selected ? SUBJECT_ACCENT[selected.subject] ?? SUBJECT_ACCENT.reading_writing : SUBJECT_ACCENT.reading_writing

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      {/* ── Explore sidebar ─────────────────────────────────────────── */}
      <aside className="overflow-hidden rounded-[26px] border border-white/80 bg-white/90 shadow-sm shadow-blue-100/60 backdrop-blur">
        <div className="bg-gradient-to-r from-[#4f7cff] via-[#6d5dfc] to-[#8b5cf6] px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-white">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 21l-4.9 2.6.9-5.5-4-3.9L9.5 8z" />
            </svg>
            {t('explore')}
          </p>
        </div>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto p-4 lg:max-h-[72vh]">
          {subjects.map((subject) => {
            const acc = SUBJECT_ACCENT[subject.key] ?? SUBJECT_ACCENT.reading_writing
            return (
              <div key={subject.key}>
                <p className="px-2 pb-2 text-xs font-black uppercase tracking-[0.16em] text-[#9aa2b6]">
                  {subject.label}
                </p>
                <div className="space-y-1">
                  {subject.topics.map((topic) => {
                    const active = topic.id === selectedId
                    return (
                      <button
                        key={topic.id}
                        onClick={() => setSelectedId(topic.id)}
                        className={[
                          'group flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-sm font-bold transition-all duration-200',
                          active
                            ? `${acc.soft} ${acc.text} shadow-sm`
                            : 'text-[#54596b] hover:bg-[#f5f7ff]',
                        ].join(' ')}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${active ? acc.bar : 'bg-[#cdd4e6]'}`} />
                        <span className="flex-1 truncate">{topic.name}</span>
                        <span className={[
                          'rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums',
                          active ? 'bg-white/80' : 'bg-[#eef0f7] text-[#8a91a3]',
                        ].join(' ')}>
                          {topic.count}
                        </span>
                      </button>
                    )
                  })}
                  {subject.topics.length === 0 && (
                    <p className="px-3 py-2 text-xs font-medium text-[#9aa2b6]">{t('noTopics')}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      {/* ── Sets panel ──────────────────────────────────────────────── */}
      <section className="rounded-[26px] border border-white/80 bg-white/90 p-6 shadow-sm shadow-blue-100/60 backdrop-blur">
        {!selected ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0f4ff] text-[#9aa2b6]">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <p className="mt-4 text-base font-black text-[#252837]">{t('emptyTitle')}</p>
            <p className="mt-1 max-w-sm text-sm font-medium text-[#8a91a3]">{t('emptyDesc')}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-[#252837]">{selected.name}</h2>
                <p className="mt-1 text-sm font-semibold text-[#8a91a3]">
                  {t('available', { count: selected.count })}
                </p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg ${accent.bar}`}>
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>

            {selected.count === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-[#dfe4f1] bg-[#f9fafd] p-8 text-center">
                <p className="text-sm font-black text-[#252837]">{t('noQuestionsTitle')}</p>
                <p className="mt-1 text-sm font-medium text-[#8a91a3]">{t('noQuestionsDesc')}</p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {DIFFICULTY_ORDER.map((level) => {
                  const total = selected.byDifficulty[level]
                  if (total === 0) return null
                  const da = DIFFICULTY_ACCENT[level]
                  const setCount = Math.min(MAX_SETS, Math.max(1, Math.ceil(total / SET_SIZE)))
                  const sets = Array.from({ length: setCount }, (_, i) => i)
                  const lastResult = selected.lastResults?.[level]
                  return (
                    <div
                      key={level}
                      className={`overflow-hidden rounded-3xl border border-[#eef0f7] ${da.panel} p-5`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-black ${da.chip}`}>
                          <span className={`h-2 w-2 rounded-full ${da.bar}`} />
                          {t(`difficulty.${level}`)}
                        </span>
                        <div className="flex items-center gap-2">
                          {lastResult && (
                            <Link
                              href={`/student/practice/result?kind=category&ref=${selected.id}&difficulty=${level}`}
                              className="inline-flex items-center gap-1.5 rounded-full bg-[#eafaf0] px-3 py-1 text-xs font-black text-[#15803d] shadow-sm transition-colors hover:bg-[#dcf5e6]"
                            >
                              <svg className="h-3.5 w-3.5 text-[#16a34a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                              </svg>
                              {t('completed')}
                            </Link>
                          )}
                          <span className="text-xs font-bold text-[#9aa2b6]">
                            {t('available', { count: total })}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {sets.map((i) => {
                          const offset = i * SET_SIZE
                          const count = Math.min(SET_SIZE, total - offset)
                          const params = new URLSearchParams({
                            n: String(SET_SIZE),
                            offset: String(offset),
                            difficulty: level,
                            tab: tabKey,
                          })
                          return (
                            <Link
                              key={i}
                              href={`/student/practice/topic/${selected.id}?${params.toString()}`}
                              className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-[#eef0f7] bg-white py-4 pl-4 pr-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                            >
                              <span className={`absolute left-0 top-0 h-full w-1.5 rounded-r ${da.bar}`} />
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${da.soft} ${da.text}`}>
                                {i + 1}
                              </span>
                              <span className="flex-1">
                                <span className="block text-sm font-black text-[#3d4459]">
                                  {t('set', { n: i + 1 })}
                                </span>
                                <span className="block text-xs font-semibold text-[#9aa2b6]">
                                  {t('available', { count })}
                                </span>
                              </span>
                              <svg className="h-4 w-4 text-[#b6bdd0] transition-transform group-hover:translate-x-0.5 group-hover:text-[#4f7cff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
