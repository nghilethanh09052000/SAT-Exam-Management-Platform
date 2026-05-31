'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { MessageBubble, type AssistantMessage } from './MessageBubble'
import { Composer } from './Composer'
import type { ToolCallEvent } from './ToolCallChip'

interface Props {
  open:             boolean
  onClose:          () => void
  contextClassId?:  string
  contextClassName?: string
  role:             'teacher' | 'admin'
}

type SSEEvent =
  | { type: 'tool_start';  name: string; call_id: string; args: unknown }
  | { type: 'tool_result'; name: string; call_id: string; ok: boolean; summary: string }
  | { type: 'text_delta';  content: string }
  | { type: 'done' }
  | { type: 'error';       message: string }

let _msgId = 0
const nextId = () => `msg-${++_msgId}`

export function AssistantPanel({ open, onClose, contextClassId, contextClassName, role }: Props) {
  const t = useTranslations('assistant')

  const [messages, setMessages]   = useState<AssistantMessage[]>([])
  const [input, setInput]         = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const abortRef      = useRef<AbortController | null>(null)
  const scrollRef     = useRef<HTMLDivElement>(null)
  const inputHistory  = useRef<{ role: string; content: string }[]>([]) // for sending to API (OpenAI format)

  // Greeting on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          id:   nextId(),
          role: 'assistant',
          text: t('greeting'),
        },
      ])
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim()
      if (!text || streaming) return

      setInput('')
      setError(null)

      const userMsg: AssistantMessage = { id: nextId(), role: 'user', text }
      const assistantMsgId = nextId()
      const assistantMsg: AssistantMessage = {
        id:        assistantMsgId,
        role:      'assistant',
        text:      '',
        toolCalls: [],
        streaming: true,
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])

      // Build API message history (OpenAI format, text only)
      inputHistory.current = [
        ...inputHistory.current,
        // Only keep last 20 turns to avoid token overflow
      ].slice(-40)

      const apiMessages = [
        ...inputHistory.current,
        { role: 'user', content: text },
      ]

      setStreaming(true)
      const ctrl = new AbortController()
      abortRef.current = ctrl

      try {
        const resp = await fetch('/api/assistant/chat', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            messages:      apiMessages,
            contextClassId,
          }),
          signal: ctrl.signal,
        })

        if (!resp.ok) {
          const err = await resp.text()
          throw new Error(err || `HTTP ${resp.status}`)
        }

        const reader = resp.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let accumulatedText = ''
        const toolCallMap = new Map<string, ToolCallEvent>()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr) continue

            let event: SSEEvent
            try { event = JSON.parse(jsonStr) } catch { continue }

            if (event.type === 'tool_start') {
              toolCallMap.set(event.call_id, {
                call_id: event.call_id,
                name:    event.name,
                args:    event.args,
                done:    false,
              })
            } else if (event.type === 'tool_result') {
              const existing = toolCallMap.get(event.call_id)
              if (existing) {
                toolCallMap.set(event.call_id, {
                  ...existing,
                  ok:      event.ok,
                  summary: event.summary,
                  done:    true,
                })
              }
            } else if (event.type === 'text_delta') {
              accumulatedText += event.content
            } else if (event.type === 'done' || event.type === 'error') {
              if (event.type === 'error') {
                setError(event.message)
              }
            }

            // Update the assistant message in real-time
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      text:      accumulatedText,
                      toolCalls: Array.from(toolCallMap.values()),
                      streaming: event.type !== 'done' && event.type !== 'error',
                    }
                  : m,
              ),
            )
          }
        }

        // Persist to API history
        inputHistory.current = [
          ...apiMessages,
          { role: 'assistant', content: accumulatedText },
        ]
      } catch (err: any) {
        if (err.name === 'AbortError') return
        setError(err.message ?? 'Unknown error')
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, streaming: false } : m,
          ),
        )
      } finally {
        setStreaming(false)
        abortRef.current = null
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, streaming: false } : m,
          ),
        )
      }
    },
    [input, streaming, contextClassId],
  )

  const stop = () => {
    abortRef.current?.abort()
    setStreaming(false)
  }

  const suggestions = [
    t('suggestions.classSummary'),
    t('suggestions.weakStudents'),
    t('suggestions.questionBank'),
  ]

  if (!open) return null

  return (
    <div
      className="fixed bottom-0 right-4 z-50 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col rounded-t-2xl border border-ash-light bg-white shadow-2xl"
      style={{ height: 'min(680px, calc(100vh - 80px))' }}
      role="dialog"
      aria-label={t('title')}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-ash-light px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <span className="flex-1 font-display font-semibold text-ink">{t('title')}</span>

        {/* Context chip */}
        {contextClassName && (
          <span className="rounded-full border border-ash-light bg-surface-soft px-2 py-0.5 text-xs text-ink-muted">
            {contextClassName}
          </span>
        )}

        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-surface-soft transition-colors"
          aria-label={t('close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3"
        aria-live="polite"
      >
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {error && (
          <div className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
            {t('errorTitle')}: {error}
          </div>
        )}
      </div>

      {/* Composer */}
      <Composer
        value={input}
        onChange={setInput}
        onSend={() => send()}
        onStop={stop}
        streaming={streaming}
        disabled={false}
        suggestions={messages.length <= 1 ? suggestions : undefined}
        onSuggestion={(s) => send(s)}
      />
    </div>
  )
}
