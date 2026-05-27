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
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ImageIcon,
  Italic,
  Keyboard,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Table2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { MathKeyboard, useMathKeyboard } from '@/components/ui/math-keyboard'

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
}

const BUTTON_CLASS =
  'flex h-9 w-9 items-center justify-center rounded-[6px] text-slate-700 transition-colors hover:bg-slate-100 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50'

function ToolbarDivider() {
  return <span className="mx-1 h-8 w-px bg-slate-200" />
}

function ToolbarButton({ title, onClick, children, active = false, disabled = false }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={[BUTTON_CLASS, active ? 'bg-blue-50 text-blue-600' : ''].join(' ')}
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
  onUploadImage,
  required = false,
  placeholder,
  minHeight = 210,
}: RichTextEditorProps) {
  const t = useTranslations('richTextEditor')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tableDialogRef = useRef<HTMLDivElement>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const { showKeyboard, openKeyboard, closeKeyboard } = useMathKeyboard()

  // Close the table dialog when clicking outside it
  useEffect(() => {
    if (!showTableDialog) return
    function onMouseDown(e: MouseEvent) {
      if (tableDialogRef.current && !tableDialogRef.current.contains(e.target as Node)) {
        setShowTableDialog(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [showTableDialog])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Image.configure({
        allowBase64: false,
        inline: false,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none px-4 py-3 text-base leading-7 text-ink outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_img]:max-w-full [&_img]:rounded-[4px] [&_table]:my-0 [&_table]:border-collapse [&_table]:text-base [&_td]:border [&_td]:border-slate-800 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-800 [&_th]:px-2 [&_th]:py-1',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(cleanEditorHtml(currentEditor.getHTML()))
    },
  })

  useEffect(() => {
    if (!editor) return
    const currentValue = cleanEditorHtml(editor.getHTML())
    const nextValue = cleanEditorHtml(value)
    if (currentValue !== nextValue) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [editor, value])

  function insertImageUrl(url: string) {
    editor?.chain().focus().setImage({ src: url }).run()
  }

  function insertImage() {
    if (!editor) return

    if (onUploadImage) {
      fileInputRef.current?.click()
      return
    }

    const url = window.prompt(t('imageUrlPrompt'))
    if (!url?.trim()) return
    insertImageUrl(url.trim())
  }

  async function handleImageFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onUploadImage) return

    setUploadingImage(true)
    try {
      const url = await onUploadImage(file)
      insertImageUrl(url)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t('imageUploadError'))
    } finally {
      setUploadingImage(false)
    }
  }

  function insertTable() {
    const rows = Math.max(1, Math.min(20, tableRows))
    const cols = Math.max(1, Math.min(20, tableCols))
    editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run()
    setShowTableDialog(false)
  }

  function insertMathHint() {
    editor?.chain().focus().insertContent(' $x$ ').run()
  }

  const insertMathText = useCallback((text: string) => {
    editor?.chain().focus().insertContent(text).run()
  }, [editor])

  const deleteMathChar = useCallback(() => {
    if (!editor) return
    const { state, view } = editor
    const { from, empty } = state.selection

    if (empty && from > 1) {
      view.dispatch(state.tr.delete(from - 1, from))
      return
    }

    editor.chain().focus().deleteSelection().run()
  }, [editor])

  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-ink">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="overflow-hidden rounded-[8px] border border-slate-200 bg-slate-50">
          <div className="flex min-h-14 flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-3 py-2">
            <ToolbarButton title={t('undo')} onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()}>
              <Undo2 size={16} />
            </ToolbarButton>
            <ToolbarButton title={t('redo')} onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()}>
              <Redo2 size={16} />
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton
              title={t('heading')}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
              active={editor?.isActive('heading', { level: 3 })}
            >
              <span className="text-sm font-semibold text-blue-600">H</span>
            </ToolbarButton>
            <ToolbarButton
              title={t('list')}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              active={editor?.isActive('bulletList')}
            >
              <List size={16} />
            </ToolbarButton>
            <ToolbarButton
              title={t('orderedList')}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              active={editor?.isActive('orderedList')}
            >
              <ListOrdered size={16} />
            </ToolbarButton>
            <ToolbarDivider />
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
            <ToolbarDivider />
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
            <ToolbarButton title={uploadingImage ? t('uploadingImage') : t('insertImage')} onClick={insertImage} disabled={!editor || uploadingImage}>
              <ImageIcon size={17} />
            </ToolbarButton>
            {onUploadImage && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={handleImageFileChange}
              />
            )}
            {/* Table button + dialog */}
            <div className="relative" ref={tableDialogRef}>
              <ToolbarButton
                title={t('insertTable')}
                onClick={() => setShowTableDialog((v) => !v)}
                active={showTableDialog}
                disabled={!editor}
              >
                <Table2 size={17} />
              </ToolbarButton>

              {showTableDialog && (
                <div className="absolute left-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                  {/* Rows */}
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label className="text-sm font-medium text-slate-700">{t('tableRows')}</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={tableRows}
                      onChange={(e) => setTableRows(Number(e.target.value))}
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && insertTable()}
                      className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      autoFocus
                    />
                  </div>
                  {/* Cols */}
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <label className="text-sm font-medium text-slate-700">{t('tableCols')}</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={tableCols}
                      onChange={(e) => setTableCols(Number(e.target.value))}
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && insertTable()}
                      className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={insertTable}
                    className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
                  >
                    {t('tableOk')}
                  </button>
                </div>
              )}
            </div>
            <ToolbarButton title={t('math')} onClick={insertMathHint} disabled={!editor}>
              <span className="text-base font-bold italic">fx</span>
            </ToolbarButton>
            <ToolbarButton
              title={t('mathKeyboard')}
              onClick={() => showKeyboard ? closeKeyboard() : openKeyboard()}
              active={showKeyboard}
            >
              <Keyboard size={16} />
            </ToolbarButton>
          </div>
          <div className="relative bg-slate-50">
            {(!value || isEmptyHtml(value)) && placeholder && (
              <p className="pointer-events-none absolute left-4 top-4 text-sm text-slate-400">{placeholder}</p>
            )}
            <EditorContent
              editor={editor}
              className="overflow-auto [&_.ProseMirror]:min-h-[inherit]"
              style={{ minHeight }}
            />
          </div>
        </div>
      </div>

      {showKeyboard && (
        <MathKeyboard
          onInsert={insertMathText}
          onDelete={deleteMathChar}
          onClose={closeKeyboard}
        />
      )}
    </>
  )
}
