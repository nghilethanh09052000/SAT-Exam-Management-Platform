'use client'

import type { ToolCallEvent } from './ToolCallChip'

export type MessageRole = 'user' | 'assistant'

export interface AssistantMessage {
  id:         string
  role:       MessageRole
  text:       string
  toolCalls?: ToolCallEvent[]
  streaming?: boolean
}

interface Props {
  message: AssistantMessage
}

// Simple markdown-ish renderer: bold, inline code, line-breaks
// We keep it dependency-free to avoid bundle bloat
function renderText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\$[^$]+\$)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-surface-soft px-1 py-0.5 font-mono text-xs">
          {part.slice(1, -1)}
        </code>
      )
    }
    // Preserve newlines
    return part.split('\n').map((line, j, arr) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </span>
    ))
  })
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Text bubble */}
      {(message.text || message.streaming) && (
        <div
          className={[
            'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-white rounded-tr-sm'
              : 'bg-surface-card border border-ash-light text-ink rounded-tl-sm',
          ].join(' ')}
        >
          {message.text ? (
            <span>{renderText(message.text)}</span>
          ) : (
            // Streaming placeholder
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
            </span>
          )}
        </div>
      )}
    </div>
  )
}
