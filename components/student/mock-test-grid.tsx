import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { EmptyState } from '@/components/ui/empty-state'

export interface MockTestItem {
  id: string
  title: string
  meta: string | null
  modules: string[]
  questionCount: number
  status: 'submitted' | 'in_progress' | 'available' | 'expired'
  href: string
  resultsHref?: string | null
  score?: { raw: number; total: number } | null
}

// Status pill colours sit on top of the teal header, so they lean translucent
// white rather than the pastel chips used elsewhere in the app.
const STATUS_STYLES: Record<string, string> = {
  submitted: 'bg-white/90 text-[#1f9d82]',
  in_progress: 'bg-white/90 text-[#c2820a]',
  available: 'bg-white/25 text-white',
  expired: 'bg-white/90 text-rose-500',
}

// Per-section palette. English leans blue, Math leans violet — echoing the
// reference layout where each subject owns its own accent colour.
const SECTION_THEME = {
  english: {
    panel: 'bg-[#eef4ff]',
    label: 'text-[#4f7cff]',
    bar: 'bg-[#4f7cff]',
    ring: '#4f7cff',
  },
  math: {
    panel: 'bg-[#f3effe]',
    label: 'text-[#8b5cf6]',
    bar: 'bg-[#8b5cf6]',
    ring: '#8b5cf6',
  },
} as const

// Splits flat module names into the two SAT sections shown in the mock-test
// layout. Anything mentioning "math" lands in the Math column; everything else
// is treated as Reading & Writing.
function splitModules(modules: string[]) {
  const english: string[] = []
  const math: string[] = []
  for (const m of modules) {
    if (/math|toán/i.test(m)) math.push(m)
    else english.push(m)
  }
  return { english, math }
}

// Compact SVG progress ring — pure markup so the card stays a server component.
function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 13
  const c = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * c
  return (
    <span className="relative inline-flex h-9 w-9 items-center justify-center">
      <svg viewBox="0 0 32 32" className="h-9 w-9 -rotate-90">
        <circle cx="16" cy="16" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-black/5" />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <span className="absolute text-[9px] font-black tabular-nums text-[#3d4459]">{Math.round(pct)}%</span>
    </span>
  )
}

function ModuleSection({
  label,
  modules,
  theme,
  pct,
}: {
  label: string
  modules: string[]
  theme: (typeof SECTION_THEME)[keyof typeof SECTION_THEME]
  pct: number
}) {
  if (modules.length === 0) return null
  return (
    <div className={`rounded-2xl ${theme.panel} p-3.5`}>
      <div className="mb-2.5 flex items-center justify-between">
        <p className={`text-[11px] font-black uppercase tracking-[0.16em] ${theme.label}`}>{label}</p>
        <ProgressRing pct={pct} color={theme.ring} />
      </div>
      <div className="space-y-2">
        {modules.map((m, i) => (
          <div
            key={`${m}-${i}`}
            className="flex items-center gap-2.5 overflow-hidden rounded-xl bg-white py-2.5 pl-0 pr-3 text-xs font-bold text-[#3d4459] shadow-[0_1px_3px_rgba(20,30,60,0.06)] transition-transform duration-200 hover:translate-x-0.5"
          >
            <span className={`h-7 w-1.5 shrink-0 rounded-full ${theme.bar}`} />
            <span className="truncate">{m}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export async function MockTestGrid({ items, emptyTitle, emptyDesc }: {
  items: MockTestItem[]
  emptyTitle: string
  emptyDesc: string
}) {
  const t = await getTranslations('student.mockTest')

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDesc} />
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const { english, math } = splitModules(item.modules)
        const hasModules = item.modules.length > 0
        const pct = item.score && item.score.total > 0
          ? (item.score.raw / item.score.total) * 100
          : 0
        return (
          <div
            key={item.id}
            className="flex flex-col overflow-hidden rounded-[26px] border border-[#e6f3ef] bg-white shadow-[0_18px_40px_-20px_rgba(45,160,135,0.35)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-18px_rgba(45,160,135,0.45)]"
          >
            {/* Seafoam header — bold title left, status pill right */}
            <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-[#7fded0] to-[#4fc1a9] px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-black tracking-tight text-white drop-shadow-sm">{item.title}</h3>
                {item.meta && <p className="mt-0.5 truncate text-[11px] font-bold text-white/85">{item.meta}</p>}
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide shadow-sm ${STATUS_STYLES[item.status]}`}>
                {t(`status.${item.status}`)}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-3 p-4">
              {hasModules ? (
                <>
                  <ModuleSection label={t('english')} modules={english} theme={SECTION_THEME.english} pct={pct} />
                  <ModuleSection label={t('math')} modules={math} theme={SECTION_THEME.math} pct={pct} />
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#cfeae3] bg-[#f1fbf8] px-4 py-3 text-xs font-bold text-[#5aa394]">
                  {t('fullTest')}
                </div>
              )}

              <div className="flex items-center justify-between px-1 text-[11px] font-bold text-[#9aa2b6]">
                <span>{t('questionCount', { count: item.questionCount })}</span>
                {item.score && (
                  <span className="font-black text-[#1f9d82]">{item.score.raw}/{item.score.total}</span>
                )}
              </div>

              {/* Footer actions styled as the reference's twin teal pills */}
              <div className="mt-auto flex gap-2.5 pt-1">
                <Link href={item.href} className="flex-1">
                  <span className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#54c4ac] to-[#3aa98f] px-4 py-2.5 text-[13px] font-black uppercase tracking-wide text-white shadow-[0_8px_18px_-8px_rgba(45,160,135,0.7)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0">
                    {item.status === 'in_progress' ? t('resume') : item.status === 'submitted' ? t('retake') : t('start')}
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
                {item.resultsHref && (
                  <Link href={item.resultsHref} className="flex-1">
                    <span className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#e7f7f2] px-4 py-2.5 text-[13px] font-black uppercase tracking-wide text-[#2d9a82] transition-colors hover:bg-[#d6f1e9]">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 14l3-3 2 2 4-5M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" />
                      </svg>
                      {t('results')}
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
