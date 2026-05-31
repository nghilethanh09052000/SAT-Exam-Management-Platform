'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AssistantPanel } from './AssistantPanel'

interface Props {
  role:              'teacher' | 'admin'
  contextClassId?:   string
  contextClassName?: string
}

export function AssistantLauncher({ role, contextClassId, contextClassName }: Props) {
  const t    = useTranslations('assistant')
  const [open, setOpen] = useState(false)

  // Feature flag check (set NEXT_PUBLIC_ASSISTANT_ENABLED=true to show)
  if (process.env.NEXT_PUBLIC_ASSISTANT_ENABLED !== 'true') return null

  return (
    <>
      {/* Floating action button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 active:scale-95 transition-all"
          aria-label={t('open')}
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">{t('title')}</span>
        </button>
      )}

      {/* Panel */}
      <AssistantPanel
        open={open}
        onClose={() => setOpen(false)}
        role={role}
        contextClassId={contextClassId}
        contextClassName={contextClassName}
      />
    </>
  )
}
