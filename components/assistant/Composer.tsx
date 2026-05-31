'use client'

import { useRef, useEffect } from 'react'
import { Send, Square } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Props {
  value:        string
  onChange:     (v: string) => void
  onSend:       () => void
  onStop:       () => void
  streaming:    boolean
  disabled:     boolean
  suggestions?: string[]
  onSuggestion: (s: string) => void
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  suggestions,
  onSuggestion,
}: Props) {
  const t = useTranslations('assistant')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!streaming && value.trim()) onSend()
    }
  }

  return (
    <div className="border-t border-ash-light bg-surface-card px-3 py-2.5">
      {/* Suggestion chips */}
      {suggestions && suggestions.length > 0 && !streaming && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onSuggestion(s)}
              className="rounded-full border border-ash-light bg-white px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-soft hover:text-ink transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('placeholder')}
          disabled={disabled}
          className="flex-1 resize-none rounded-xl border border-ash-light bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 transition-shadow"
          style={{ minHeight: '40px', maxHeight: '160px' }}
        />

        {streaming ? (
          <button
            onClick={onStop}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning text-white hover:opacity-90 transition-opacity"
            title={t('stop')}
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={disabled || !value.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
            title={t('send')}
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
