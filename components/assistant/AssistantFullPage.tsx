'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import { MessageBubble, type AssistantMessage } from './MessageBubble'
import { Composer } from './Composer'
import type { ActionProposal } from './ActionCard'
import { useTranslations } from 'next-intl'

interface Props {
  role:     'teacher' | 'admin'
  title:    string
  subtitle: string
}

type SSEEvent =
  | { type: 'text_delta';      content: string }
  | { type: 'action_proposal'; title: string; steps: ActionProposal['steps'] }
  | { type: 'done' }
  | { type: 'error';           message: string }

let _id = 0
const nextId = () => `msg-${++_id}`

export function AssistantFullPage({ role, title, subtitle }: Props) {
  const t = useTranslations('assistant')
  const [messages, setMessages]   = useState<AssistantMessage[]>([])
  const [input, setInput]         = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const abortRef   = useRef<AbortController | null>(null)
  const scrollRef  = useRef<HTMLDivElement>(null)
  const historyRef = useRef<{ role: string; content: string }[]>([])

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ id: nextId(), role: 'assistant', text: t('greeting') }])
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      const aId = nextId()
      const assistantMsg: AssistantMessage = { id: aId, role: 'assistant', text: '', toolCalls: [], streaming: true }
      setMessages((p) => [...p, userMsg, assistantMsg])

      const apiMessages = [...historyRef.current, { role: 'user', content: text }]

      setStreaming(true)
      const ctrl = new AbortController()
      abortRef.current = ctrl

      try {
        const resp = await fetch('/api/assistant/chat', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ messages: apiMessages }),
          signal:  ctrl.signal,
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

        const reader = resp.body!.getReader()
        const dec = new TextDecoder()
        let buf = ''
        let accText = ''
        let proposal: ActionProposal | undefined

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
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

            setMessages((p) => p.map((m) =>
              m.id === aId
                ? { ...m, text: accText, proposal, streaming: ev.type !== 'done' && ev.type !== 'error' }
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
        setMessages((p) => p.map((m) => m.id === aId ? { ...m, streaming: false } : m))
      }
    },
    [input, streaming],
  )

  const suggestions = [t('suggestions.classSummary'), t('suggestions.weakStudents'), t('suggestions.createCourse'), t('suggestions.setupMockTest')]

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col rounded-2xl border border-ash-light bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-ash-light px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h1 className="font-display font-semibold text-ink">{title}</h1>
          <p className="text-sm text-ink-muted">{subtitle}</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-3" aria-live="polite">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onApprove={m.proposal ? (p) => {
              setMessages(prev => prev.map(x => x.id === m.id ? { ...x, proposalExecuted: true } : x))
              const confirmText =
                `[XÁC NHẬN] Người dùng đã xác nhận kế hoạch: "${p.title}". ` +
                `Hãy thực hiện ngay từng bước theo thứ tự. ` +
                `QUAN TRỌNG: dùng ID thực từ kết quả của mỗi bước để truyền vào bước tiếp theo ` +
                `(ví dụ: dùng course_id từ create_course cho create_class). ` +
                `Kế hoạch: ` +
                p.steps.map(s => `Bước ${s.step} (${s.tool}): ${s.description}`).join(' → ')
              send(confirmText)
            } : undefined}
            onCancel={m.proposal ? () => setMessages(prev => prev.map(x => x.id === m.id ? { ...x, proposal: undefined } : x)) : undefined}
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
