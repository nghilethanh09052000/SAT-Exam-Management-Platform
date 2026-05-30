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

const STATUS_STYLES: Record<string, string> = {
  submitted: 'bg-emerald-50 text-emerald-700',
  in_progress: 'bg-amber-50 text-amber-700',
  available: 'bg-[#eef3ff] text-[#4f68f5]',
  expired: 'bg-rose-50 text-rose-600',
}

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

function ModuleColumn({ label, modules, accent }: { label: string; modules: string[]; accent: string }) {
  if (modules.length === 0) return null
  return (
    <div className="rounded-2xl border border-[#eef0f7] bg-[#f9fafd] p-3">
      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#9aa2b6]">{label}</p>
      <div className="space-y-1.5">
        {modules.map((m, i) => (
          <div key={`${m}-${i}`} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#3d4459] shadow-sm">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent}`} />
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
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => {
        const { english, math } = splitModules(item.modules)
        const hasModules = item.modules.length > 0
        return (
          <div
            key={item.id}
            className="flex flex-col overflow-hidden rounded-[26px] border border-white/80 bg-white/90 shadow-sm shadow-blue-100/60 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-white via-[#f7fbff] to-[#fff8e7] px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate text-base font-black text-[#252837]">{item.title}</h3>
                {item.meta && <p className="mt-0.5 truncate text-xs font-semibold text-[#8a91a3]">{item.meta}</p>}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${STATUS_STYLES[item.status]}`}>
                {t(`status.${item.status}`)}
              </span>
            </div>

            <div className="flex flex-1 flex-col p-5">
              {hasModules ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <ModuleColumn label={t('english')} modules={english} accent="bg-[#4f7cff]" />
                  <ModuleColumn label={t('math')} modules={math} accent="bg-[#16a34a]" />
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#dfe4f1] bg-[#f9fafd] px-4 py-3 text-xs font-bold text-[#8a91a3]">
                  {t('fullTest')}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between text-xs font-bold text-[#9aa2b6]">
                <span>{t('questionCount', { count: item.questionCount })}</span>
                {item.score && (
                  <span className="font-black text-[#22a06b]">{item.score.raw}/{item.score.total}</span>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <Link href={item.href} className="flex-1">
                  <span className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#4f7cff] to-[#7c4dff] px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-indigo-300/30 transition-all duration-200 hover:-translate-y-0.5">
                    {item.status === 'in_progress' ? t('resume') : item.status === 'submitted' ? t('retake') : t('start')}
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
                {item.resultsHref && (
                  <Link href={item.resultsHref}>
                    <span className="flex items-center justify-center rounded-2xl border border-[#e0e6f7] bg-white px-4 py-2.5 text-sm font-black text-[#4f68f5] transition-colors hover:bg-[#f0f4ff]">
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
