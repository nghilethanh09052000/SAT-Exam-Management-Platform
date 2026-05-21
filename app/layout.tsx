import type { Metadata } from 'next'
import { Roboto, Inter } from 'next/font/google'
import { ApiLoadingProvider } from '@/components/ui/api-loading-provider'
import './globals.css'
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi" className={`${roboto.variable} ${inter.variable}`}>
      <body className="antialiased font-body">
        <ApiLoadingProvider>{children}</ApiLoadingProvider>
      </body>
    </html>
  )
}
