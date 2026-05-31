'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { MessageBubble, type AssistantMessage } from './MessageBubble'
import { Composer } from './Composer'
import type { ActionProposal } from './ActionCard'

interface Props {
  open:              boolean
  onClose:           () => void
  contextClassId?:   string
  contextClassName?: string
  role:              'teacher' | 'admin'
}

type SSEEvent =
  | { type: 'text_delta';      content: string }
  | { type: 'action_proposal'; title: string; steps: ActionProposal['steps'] }
  | { type: 'done' }
  | { type: 'error';           message: string }

let _msgId = 0
const nextId = () => `msg-${++_msgId}`

export function AssistantPanel({ open, onClose, contextClassId, contextClassName, role }: Props) {
  const t = useTranslations('assistant')

  const [messages, setMessages]   = useState<AssistantMessage[]>([])
  const [input, setInput]         = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const abortRef     = useRef<AbortController | null>(null)
  const scrollRef    = useRef<HTMLDivElement>(null)
  const historyRef   = useRef<{ role: string; content: string }[]>([])

  // Greeting on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ id: nextId(), role: 'assistant', text: t('greeting') }])
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // ── Core send ─────────────────────────────────────────────────────────────
  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim()
      if (!text || streaming) return

      setInput('')
      setError(null)

      const userMsg: AssistantMessage  = { id: nextId(), role: 'user', text }
      const aId = nextId()
      const assistantMsg: AssistantMessage = {
        id: aId, role: 'assistant', text: '', streaming: true,
      }
      setMessages(prev => [...prev, userMsg, assistantMsg])

      const apiMessages = [...historyRef.current, { role: 'user', content: text }]

      setStreaming(true)
      const ctrl = new AbortController()
      abortRef.current = ctrl

      try {
        const resp = await fetch('/api/assistant/chat', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ messages: apiMessages, contextClassId }),
          signal:  ctrl.signal,
        })

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

        const reader  = resp.body!.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let accText = ''
        let proposal: ActionProposal | undefined

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const js = line.slice(6).trim()
            if (!js) continue
            let ev: SSEEvent
            try { ev = JSON.parse(js) } catch { continue }

            if (ev.type === 'text_delta') {
              accText += ev.content
            } else if (ev.type === 'action_proposal') {
              proposal = { title: ev.title, steps: ev.steps }
            } else if (ev.type === 'error') {
              setError(ev.message)
            }

            setMessages(prev => prev.map(m =>
              m.id === aId
                ? {
                    ...m,
                    text:      accText,
                    proposal,
                    streaming: ev.type !== 'done' && ev.type !== 'error',
                  }
                : m
            ))
          }
        }

        historyRef.current = [...apiMessages, { role: 'assistant', content: accText }]
      } catch (err: any) {
        if (err.name !== 'AbortError') setError(err.message ?? 'Unknown error')
      } finally {
        setStreaming(false)
        abortRef.current = null
        setMessages(prev => prev.map(m =>
          m.id === aId ? { ...m, streaming: false } : m
        ))
      }
    },
    [input, streaming, contextClassId],
  )

  // ── Approve proposal → send each step as a confirmation ──────────────────
  const handleApprove = useCallback((proposal: ActionProposal, msgId: string) => {
    // Mark proposal as executed in the message
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, proposalExecuted: true } : m
    ))
    // Send confirmation message — ask AI to execute steps in order, chaining IDs
    const confirmText =
      `[XÁC NHẬN] Người dùng đã xác nhận kế hoạch: "${proposal.title}". ` +
      `Hãy thực hiện ngay từng bước theo thứ tự. ` +
      `QUAN TRỌNG: dùng ID thực từ kết quả của mỗi bước để truyền vào bước tiếp theo ` +
      `(ví dụ: dùng course_id từ create_course cho create_class). ` +
      `Kế hoạch gốc: ` +
      proposal.steps.map(s =>
        `Bước ${s.step} (${s.tool}): ${s.description}`
      ).join(' → ')
    send(confirmText)
  }, [send])

  // ── Cancel proposal ───────────────────────────────────────────────────────
  const handleCancel = useCallback((msgId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, proposal: undefined } : m
    ))
  }, [])

  const suggestions = [
    t('suggestions.classSummary'),
    t('suggestions.weakStudents'),
    t('suggestions.createCourse'),
    t('suggestions.setupMockTest'),
  ]

  if (!open) return null

  return (
    <div
      className="fixed bottom-0 right-4 z-50 flex w-[440px] max-w-[calc(100vw-2rem)] flex-col rounded-t-2xl border border-ash-light bg-white shadow-2xl"
      style={{ height: 'min(700px, calc(100vh - 80px))' }}
      role="dialog"
      aria-label={t('title')}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-ash-light px-4 py-3 shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <span className="flex-1 font-display font-semibold text-ink">{t('title')}</span>
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

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3"
        aria-live="polite"
      >
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onApprove={msg.proposal ? (p) => handleApprove(p, msg.id) : undefined}
            onCancel={msg.proposal ? () => handleCancel(msg.id) : undefined}
          />
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
        onStop={() => { abortRef.current?.abort(); setStreaming(false) }}
        streaming={streaming}
        disabled={false}
        suggestions={messages.length <= 1 ? suggestions : undefined}
        onSuggestion={send}
      />
    </div>
  )
}
