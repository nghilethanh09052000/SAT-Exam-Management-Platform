'use client'

import { useEffect, useRef, useState } from 'react'

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
  'flex h-9 w-9 items-center justify-center rounded-[6px] text-sm font-semibold text-ink transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary'

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
        <div className="flex min-h-14 flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <button type="button" className={BUTTON_CLASS} onClick={() => runHistory('undo')} title="Undo">
            ↶
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => runHistory('redo')} title="Redo">
            ↷
          </button>
          <span className="mx-2 h-8 w-px bg-slate-200" />
          <button type="button" className={BUTTON_CLASS} onClick={() => applyBlock('h3')} title="Heading">
            H
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => run('insertUnorderedList')} title="List">
            ≡
          </button>
          <span className="mx-2 h-8 w-px bg-slate-200" />
          <button type="button" className={BUTTON_CLASS} onClick={() => run('bold')} title="Bold">
            B
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => run('italic')} title="Italic">
            <span className="italic">I</span>
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => run('underline')} title="Underline">
            <span className="underline">U</span>
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => run('strikeThrough')} title="Strikethrough">
            <span className="line-through">S</span>
          </button>
          <span className="mx-2 h-8 w-px bg-slate-200" />
          <button type="button" className={BUTTON_CLASS} onClick={() => run('justifyLeft')} title="Align left">
            ≡
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => run('justifyCenter')} title="Align center">
            ≣
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => run('justifyRight')} title="Align right">
            ≡
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => run('justifyFull')} title="Justify">
            ▤
          </button>
          <span className="mx-2 h-8 w-px bg-slate-200" />
          <button type="button" className={BUTTON_CLASS} onClick={insertImage} title="Insert image">
            ▧
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={insertTable} title="Insert table">
            ⊞
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={insertMathHint} title="Math">
            ⌨
          </button>
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
