'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { routing } from '@/i18n/routing'

interface LanguageSwitcherProps {
  variant?: 'dark' | 'light'
  className?: string
}

export function LanguageSwitcher({ variant = 'dark', className = '' }: LanguageSwitcherProps) {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  function switchLocale(newLocale: string) {
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`)
    router.push(newPath)
    router.refresh()
  }

  return (
    <div className={`flex items-center gap-1 rounded-full p-0.5 ${variant === 'dark' ? 'bg-white/5' : 'bg-slate-100'} ${className}`}>
      {routing.locales.map((loc) => {
        const active = locale === loc
        return (
          <button
            key={loc}
            onClick={() => switchLocale(loc)}
            disabled={active}
            className={[
              'rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-widest transition-all duration-200',
              active
                ? variant === 'dark'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-500/30'
                  : 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                : variant === 'dark'
                  ? 'text-white/40 hover:text-white/70 hover:bg-white/8'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-white',
            ].join(' ')}
          >
            {loc}
          </button>
        )
      })}
    </div>
  )
}
