'use client'

import type { ToolCallEvent } from './ToolCallChip'
import type { ActionProposal } from './ActionCard'
import { ActionCard } from './ActionCard'

export type MessageRole = 'user' | 'assistant'

export interface AssistantMessage {
  id:                string
  role:              MessageRole
  text:              string
  toolCalls?:        ToolCallEvent[]
  streaming?:        boolean
  proposal?:         ActionProposal
  proposalExecuted?: boolean
}

interface Props {
  message:   AssistantMessage
  onApprove?: (proposal: ActionProposal) => void
  onCancel?:  () => void
}

// ── Inline renderer (bold, code, emoji passthrough) ───────────────────────────
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <code key={i} className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px] text-ink">
          {part.slice(1, -1)}
        </code>
      )
    return <span key={i}>{part}</span>
  })
}

// ── Block-level markdown renderer ─────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // ── Skip pure horizontal rules / table separators ─────────────────────
    if (/^[-=]{3,}$/.test(line.trim()) || /^\|[-| :]+\|$/.test(line.trim())) {
      i++
      continue
    }

    // ── Headings: ##, ###  ────────────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const content = headingMatch[2]
      const cls = level === 1
        ? 'text-base font-bold text-ink mt-3 mb-1'
        : level === 2
          ? 'text-sm font-bold text-ink mt-2.5 mb-1'
          : 'text-sm font-semibold text-ink-muted mt-2 mb-0.5'
      blocks.push(<p key={key++} className={cls}>{renderInline(content)}</p>)
      i++
      continue
    }

    // ── Table: collect consecutive | lines ────────────────────────────────
    if (line.trimStart().startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }

      // Parse rows (skip separator rows)
      const rows = tableLines
        .filter(l => !/^\|[-| :]+\|/.test(l.trim()))
        .map(l =>
          l.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim())
        )

      if (rows.length === 0) continue

      const [header, ...body] = rows
      blocks.push(
        <div key={key++} className="my-2 overflow-x-auto rounded-lg border border-ash-light text-xs">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-soft">
                {header.map((cell, ci) => (
                  <th key={ci} className="px-3 py-2 text-left font-semibold text-ink border-b border-ash-light whitespace-nowrap">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-surface-soft/40'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-ink border-b border-ash-light/50">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // ── Bullet list: collect consecutive - / • / * lines ─────────────────
    if (/^[\-\*•]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[\-\*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\-\*•]\s/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className="my-1.5 space-y-0.5 pl-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-2 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // ── Numbered list: 1. 2. etc ──────────────────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const items: { n: string; text: string }[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const m = lines[i].match(/^(\d+)\.\s(.*)/)!
        items.push({ n: m[1], text: m[2] })
        i++
      }
      blocks.push(
        <ol key={key++} className="my-1.5 space-y-0.5 pl-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {item.n}
              </span>
              <span>{renderInline(item.text)}</span>
            </li>
          ))}
        </ol>
      )
      continue
    }

    // ── Empty line → spacing ──────────────────────────────────────────────
    if (line.trim() === '') {
      // Only add spacing if previous block wasn't already a spacer
      const last = blocks[blocks.length - 1]
      if (last !== null) blocks.push(<div key={key++} className="h-1" />)
      i++
      continue
    }

    // ── Normal paragraph line ─────────────────────────────────────────────
    blocks.push(
      <p key={key++} className="text-sm leading-relaxed">
        {renderInline(line)}
      </p>
    )
    i++
  }

  return <div className="space-y-0.5">{blocks}</div>
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MessageBubble({ message, onApprove, onCancel }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start w-full'}`}>
      {/* Text bubble */}
      {(message.text || message.streaming) && (
        <div
          className={[
            'rounded-2xl px-4 py-3',
            isUser
              ? 'max-w-[85%] bg-primary text-white rounded-tr-sm text-sm leading-relaxed'
              : 'w-full max-w-[96%] bg-surface-card border border-ash-light text-ink rounded-tl-sm',
          ].join(' ')}
        >
          {message.text ? (
            isUser
              ? <span>{renderInline(message.text)}</span>
              : renderMarkdown(message.text)
          ) : (
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
            </span>
          )}
        </div>
      )}

      {/* Action proposal confirm card */}
      {!isUser && message.proposal && (
        <div className="w-full max-w-[96%]">
          <ActionCard
            proposal={message.proposal}
            executed={message.proposalExecuted ?? false}
            onApprove={onApprove ?? (() => {})}
            onCancel={onCancel ?? (() => {})}
          />
        </div>
      )}
    </div>
  )
}
