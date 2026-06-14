'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Menu, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { LanguageSwitcher } from '@/components/ui/language-switcher'

const FACEBOOK_URL = 'https://www.facebook.com/thedhgteam'

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07Z" />
    </svg>
  )
}

/**
 * Fixed/sticky landing navigation, à la dolenglish.vn: solid once the user
 * scrolls, with in-page anchor links plus the login / console CTA. Anchor
 * targets get `scroll-mt-24` in the page so the fixed bar never overlaps them.
 */
export function LandingNav({
  primaryHref,
  primaryLabel,
}: {
  primaryHref: string
  primaryLabel: string
}) {
  const t = useTranslations('landing')
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = [
    { href: '#course', label: t('navCourse') },
    { href: '#method', label: t('navMethod') },
    { href: '#results', label: t('navResults') },
    { href: '#faq', label: t('navFaq') },
    { href: '#community', label: t('navCommunity') },
  ]

  return (
    <header
      className={[
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled || open
          ? 'border-b border-hairline-light bg-white/90 backdrop-blur-md shadow-[0_4px_20px_rgba(13,24,48,0.05)]'
          : 'border-b border-transparent bg-white/0',
      ].join(' ')}
    >
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-4 md:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3" aria-label="GD SAT Platform">
          <Image src="/logo.jpg" alt="GD SAT Platform" width={38} height={38} className="rounded-xl" priority />
          <span className="text-lg font-bold tracking-tight">GD SAT Platform</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-mute-light transition-colors hover:bg-surface-soft hover:text-navy"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-mute-light transition-colors hover:bg-surface-soft hover:text-[#1877F2] sm:flex"
          >
            <FacebookIcon className="h-5 w-5" />
          </a>
          <div className="hidden sm:block">
            <LanguageSwitcher variant="light" />
          </div>
          <Link
            href={primaryHref}
            className="flex h-10 items-center whitespace-nowrap rounded-full bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-soft"
          >
            {primaryLabel}
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
            className="flex h-10 w-10 items-center justify-center rounded-full text-navy transition-colors hover:bg-surface-soft lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="border-t border-hairline-light bg-white px-4 pb-4 pt-2 lg:hidden">
          <nav className="flex flex-col">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-medium text-ink transition-colors hover:bg-surface-soft"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-hairline-light pt-3">
            <LanguageSwitcher variant="light" />
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-mute-light hover:text-[#1877F2]"
            >
              <FacebookIcon className="h-5 w-5" />
              Facebook
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
