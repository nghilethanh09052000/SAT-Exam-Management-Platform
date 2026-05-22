import type { Metadata } from 'next'
import { Roboto, Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { ApiLoadingProvider } from '@/components/ui/api-loading-provider'
import { routing } from '@/i18n/routing'
import '../globals.css'
import 'katex/dist/katex.min.css'

const roboto = Roboto({
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-roboto',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SAT Management Platform',
  description: 'Nền tảng luyện thi SAT cho học sinh Việt Nam',
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const { locale } = params

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound()
  }

  setRequestLocale(locale)

  const messages = await getMessages()

  return (
    <html lang={locale} className={`${roboto.variable} ${inter.variable}`}>
      <body className="antialiased font-body">
        <NextIntlClientProvider messages={messages}>
          <ApiLoadingProvider>{children}</ApiLoadingProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
