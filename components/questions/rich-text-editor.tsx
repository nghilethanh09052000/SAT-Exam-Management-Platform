'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface RichTextEditorProps {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
  minHeight?: number
}

type Command =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'insertUnorderedList'
  | 'justifyLeft'
  | 'justifyCenter'
  | 'justifyRight'
  | 'justifyFull'

const BUTTON_CLASS =
  'flex h-9 w-9 items-center justify-center rounded-[6px] text-[15px] font-bold text-slate-700 transition-colors hover:bg-white hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-primary'

function ToolbarDivider() {
  return <span className="mx-2 h-8 w-px bg-slate-200" />
}

function ToolbarButton({
  title,
  onClick,
  children,
  activeTone = false,
}: {
  title: string
  onClick: () => void
  children: ReactNode
  activeTone?: boolean
}) {
  return (
    <button
      type="button"
      className={[
        BUTTON_CLASS,
        activeTone ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : '',
      ].join(' ')}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  )
}

function sanitizeHtml(html: string) {
  if (typeof window === 'undefined') return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((node) => node.remove())

  doc.body.querySelectorAll('*').forEach((node) => {
    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      if (name.startsWith('on') || value.startsWith('javascript:')) {
        node.removeAttribute(attr.name)
      }
    })
  })

  return doc.body.innerHTML
}

function isEmptyHtml(html: string) {
  if (typeof window === 'undefined') return !html.trim()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return !doc.body.textContent?.trim() && doc.body.querySelectorAll('img, table').length === 0
}

export function getEditorText(html: string) {
  if (typeof window === 'undefined') return html.replace(/<[^>]+>/g, '').trim()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent?.trim() ?? ''
}

export function cleanEditorHtml(html: string) {
  const cleaned = sanitizeHtml(html)
  return isEmptyHtml(cleaned) ? '' : cleaned
}

export function RichTextEditor({
  label,
  value,
  onChange,
  required = false,
  placeholder,
  minHeight = 210,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || focused) return
    if (editor.innerHTML !== value) editor.innerHTML = value
  }, [focused, value])

  function emitChange() {
    const editor = editorRef.current
    if (!editor) return
    onChange(cleanEditorHtml(editor.innerHTML))
  }

  function run(command: Command, argument?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, argument)
    emitChange()
  }

  function runHistory(command: 'undo' | 'redo') {
    editorRef.current?.focus()
    document.execCommand(command)
    emitChange()
  }

  function applyBlock(block: string) {
    editorRef.current?.focus()
    document.execCommand('formatBlock', false, block)
    emitChange()
  }

  function insertImage() {
    const url = window.prompt('Image URL')
    if (!url?.trim()) return
    editorRef.current?.focus()
    document.execCommand('insertImage', false, url.trim())
    emitChange()
  }

  function insertTable() {
    editorRef.current?.focus()
    document.execCommand(
      'insertHTML',
      false,
      '<table><tbody><tr><td> </td><td> </td></tr><tr><td> </td><td> </td></tr></tbody></table>'
    )
    emitChange()
  }

  function insertMathHint() {
    editorRef.current?.focus()
    document.execCommand('insertText', false, ' $x$ ')
    emitChange()
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-ink">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="overflow-hidden rounded-[8px] border border-slate-200 bg-slate-50">
        <div className="flex min-h-14 flex-wrap items-center gap-1 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-blue-50/50 to-violet-50/50 px-3 py-2">
          <ToolbarButton title="Undo" onClick={() => runHistory('undo')}>
            ↶
          </ToolbarButton>
          <ToolbarButton title="Redo" onClick={() => runHistory('redo')}>
            ↷
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton title="Heading" onClick={() => applyBlock('h3')} activeTone>
            H
          </ToolbarButton>
          <ToolbarButton title="List" onClick={() => run('insertUnorderedList')}>
            ☰
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton title="Bold" onClick={() => run('bold')}>
            B
          </ToolbarButton>
          <ToolbarButton title="Italic" onClick={() => run('italic')}>
            <span className="italic">I</span>
          </ToolbarButton>
          <ToolbarButton title="Underline" onClick={() => run('underline')}>
            <span className="underline">U</span>
          </ToolbarButton>
          <ToolbarButton title="Strikethrough" onClick={() => run('strikeThrough')}>
            <span className="line-through">S</span>
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton title="Align left" onClick={() => run('justifyLeft')}>
            ⬅
          </ToolbarButton>
          <ToolbarButton title="Align center" onClick={() => run('justifyCenter')}>
            ↔
          </ToolbarButton>
          <ToolbarButton title="Align right" onClick={() => run('justifyRight')}>
            ➡
          </ToolbarButton>
          <ToolbarButton title="Justify" onClick={() => run('justifyFull')}>
            ▤
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton title="Insert image" onClick={insertImage}>
            ◫
          </ToolbarButton>
          <ToolbarButton title="Insert table" onClick={insertTable}>
            ⊞
          </ToolbarButton>
          <ToolbarButton title="Math" onClick={insertMathHint}>
            ƒx
          </ToolbarButton>
        </div>
        <div className="relative bg-slate-50">
          {isEmptyHtml(value) && !focused && placeholder && (
            <p className="pointer-events-none absolute left-4 top-4 text-sm text-slate-400">{placeholder}</p>
          )}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false)
              emitChange()
            }}
            onInput={emitChange}
            className="prose prose-sm max-w-none overflow-auto px-4 py-4 text-base leading-7 text-ink outline-none [&_img]:max-w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2"
            style={{ minHeight }}
          />
        </div>
      </div>
    </div>
  )
}
