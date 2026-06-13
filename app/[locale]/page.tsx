import Image from 'next/image'
import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import {
  BookOpen,
  NotebookPen,
  LineChart,
  Target,
  Users,
  Flame,
  ArrowRight,
} from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { createServerClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'

export default async function LocaleRootPage({
  params,
}: {
  params: { locale: string }
}) {
  const { locale } = params
  setRequestLocale(locale)

  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Signed-in users go straight to their dashboard.
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const role = (data as { role: UserRole } | null)?.role
    if (role === 'admin') redirect(`/${locale}/admin`)
    if (role === 'teacher') redirect(`/${locale}/teacher`)
    if (role === 'student') redirect(`/${locale}/student`)
  }

  const t = await getTranslations('landing')
  const tCommon = await getTranslations('common')

  return (
    <div className="min-h-[100dvh] bg-white text-ink">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.jpg"
            alt="GD SAT Platform"
            width={40}
            height={40}
            className="rounded-xl"
            priority
          />
          <span className="hidden text-lg font-bold tracking-tight sm:block">GD SAT Platform</span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher variant="light" />
          <Link
            href="/login"
            className="flex h-10 items-center whitespace-nowrap rounded-full bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-soft"
          >
            {t('navLogin')}
          </Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 md:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div className="animate-fade-up">
          <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight md:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="mt-5 max-w-[32rem] text-base leading-7 text-mute-light md:text-lg md:leading-8">
            {t('heroSubtitle')}
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className="group inline-flex h-14 items-center gap-2 rounded-full bg-navy px-8 text-base font-semibold text-white transition-all hover:bg-navy-soft active:scale-[0.98]"
            >
              {t('heroCta')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          <p className="mt-4 max-w-[28rem] text-sm leading-6 text-mute-light">
            {t('heroNote')}
          </p>
        </div>

        {/* Real component preview with sample values */}
        <div className="relative mx-auto w-full max-w-[420px] animate-fade-up lg:mx-0" style={{ animationDelay: '120ms' }}>
          <div className="rounded-3xl bg-navy-deep p-6 pb-14 text-white shadow-[0_30px_80px_rgba(13,24,48,0.35)]">
            <p className="text-sm font-medium text-white/60">{t('previewScoreLabel')}</p>
            <div className="mt-4 flex items-center gap-5">
              <ScoreRing value={82} />
              <div>
                <p className="text-3xl font-extrabold">41/50</p>
                <p className="text-sm text-white/60">{t('previewScoreCorrect')}</p>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <SkillBar label={t('previewSkillReading')} pct={86} />
              <SkillBar label={t('previewSkillMath')} pct={74} />
            </div>
          </div>
          <div className="absolute -bottom-6 -left-4 flex items-center gap-3 rounded-2xl border border-hairline-light bg-white px-4 py-3 shadow-[0_16px_40px_rgba(13,24,48,0.14)] md:-left-10">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <Flame className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-mute-light">{t('previewStreakLabel')}</p>
              <p className="text-sm font-bold">{t('previewStreakValue')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features bento ──────────────────────────────────────────────── */}
      <section className="bg-surface-soft py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t('featuresTitle')}
            </h2>
            <p className="mt-4 text-base leading-7 text-mute-light">
              {t('featuresSubtitle')}
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-6">
            <FeatureCell
              className="md:col-span-4 bg-navy-deep text-white"
              icon={<BookOpen className="h-6 w-6" />}
              iconClass="bg-white/10 text-white"
              title={t('featBluebookTitle')}
              desc={t('featBluebookDesc')}
              descClass="text-white/65"
            />
            <FeatureCell
              className="md:col-span-2 bg-navy-tint"
              icon={<NotebookPen className="h-6 w-6" />}
              iconClass="bg-navy text-white"
              title={t('featErrorLogTitle')}
              desc={t('featErrorLogDesc')}
            />
            <FeatureCell
              className="md:col-span-2 bg-white border border-hairline-light"
              icon={<LineChart className="h-6 w-6" />}
              iconClass="bg-navy-tint text-navy"
              title={t('featAnalyticsTitle')}
              desc={t('featAnalyticsDesc')}
            />
            <FeatureCell
              className="md:col-span-2 bg-navy-tint"
              icon={<Target className="h-6 w-6" />}
              iconClass="bg-navy text-white"
              title={t('featPracticeTitle')}
              desc={t('featPracticeDesc')}
            />
            <FeatureCell
              className="md:col-span-2 bg-white border border-hairline-light"
              icon={<Users className="h-6 w-6" />}
              iconClass="bg-navy-tint text-navy"
              title={t('featClassTitle')}
              desc={t('featClassDesc')}
            />
          </div>
        </div>
      </section>

      {/* ── Steps timeline ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t('stepsTitle')}
        </h2>
        <ol className="mt-10 max-w-2xl space-y-0">
          {[
            { title: t('step1Title'), desc: t('step1Desc') },
            { title: t('step2Title'), desc: t('step2Desc') },
            { title: t('step3Title'), desc: t('step3Desc') },
          ].map((step, i, arr) => (
            <li key={step.title} className="relative flex gap-5 pb-10 last:pb-0">
              {i < arr.length - 1 && (
                <span className="absolute left-[19px] top-12 h-[calc(100%-3rem)] w-px bg-ash-light" aria-hidden />
              )}
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
                {i + 1}
              </span>
              <div className="pt-1.5">
                <h3 className="text-lg font-bold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-mute-light">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── CTA band ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 md:px-6">
        <div className="rounded-[32px] bg-navy-deep px-6 py-16 text-center text-white md:px-16">
          <h2 className="mx-auto max-w-xl text-3xl font-bold tracking-tight md:text-4xl">
            {t('ctaTitle')}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base leading-7 text-white/65">
            {t('ctaSubtitle')}
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex h-14 items-center gap-2 rounded-full bg-white px-8 text-base font-semibold text-navy transition-all hover:bg-navy-tint active:scale-[0.98]"
          >
            {t('heroCta')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-hairline-light">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-center md:flex-row md:px-6 md:text-left">
          <div className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="GD SAT Platform" width={32} height={32} className="rounded-lg" />
            <p className="text-sm font-semibold">{t('footerTagline')}</p>
          </div>
          <p className="text-xs text-mute-light">
            {tCommon('copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </div>
  )
}

/* Sample values shown in the hero preview are illustrative, not live data. */
function ScoreRing({ value }: { value: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden>
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke="#7aa7ff"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="49" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="700">
        {value}%
      </text>
    </svg>
  )
}

function SkillBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-white/80">{label}</span>
        <span className="font-bold">{pct}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#7aa7ff]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function FeatureCell({
  className,
  icon,
  iconClass,
  title,
  desc,
  descClass = 'text-mute-light',
}: {
  className: string
  icon: React.ReactNode
  iconClass: string
  title: string
  desc: string
  descClass?: string
}) {
  return (
    <div className={`rounded-3xl p-7 ${className}`}>
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconClass}`}>
        {icon}
      </span>
      <h3 className="mt-5 text-lg font-bold">{title}</h3>
      <p className={`mt-2 text-sm leading-6 ${descClass}`}>{desc}</p>
    </div>
  )
}
