import { createServerClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Link } from '@/i18n/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

interface ExamPaperRow {
  id: string
  title: string
  source: string | null
  year: number | null
  description: string | null
  is_public: boolean
  created_at: string
}

const PAPER_THEMES = [
  {
    mark: 'bg-[#dcecff] text-[#0c5ea8] ring-[#b9d7f6]',
    panel: 'from-[#eef6ff] to-white',
    rail: 'bg-[#0f6fb7]',
  },
  {
    mark: 'bg-[#e2f8ed] text-[#13734c] ring-[#b8ebcf]',
    panel: 'from-[#f0fbf5] to-white',
    rail: 'bg-[#16835a]',
  },
  {
    mark: 'bg-[#fff1cc] text-[#95620b] ring-[#f5d789]',
    panel: 'from-[#fff8e6] to-white',
    rail: 'bg-[#c78313]',
  },
  {
    mark: 'bg-[#ffe7df] text-[#a14322] ring-[#f4c4b1]',
    panel: 'from-[#fff3ef] to-white',
    rail: 'bg-[#c7502a]',
  },
]

export default async function ExamPapersPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.examPapers')
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .single()
  const isAdmin = (profileData as { role: string } | null)?.role === 'admin'

  const baseQuery = supabase
    .from('exam_papers')
    .select('id, title, source, year, description, is_public, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  const { data } = isAdmin
    ? await baseQuery
    : await baseQuery.eq('created_by', user?.id ?? '')

  const papers: ExamPaperRow[] = (data as ExamPaperRow[] | null) ?? []
  const publicCount = papers.filter((paper) => paper.is_public).length
  const currentYearCount = papers.filter((paper) => paper.year === new Date().getFullYear()).length
  const latestPaper = papers[0]

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-[#d7e7f8] bg-[#f7fbff] shadow-[0_22px_50px_-28px_rgba(15,111,183,0.45)] animate-fade-up">
        <div className="absolute right-0 top-0 h-full w-1/2 bg-[linear-gradient(135deg,rgba(15,111,183,0.12),rgba(22,131,90,0.10)_48%,rgba(199,131,19,0.12))]" />
        <div className="relative grid gap-6 p-5 md:grid-cols-[1.35fr_0.65fr] md:p-7 lg:p-8">
          <div className="flex min-w-0 flex-col justify-between gap-8">
            <div className="space-y-4">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#c8ddf1] bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[#0c5ea8] shadow-sm backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[#16835a]" />
                {t('exam')}
              </div>
              <div className="max-w-2xl space-y-3">
                <h1 className="font-display text-3xl font-black tracking-tight text-[#17202a] md:text-5xl">
                  {t('title')}
                </h1>
                <p className="text-sm leading-6 text-[#607083] md:text-base">
                  {t('count', { count: papers.length })}
                  {latestPaper ? ` · ${latestPaper.title}` : ''}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#708095]">{t('title')}</p>
                <p className="mt-2 font-mono text-2xl font-black text-[#17202a]">{papers.length}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#708095]">{t('badgePublic')}</p>
                <p className="mt-2 font-mono text-2xl font-black text-[#16835a]">{publicCount}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#708095]">{new Date().getFullYear()}</p>
                <p className="mt-2 font-mono text-2xl font-black text-[#c78313]">{currentYearCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/80 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_16px_34px_-24px_rgba(15,111,183,0.55)] backdrop-blur">
            <div className="flex h-full min-h-[220px] flex-col justify-between rounded-[20px] border border-[#d6e7f8] bg-[#fbfdff] p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#0c5ea8]">SAT</p>
                  <p className="mt-2 text-lg font-black text-[#17202a]">{t('exam')}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0f6fb7] text-xs font-black text-white shadow-sm">
                  GD
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-2 rounded-full bg-[#e6eef7]">
                  <div className="h-full w-2/3 rounded-full bg-[#0f6fb7]" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {PAPER_THEMES.map((theme, index) => (
                    <span key={theme.rail} className={`h-12 rounded-xl ${theme.rail} ${index === 0 ? 'opacity-100' : 'opacity-70'}`} />
                  ))}
                </div>
              </div>
              <Link href="/teacher/exam-papers/new">
                <Button className="w-full shadow-sm transition-transform duration-200 active:scale-[0.98]">{t('new')}</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {papers.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[#b9d7f6] bg-white p-8 shadow-sm">
          <EmptyState
            title={t('empty')}
            description={t('emptyDesc')}
            action={
              <Link href="/teacher/exam-papers/new">
                <Button>{t('new')}</Button>
              </Link>
            }
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.15fr_0.85fr_1fr]">
          {papers.map((p, i) => {
            const theme = PAPER_THEMES[i % PAPER_THEMES.length]
            return (
            <Link
              key={p.id}
              href={`/teacher/exam-papers/${p.id}`}
              className={`group relative min-h-[210px] overflow-hidden rounded-[24px] border border-[#e1ebf4] bg-gradient-to-br ${theme.panel} p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#c8ddf1] hover:shadow-[0_20px_42px_-26px_rgba(23,32,42,0.38)] active:scale-[0.99] ${i % 5 === 0 ? 'md:row-span-2' : ''} animate-fade-up`}
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <div className={`absolute left-0 top-0 h-full w-1.5 ${theme.rail}`} />
              <div className="absolute -right-14 -top-14 h-32 w-32 rounded-full border border-white/80 bg-white/50" />
              <div className="relative flex h-full flex-col justify-between gap-6 pl-1">
                <div className="flex items-start justify-between gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xs font-black ring-1 ${theme.mark}`}>
                    SAT
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {p.is_public && <Badge variant="success">{t('badgePublic')}</Badge>}
                    <Badge variant="info">{p.year ?? t('exam')}</Badge>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="line-clamp-2 text-lg font-black leading-tight tracking-tight text-[#17202a] transition-colors group-hover:text-[#0c5ea8]">
                    {p.title}
                  </p>
                  <p className="text-sm leading-6 text-[#607083] line-clamp-2">
                    {p.description || [p.source, p.year].filter(Boolean).join(' · ') || t('emptyDesc')}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-[#dfeaf4] pt-4 text-xs font-semibold text-[#708095]">
                  <span className="truncate">{p.source || t('exam')}</span>
                  <span className="shrink-0 font-mono">{new Date(p.created_at).toLocaleDateString(dateLocale)}</span>
                </div>
              </div>
            </Link>
          )})}
        </div>
      )}
    </div>
  )
}
