import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

// Renders inside app/[locale]/layout.tsx (which owns <html>/<body>), so
// notFound() calls anywhere in the locale tree produce a valid document.
export default async function LocaleNotFound() {
  const t = await getTranslations('notFound')

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-navy-deep px-4 text-center">
      <p className="text-7xl font-extrabold tracking-tight text-white/20">404</p>
      <h1 className="mt-4 text-2xl font-bold text-white">{t('title')}</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-white/60">{t('description')}</p>
      <Link
        href="/"
        className="mt-8 inline-flex h-12 items-center rounded-full bg-white px-6 text-sm font-semibold text-navy transition-colors hover:bg-navy-tint"
      >
        {t('backHome')}
      </Link>
    </div>
  )
}
