import Image from 'next/image'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import {
  BookOpen,
  NotebookPen,
  LineChart,
  Target,
  Users,
  Flame,
  ArrowRight,
  TrendingUp,
  Trophy,
  Sparkles,
  MessageSquare,
  GraduationCap,
  Route,
  LayoutDashboard,
  HeartHandshake,
} from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { LandingNav } from '@/components/landing/landing-nav'
import { TestimonialsCarousel } from '@/components/landing/testimonials-carousel'
import { createServerClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'

const FACEBOOK_URL = 'https://www.facebook.com/thedhgteam'

/* Student score reports & feedback, captured from Messenger after test day. */
const TESTIMONIALS = [
  { src: '/testimonials/score-1590-phuong-linh.jpg', score: '1590', name: 'Phương Linh' },
  { src: '/testimonials/score-1580-ngoc-khanh.jpg', score: '1580', name: 'Ngọc Khanh' },
  { src: '/testimonials/score-1580-mai-bui.jpg', score: '1580', name: 'Mai Bùi' },
  { src: '/testimonials/score-1580-thao-nhi.jpg', score: '1580', name: 'Thảo Nhi' },
  { src: '/testimonials/score-1580-thao-dan.jpg', score: '1580', name: 'Thảo Đan' },
  { src: '/testimonials/score-1570-phuong-anh.jpg', score: '1570', name: 'Phương Anh' },
  { src: '/testimonials/score-1560.jpg', score: '1560', name: 'GD SAT' },
] as const

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07Z" />
    </svg>
  )
}

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

  const { data } = user
    ? await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null }

  const role = (data as { role: UserRole } | null)?.role
  const consoleHref =
    role === 'admin'
      ? '/admin'
      : role === 'teacher'
        ? '/teacher'
        : role === 'student'
          ? '/student'
          : null

  const t = await getTranslations('landing')
  const tCommon = await getTranslations('common')
  const primaryHref = consoleHref ?? '/login'
  const primaryLabel = consoleHref ? t('heroConsoleCta') : t('heroCta')

  return (
    <div className="min-h-[100dvh] scroll-smooth bg-white text-ink">
      {/* ── Fixed nav ───────────────────────────────────────────────────── */}
      <LandingNav
        primaryHref={primaryHref}
        primaryLabel={consoleHref ? t('navConsole') : t('navLogin')}
      />

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-28 md:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-36">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full bg-navy-tint px-3 py-1 text-xs font-semibold text-navy">
            <Sparkles className="h-3.5 w-3.5" />
            {t('heroBadge')}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.12] tracking-tight md:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="mt-5 max-w-[32rem] text-base leading-7 text-mute-light md:text-lg md:leading-8">
            {t('heroSubtitle')}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={primaryHref}
              className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-navy px-8 text-base font-semibold text-white transition-all hover:bg-navy-soft active:scale-[0.98]"
            >
              {primaryLabel}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#results"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-hairline-light px-8 text-base font-semibold text-navy transition-colors hover:bg-surface-soft"
            >
              {t('heroSecondaryCta')}
            </a>
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

      {/* ── Stats band ──────────────────────────────────────────────────── */}
      <section className="border-y border-hairline-light bg-navy-deep">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden px-4 md:grid-cols-4 md:px-6">
          <StatItem value={t('statHighScoreValue')} label={t('statHighScoreLabel')} />
          <StatItem value={t('statImprovementValue')} label={t('statImprovementLabel')} />
          <StatItem value={t('statStudentsValue')} label={t('statStudentsLabel')} />
          <StatItem value={t('statSupportValue')} label={t('statSupportLabel')} />
        </div>
      </section>

      {/* ── Course intro ────────────────────────────────────────────────── */}
      <section id="course" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-4 pt-20 md:px-6">
        <div className="rounded-[32px] border border-hairline-light bg-surface-soft p-8 md:p-12">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-navy-tint px-3 py-1 text-xs font-semibold text-navy">
              <Sparkles className="h-3.5 w-3.5" />
              DHG team
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              {t('courseTitle')}
            </h2>
            <p className="mt-4 text-base leading-7 text-mute-light">
              {t('courseSubtitle')}
            </p>
          </div>

          {/* Result highlights */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <HighlightStat
              icon={<Trophy className="h-5 w-5" />}
              label={t('courseHighlightScore')}
              value={t('courseHighlightScoreValue')}
            />
            <HighlightStat
              icon={<TrendingUp className="h-5 w-5" />}
              label={t('courseHighlightImprovementLabel')}
              value={t('courseHighlightImprovementValue')}
            />
            <HighlightStat
              icon={<Users className="h-5 w-5" />}
              label={t('courseHighlightStudentsLabel')}
              value={t('courseHighlightStudentsValue')}
            />
          </div>

          {/* What you get */}
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            <CoursePoint
              title={t('coursePointBluebookTitle')}
              desc={t('coursePointBluebookDesc')}
            />
            <CoursePoint
              title={t('coursePointMentorTitle')}
              desc={t('coursePointMentorDesc')}
            />
            <CoursePoint
              title={t('coursePointRoadmapTitle')}
              desc={t('coursePointRoadmapDesc')}
            />
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

      {/* ── Why choose us / method ──────────────────────────────────────── */}
      <section id="method" className="scroll-mt-24 bg-navy-deep py-20 text-white">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t('methodTitle')}
            </h2>
            <p className="mt-4 text-base leading-7 text-white/65">
              {t('methodSubtitle')}
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <MethodCard
              icon={<GraduationCap className="h-6 w-6" />}
              title={t('method1Title')}
              desc={t('method1Desc')}
            />
            <MethodCard
              icon={<Route className="h-6 w-6" />}
              title={t('method2Title')}
              desc={t('method2Desc')}
            />
            <MethodCard
              icon={<LayoutDashboard className="h-6 w-6" />}
              title={t('method3Title')}
              desc={t('method3Desc')}
            />
            <MethodCard
              icon={<HeartHandshake className="h-6 w-6" />}
              title={t('method4Title')}
              desc={t('method4Desc')}
            />
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────── */}
      <section id="results" className="scroll-mt-24 bg-surface-soft py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t('testimonialsTitle')}
            </h2>
            <p className="mt-4 text-base leading-7 text-mute-light">
              {t('testimonialsSubtitle')}
            </p>
          </div>

          <TestimonialsCarousel items={TESTIMONIALS} badge={t('testimonialsBadge')} />
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-20 md:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('faqTitle')}</h2>
          <p className="mt-4 text-base leading-7 text-mute-light">{t('faqSubtitle')}</p>
        </div>
        <div className="mt-10 space-y-3">
          {[
            { q: t('faq1Q'), a: t('faq1A') },
            { q: t('faq2Q'), a: t('faq2A') },
            { q: t('faq3Q'), a: t('faq3A') },
            { q: t('faq4Q'), a: t('faq4A') },
            { q: t('faq5Q'), a: t('faq5A') },
          ].map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-hairline-light bg-white px-5 py-4 [&_summary]:list-none"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-semibold">
                {item.q}
                <ArrowRight className="h-4 w-4 shrink-0 text-mute-light transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-sm leading-6 text-mute-light">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Community / Facebook ────────────────────────────────────────── */}
      <section id="community" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-20 md:px-6">
        <div className="flex flex-col items-center gap-6 rounded-[32px] border border-hairline-light bg-white px-6 py-12 text-center md:flex-row md:justify-between md:px-12 md:text-left">
          <div className="flex items-center gap-5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#1877F2]/10 text-[#1877F2]">
              <FacebookIcon className="h-7 w-7" />
            </span>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{t('communityTitle')}</h2>
              <p className="mt-1.5 max-w-md text-sm leading-6 text-mute-light">
                {t('communitySubtitle')}
              </p>
            </div>
          </div>
          <a
            href={FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-[#1877F2] px-6 text-sm font-semibold text-white transition-all hover:bg-[#0f63d6] active:scale-[0.98]"
          >
            <MessageSquare className="h-4 w-4" />
            {t('communityCta')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
        </div>
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
            href={primaryHref}
            className="mt-8 inline-flex h-14 items-center gap-2 rounded-full bg-white px-8 text-base font-semibold text-navy transition-all hover:bg-navy-tint active:scale-[0.98]"
          >
            {primaryLabel}
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
          <div className="flex flex-col items-center gap-3 md:flex-row md:gap-6">
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-mute-light transition-colors hover:text-[#1877F2]"
            >
              <FacebookIcon className="h-4 w-4" />
              {t('footerFacebook')}
            </a>
            <p className="text-xs text-mute-light">
              {tCommon('copyright', { year: new Date().getFullYear() })}
            </p>
          </div>
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

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-navy-deep px-4 py-8 text-center md:py-10">
      <p className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">{value}</p>
      <p className="mt-1.5 text-xs font-medium text-white/55 md:text-sm">{label}</p>
    </div>
  )
}

function MethodCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
        {icon}
      </span>
      <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/60">{desc}</p>
    </div>
  )
}

function HighlightStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-hairline-light bg-white px-5 py-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-tint text-navy">
        {icon}
      </span>
      <div>
        <p className="text-xs font-medium text-mute-light">{label}</p>
        <p className="text-lg font-extrabold tracking-tight">{value}</p>
      </div>
    </div>
  )
}

function CoursePoint({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white p-5">
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-mute-light">{desc}</p>
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
