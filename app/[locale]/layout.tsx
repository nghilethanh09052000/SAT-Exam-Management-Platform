import type { Metadata } from 'next'
import { Be_Vietnam_Pro } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { ApiLoadingProvider } from '@/components/ui/api-loading-provider'
import { routing } from '@/i18n/routing'
import '../globals.css'
import 'katex/dist/katex.min.css'

// One family for display + body so Vietnamese diacritics (ư, ở, ạ) sit on a
// consistent baseline and weights stay uniform across the whole app.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-be-vietnam',
  display: 'swap',
})

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const { locale } = await params as { locale: string }
  const t = await getTranslations({ locale, namespace: 'site' })
  return {
    title: t('title'),
    description: t('description'),
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const { locale } = await params as { locale: string }

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound()
  }

  setRequestLocale(locale)

  const messages = await getMessages()

  return (
    <html lang={locale} className={beVietnamPro.variable}>
      <body className="antialiased font-body">
        <NextIntlClientProvider messages={messages}>
          <ApiLoadingProvider>{children}</ApiLoadingProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
