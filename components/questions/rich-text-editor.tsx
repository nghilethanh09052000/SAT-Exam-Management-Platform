'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode, type KeyboardEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ImageIcon,
  Italic,
  Keyboard,
  List,
  ListOrdered,
  Palette,
  Redo2,
  Strikethrough,
  Table2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { MathKeyboard, useMathKeyboard } from '@/components/ui/math-keyboard'

// ─── Preset colors ────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#ffffff',
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface RichTextEditorProps {
  label: string | ReactNode
  value: string
  onChange: (value: string) => void
  onUploadImage?: (file: File) => Promise<string>
  required?: boolean
  placeholder?: string
  minHeight?: number
}

type ToolbarButtonProps = {
  title: string
  onClick: () => void
  children: ReactNode
  active?: boolean
  disabled?: boolean
  className?: string
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const BUTTON_BASE =
  'flex h-9 items-center justify-center rounded-[6px] text-slate-700 transition-colors hover:bg-slate-100 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50'

function ToolbarDivider() {
  return <span className="mx-1 h-8 w-px bg-slate-200" />
}

function ToolbarButton({ title, onClick, children, active = false, disabled = false, className = 'w-9' }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={[BUTTON_BASE, className, active ? 'bg-blue-50 text-blue-600' : ''].join(' ')}
      onClick={onClick}
      disabled={disabled}
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
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((n) => n.remove())
  doc.body.querySelectorAll('*').forEach((node) => {
    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      if (name.startsWith('on') || value.startsWith('javascript:')) node.removeAttribute(attr.name)
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

// ─── usePopover helper ────────────────────────────────────────────────────────
// Closes the popover when clicking outside the ref element.
function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  return { open, setOpen, ref }
}

// ─── Component ────────────────────────────────────────────────────────────────

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const
type HeadingLevel = (typeof HEADING_LEVELS)[number]

export function RichTextEditor({
  label,
  value,
  onChange,
  onUploadImage,
  required = false,
  placeholder,
  minHeight = 210,
}: RichTextEditorProps) {
  const t = useTranslations('richTextEditor')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  const heading  = usePopover()
  const table    = usePopover()
  const color    = usePopover()

  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const { showKeyboard, openKeyboard, closeKeyboard } = useMathKeyboard()

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [...HEADING_LEVELS] } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Image.configure({ allowBase64: false, inline: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none px-4 py-3 text-base leading-7 text-ink outline-none ' +
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 ' +
          '[&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-semibold ' +
          '[&_h4]:text-base [&_h4]:font-semibold [&_h5]:text-sm [&_h5]:font-semibold [&_h6]:text-xs [&_h6]:font-semibold ' +
          '[&_img]:max-w-full [&_img]:rounded-[4px] ' +
          '[&_table]:my-0 [&_table]:border-collapse [&_table]:text-base ' +
          '[&_td]:border [&_td]:border-slate-800 [&_td]:px-2 [&_td]:py-1 ' +
          '[&_th]:border [&_th]:border-slate-800 [&_th]:px-2 [&_th]:py-1',
      },
    },
    onUpdate: ({ editor: e }) => onChange(cleanEditorHtml(e.getHTML())),
  })

  useEffect(() => {
    if (!editor) return
    const cur  = cleanEditorHtml(editor.getHTML())
    const next = cleanEditorHtml(value)
    if (cur !== next) editor.commands.setContent(value || '', { emitUpdate: false })
  }, [editor, value])

  // ── Image ──────────────────────────────────────────────────────────────────

  function insertImageUrl(url: string) {
    editor?.chain().focus().setImage({ src: url }).run()
  }

  function insertImage() {
    if (!editor) return
    if (onUploadImage) { fileInputRef.current?.click(); return }
    const url = window.prompt(t('imageUrlPrompt'))
    if (url?.trim()) insertImageUrl(url.trim())
  }

  async function handleImageFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onUploadImage) return
    setUploadingImage(true)
    try {
      insertImageUrl(await onUploadImage(file))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('imageUploadError'))
    } finally {
      setUploadingImage(false)
    }
  }

  // ── Table ──────────────────────────────────────────────────────────────────

  function insertTable() {
    editor?.chain().focus()
      .insertTable({ rows: Math.max(1, Math.min(20, tableRows)), cols: Math.max(1, Math.min(20, tableCols)), withHeaderRow: false })
      .run()
    table.setOpen(false)
  }

  // ── Math ───────────────────────────────────────────────────────────────────

  function insertMathHint() { editor?.chain().focus().insertContent(' $x$ ').run() }

  const insertMathText = useCallback((text: string) => {
    editor?.chain().focus().insertContent(text).run()
  }, [editor])

  const deleteMathChar = useCallback(() => {
    if (!editor) return
    const { state, view } = editor
    const { from, empty } = state.selection
    if (empty && from > 1) { view.dispatch(state.tr.delete(from - 1, from)); return }
    editor.chain().focus().deleteSelection().run()
  }, [editor])

  // ── Heading label ──────────────────────────────────────────────────────────

  const activeHeading = HEADING_LEVELS.find((l) => editor?.isActive('heading', { level: l }))

  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-ink">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        <div className="overflow-hidden rounded-[8px] border border-slate-200 bg-slate-50">
          {/* ── Toolbar ─────────────────────────────────────────────────────── */}
          <div className="flex min-h-14 flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-3 py-2">

            {/* Undo / Redo */}
            <ToolbarButton title={t('undo')} onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()}>
              <Undo2 size={16} />
            </ToolbarButton>
            <ToolbarButton title={t('redo')} onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()}>
              <Redo2 size={16} />
            </ToolbarButton>

            <ToolbarDivider />

            {/* ── Heading dropdown ──────────────────────────────────────────── */}
            <div className="relative" ref={heading.ref}>
              <button
                type="button"
                title={t('heading')}
                onClick={() => heading.setOpen((v) => !v)}
                disabled={!editor}
                className={[
                  BUTTON_BASE,
                  'gap-0.5 px-2 w-auto',
                  activeHeading ? 'bg-blue-50 text-blue-600' : '',
                ].join(' ')}
              >
                <span className="text-sm font-bold text-blue-600">
                  {activeHeading ? `H${activeHeading}` : 'H'}
                </span>
                <ChevronDown size={12} className="text-slate-400" />
              </button>

              {heading.open && (
                <div className="absolute left-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  {/* Normal text */}
                  <button
                    type="button"
                    onClick={() => { editor?.chain().focus().setParagraph().run(); heading.setOpen(false) }}
                    className={[
                      'w-full px-4 py-2 text-left text-sm transition-colors hover:bg-slate-50',
                      !activeHeading ? 'bg-blue-50 font-semibold text-blue-600' : 'text-slate-700',
                    ].join(' ')}
                  >
                    {t('headingNormal')}
                  </button>
                  {HEADING_LEVELS.map((level) => {
                    const sizes: Record<HeadingLevel, string> = {
                      1: 'text-xl font-bold',
                      2: 'text-lg font-bold',
                      3: 'text-base font-semibold',
                      4: 'text-sm font-semibold',
                      5: 'text-xs font-semibold',
                      6: 'text-xs font-medium',
                    }
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => {
                          editor?.chain().focus().toggleHeading({ level }).run()
                          heading.setOpen(false)
                        }}
                        className={[
                          'w-full px-4 py-2 text-left transition-colors hover:bg-slate-50',
                          sizes[level],
                          editor?.isActive('heading', { level }) ? 'bg-blue-50 text-blue-600' : 'text-slate-800',
                        ].join(' ')}
                      >
                        {t('headingLevel', { n: level })}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Lists */}
            <ToolbarButton title={t('list')} onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive('bulletList')}>
              <List size={16} />
            </ToolbarButton>
            <ToolbarButton title={t('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive('orderedList')}>
              <ListOrdered size={16} />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Format */}
            <ToolbarButton title={t('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive('bold')}>
              <Bold size={16} />
            </ToolbarButton>
            <ToolbarButton title={t('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')}>
              <Italic size={16} />
            </ToolbarButton>
            <ToolbarButton title={t('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} active={editor?.isActive('underline')}>
              <UnderlineIcon size={16} />
            </ToolbarButton>
            <ToolbarButton title={t('strikethrough')} onClick={() => editor?.chain().focus().toggleStrike().run()} active={editor?.isActive('strike')}>
              <Strikethrough size={16} />
            </ToolbarButton>

            {/* ── Color picker ──────────────────────────────────────────────── */}
            <div className="relative" ref={color.ref}>
              <button
                type="button"
                title={t('textColor')}
                onClick={() => color.setOpen((v) => !v)}
                disabled={!editor}
                className={[BUTTON_BASE, 'w-9 flex-col gap-0', color.open ? 'bg-blue-50' : ''].join(' ')}
              >
                <Palette size={15} />
                {/* colour swatch under the icon */}
                <span
                  className="mt-0.5 h-1 w-5 rounded-sm"
                  style={{ backgroundColor: (editor?.getAttributes('textStyle').color as string | undefined) ?? '#000000' }}
                />
              </button>

              {color.open && (
                <div className="absolute left-0 top-full z-50 mt-1.5 w-48 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                  {/* Preset swatches */}
                  <div className="grid grid-cols-5 gap-1.5 mb-3">
                    {PRESET_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        title={hex}
                        onClick={() => { editor?.chain().focus().setColor(hex).run() }}
                        className="h-7 w-7 rounded-md border border-slate-200 transition-transform hover:scale-110 active:scale-95"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  {/* Remove colour */}
                  <button
                    type="button"
                    onClick={() => { editor?.chain().focus().unsetColor().run(); color.setOpen(false) }}
                    className="w-full rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {t('removeColor')}
                  </button>
                </div>
              )}
            </div>

            <ToolbarDivider />

            {/* Alignment */}
            <ToolbarButton title={t('alignLeft')} onClick={() => editor?.chain().focus().setTextAlign('left').run()} active={editor?.isActive({ textAlign: 'left' })}>
              <AlignLeft size={16} />
            </ToolbarButton>
            <ToolbarButton title={t('alignCenter')} onClick={() => editor?.chain().focus().setTextAlign('center').run()} active={editor?.isActive({ textAlign: 'center' })}>
              <AlignCenter size={16} />
            </ToolbarButton>
            <ToolbarButton title={t('alignRight')} onClick={() => editor?.chain().focus().setTextAlign('right').run()} active={editor?.isActive({ textAlign: 'right' })}>
              <AlignRight size={16} />
            </ToolbarButton>
            <ToolbarButton title={t('justify')} onClick={() => editor?.chain().focus().setTextAlign('justify').run()} active={editor?.isActive({ textAlign: 'justify' })}>
              <AlignJustify size={16} />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Image */}
            <ToolbarButton title={uploadingImage ? t('uploadingImage') : t('insertImage')} onClick={insertImage} disabled={!editor || uploadingImage}>
              <ImageIcon size={17} />
            </ToolbarButton>
            {onUploadImage && (
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleImageFileChange} />
            )}

            {/* ── Table button + dialog ──────────────────────────────────────── */}
            <div className="relative" ref={table.ref}>
              <ToolbarButton title={t('insertTable')} onClick={() => table.setOpen((v) => !v)} active={table.open} disabled={!editor}>
                <Table2 size={17} />
              </ToolbarButton>

              {table.open && (
                <div className="absolute left-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label className="text-sm font-medium text-slate-700">{t('tableRows')}</label>
                    <input
                      type="number" min={1} max={20} value={tableRows}
                      onChange={(e) => setTableRows(Number(e.target.value))}
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && insertTable()}
                      className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      autoFocus
                    />
                  </div>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <label className="text-sm font-medium text-slate-700">{t('tableCols')}</label>
                    <input
                      type="number" min={1} max={20} value={tableCols}
                      onChange={(e) => setTableCols(Number(e.target.value))}
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && insertTable()}
                      className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <button type="button" onClick={insertTable} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                    {t('tableOk')}
                  </button>
                </div>
              )}
            </div>

            {/* Math */}
            <ToolbarButton title={t('math')} onClick={insertMathHint} disabled={!editor}>
              <span className="text-base font-bold italic">fx</span>
            </ToolbarButton>
            <ToolbarButton title={t('mathKeyboard')} onClick={() => showKeyboard ? closeKeyboard() : openKeyboard()} active={showKeyboard}>
              <Keyboard size={16} />
            </ToolbarButton>
          </div>

          {/* ── Editor area ─────────────────────────────────────────────────── */}
          <div className="relative bg-slate-50">
            {(!value || isEmptyHtml(value)) && placeholder && (
              <p className="pointer-events-none absolute left-4 top-4 text-sm text-slate-400">{placeholder}</p>
            )}
            <EditorContent editor={editor} className="overflow-auto [&_.ProseMirror]:min-h-[inherit]" style={{ minHeight }} />
          </div>
        </div>
      </div>

      {showKeyboard && (
        <MathKeyboard onInsert={insertMathText} onDelete={deleteMathChar} onClose={closeKeyboard} />
      )}
    </>
  )
}
