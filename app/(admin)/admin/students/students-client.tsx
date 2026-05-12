'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: string
  full_name: string
  email: string
  phone: string | null
  is_active: boolean
  created_at: string
}

interface ParsedRow {
  full_name:    string
  email:        string
  phone:        string
  birth_year:   number | null
  gender:       string
  school:       string
  city:         string
  facebook_url: string
  threads_url:  string
  hobbies:      string
  target_score: number | null
  source:       string
  error?:       string
}

interface ImportResult {
  created: number
  skipped: number
  errors: { email: string; error: string }[]
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
// Handles quoted fields, commas inside quotes, and \r\n / \n line endings.

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

// Column header aliases (case-insensitive substring match)
const COL_ALIASES: Record<string, string[]> = {
  full_name:    ['họ tên', 'ho ten', 'tên', 'ten', 'full_name', 'name', 'họ và tên'],
  email:        ['email', 'e-mail', 'địa chỉ email', 'dia chi email'],
  phone:        ['điện thoại', 'dien thoai', 'sdt', 'số điện thoại', 'so dien thoai', 'phone', 'tel'],
  birth_year:   ['năm sinh', 'nam sinh', 'birth_year', 'year', 'năm'],
  gender:       ['giới tính', 'gioi tinh', 'gender', 'gt'],
  school:       ['trường học', 'truong hoc', 'trường', 'truong', 'school'],
  city:         ['tỉnh', 'tinh', 'thành phố', 'thanh pho', 'city', 'province', 'tỉnh/thành'],
  facebook_url: ['facebook', 'fb', 'facebook_url'],
  threads_url:  ['threads', 'thread', 'threads_url'],
  hobbies:      ['sở thích', 'so thich', 'hobbies', 'hobby', 'thích'],
  target_score: ['mục tiêu', 'muc tieu', 'target_score', 'target', 'điểm mục tiêu', 'diem muc tieu'],
  source:       ['nguồn', 'nguon', 'source', 'biết đến', 'biet den', 'nguồn biết đến'],
}

function buildColMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    const idx = headers.findIndex((h) =>
      aliases.some((a) => h.toLowerCase().trim().includes(a))
    )
    if (idx >= 0) map[field] = idx
  }
  return map
}

function parseCSV(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Không thể đọc file.'))
    reader.onload = (e) => {
      try {
        const text = (e.target!.result as string)
          .replace(/^﻿/, '')     // strip BOM
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')

        const lines = text.split('\n').filter((l) => l.trim() !== '')
        if (lines.length < 2) { resolve([]); return }

        const headers = parseCSVLine(lines[0])
        const cm = buildColMap(headers)

        // Positional fallbacks for required fields
        const nameIdx  = cm.full_name  ?? 0
        const emailIdx = cm.email      ?? 1
        const phoneIdx = cm.phone      ?? 2

        const rows: ParsedRow[] = []

        for (let i = 1; i < lines.length; i++) {
          const f = parseCSVLine(lines[i])
          const g = (idx: number | undefined) => (idx !== undefined ? (f[idx] ?? '') : '').trim()

          const full_name    = g(nameIdx)
          const email        = g(emailIdx).toLowerCase()
          const phone        = g(phoneIdx)
          const birth_year_s = g(cm.birth_year)
          const gender       = g(cm.gender)
          const school       = g(cm.school)
          const city         = g(cm.city)
          const facebook_url = g(cm.facebook_url)
          const threads_url  = g(cm.threads_url)
          const hobbies      = g(cm.hobbies)
          const target_s     = g(cm.target_score)
          const source       = g(cm.source)

          if (!full_name && !email) continue

          const birth_year   = birth_year_s   ? parseInt(birth_year_s, 10)  || null : null
          const target_score = target_s       ? parseInt(target_s, 10)       || null : null

          let error: string | undefined
          if (!full_name) error = 'Thiếu họ tên'
          else if (!email) error = 'Thiếu email'
          else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Email không hợp lệ'

          rows.push({
            full_name, email, phone,
            birth_year, gender, school, city,
            facebook_url, threads_url, hobbies,
            target_score, source,
            error,
          })
        }

        resolve(rows)
      } catch {
        reject(new Error('File CSV không hợp lệ.'))
      }
    }
    reader.readAsText(file, 'UTF-8')
  })
}

// ─── Template download ────────────────────────────────────────────────────────

const TEMPLATE_HEADERS = [
  'Họ tên', 'Email', 'Số điện thoại', 'Năm sinh', 'Giới tính',
  'Trường học', 'Tỉnh/Thành phố', 'Facebook', 'Threads',
  'Sở thích', 'Mục tiêu điểm SAT', 'Nguồn biết đến',
]

function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADERS,
    [
      'Nguyễn Văn An', 'an.nguyen@gmail.com', '0901234567', '2007', 'Nam',
      'THPT Nguyễn Du', 'TP. Hồ Chí Minh', 'https://facebook.com/an.nguyen', '',
      'Bóng đá, âm nhạc', '1400', 'Bạn bè giới thiệu',
    ],
    [
      'Trần Thị Bình', 'binh.tran@gmail.com', '0912345678', '2008', 'Nữ',
      'THPT Lê Quý Đôn', 'Hà Nội', '', 'https://threads.net/@binh.tran',
      'Đọc sách, vẽ', '1350', 'Mạng xã hội',
    ],
  ]
  // Quote fields that contain commas
  const escape = (v: string) => v.includes(',') ? `"${v}"` : v
  const csv = rows.map((r) => r.map(escape).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'mau-danh-sach-hoc-sinh.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Preview column config ────────────────────────────────────────────────────

const PREVIEW_COLS: { key: keyof ParsedRow; label: string }[] = [
  { key: 'full_name',    label: 'Họ tên'           },
  { key: 'email',        label: 'Email'             },
  { key: 'phone',        label: 'SĐT'               },
  { key: 'birth_year',   label: 'Năm sinh'          },
  { key: 'gender',       label: 'Giới tính'         },
  { key: 'school',       label: 'Trường học'        },
  { key: 'city',         label: 'Tỉnh/TP'           },
  { key: 'facebook_url', label: 'Facebook'          },
  { key: 'threads_url',  label: 'Threads'           },
  { key: 'hobbies',      label: 'Sở thích'          },
  { key: 'target_score', label: 'Mục tiêu SAT'      },
  { key: 'source',       label: 'Nguồn biết đến'    },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface AdminStudentsClientProps {
  students: Student[]
}

export function AdminStudentsClient({ students: initial }: AdminStudentsClientProps) {
  const [students, setStudents]   = useState(initial)
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState<string | null>(null)

  const fileInputRef                        = useRef<HTMLInputElement>(null)
  const [parseError, setParseError]         = useState<string | null>(null)
  const [previewRows, setPreviewRows]       = useState<ParsedRow[] | null>(null)
  const [importing, setImporting]           = useState(false)
  const [importResult, setImportResult]     = useState<ImportResult | null>(null)

  // ── Filtered list ────────────────────────────────────────────────────────

  const filtered = students.filter((s) =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.phone ?? '').includes(search)
  )

  // ── Toggle active ────────────────────────────────────────────────────────

  async function toggleActive(student: Student) {
    setLoading(student.id)
    try {
      const res = await fetch(`/api/profiles/${student.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !student.is_active }),
      })
      if (res.ok) {
        setStudents((prev) =>
          prev.map((s) => s.id === student.id ? { ...s, is_active: !s.is_active } : s)
        )
      }
    } finally {
      setLoading(null)
    }
  }

  // ── File selected ────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setParseError(null)
    setImportResult(null)

    try {
      const rows = await parseCSV(file)
      if (rows.length === 0) {
        setParseError('File không có dữ liệu hoặc không đúng định dạng.')
        return
      }
      setPreviewRows(rows)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Không thể đọc file.')
    }
  }

  // ── Remove single preview row ────────────────────────────────────────────

  function removeRow(index: number) {
    setPreviewRows((prev) => {
      if (!prev) return prev
      const next = prev.filter((_, i) => i !== index)
      return next.length === 0 ? null : next
    })
  }

  // ── Submit import ────────────────────────────────────────────────────────

  async function handleImport() {
    if (!previewRows) return
    const validRows = previewRows.filter((r) => !r.error)
    if (validRows.length === 0) return

    setImporting(true)
    try {
      const res = await fetch('/api/admin/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: validRows }),
      })

      let json: { data?: ImportResult | null; error?: string | null }
      try { json = await res.json() } catch {
        setParseError('Phản hồi không hợp lệ từ server.')
        return
      }

      if (!res.ok) {
        setParseError(json.error ?? `Lỗi ${res.status}`)
        return
      }

      setImportResult(json.data ?? null)
      setPreviewRows(null)
      window.location.reload()
    } catch {
      setParseError('Lỗi kết nối, vui lòng thử lại.')
    } finally {
      setImporting(false)
    }
  }

  // ── Derived counts ───────────────────────────────────────────────────────

  const validCount   = (previewRows ?? []).filter((r) => !r.error).length
  const invalidCount = (previewRows ?? []).filter((r) =>  r.error).length

  // ── Avatar colour ────────────────────────────────────────────────────────

  const AVATAR_GRADIENTS = [
    'from-blue-500 to-indigo-600',
    'from-violet-500 to-purple-600',
    'from-emerald-400 to-teal-500',
    'from-amber-400 to-orange-500',
    'from-pink-500 to-rose-500',
    'from-cyan-400 to-sky-600',
  ]
  function avatarGrad(name: string) {
    return AVATAR_GRADIENTS[(name.charCodeAt(0) ?? 0) % AVATAR_GRADIENTS.length]
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mute-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <Input
            placeholder="Tìm kiếm theo tên, email hoặc SĐT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          {/* Template download */}
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-mute-light hover:text-ink hover:border-gray-300 hover:shadow-sm transition-all"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            File mẫu
          </button>

          {/* Import button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
            </svg>
            Import CSV
          </button>
        </div>
      </div>

      {/* Hidden file input — CSV only */}
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />

      {/* Parse / network error */}
      {parseError && (
        <div className="flex items-start gap-3 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 animate-fade-in">
          <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-red-600">{parseError}</p>
        </div>
      )}

      {/* Import success */}
      {importResult && (
        <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 px-5 py-4 animate-pop-in">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-emerald-800">Import hoàn thành!</p>
          </div>
          <p className="text-sm text-emerald-700 pl-8">
            Tạo mới: <strong>{importResult.created}</strong> học sinh
            {importResult.skipped > 0 && <> · Bỏ qua: <strong>{importResult.skipped}</strong></>}
          </p>
          {importResult.errors.length > 0 && (
            <div className="mt-2 pl-8 space-y-0.5">
              <p className="text-xs font-medium text-red-700">Lỗi ({importResult.errors.length}):</p>
              {importResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">{e.email}: {e.error}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Student list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-3 px-5 py-3 border-b border-gray-50 bg-gray-50/80">
          {['Học sinh', 'Email', 'Điện thoại', 'Trạng thái', 'Ngày đăng ký', ''].map((h) => (
            <span key={h} className="text-xs font-semibold text-mute-light uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-blue-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-ink mb-1">Không tìm thấy học sinh nào</p>
            <p className="text-xs text-mute-light">Thử thay đổi từ khóa hoặc import danh sách mới</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((student, i) => (
              <li
                key={student.id}
                className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-3 items-center px-5 py-3.5 hover:bg-gray-50/60 transition-colors animate-fade-up"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {/* Name + avatar */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${avatarGrad(student.full_name)} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
                    {student.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span className="text-sm font-medium text-ink truncate">{student.full_name}</span>
                </div>

                {/* Email */}
                <span className="text-xs text-mute-light truncate">{student.email ?? '—'}</span>

                {/* Phone */}
                <span className="text-xs text-mute-light">{student.phone ?? '—'}</span>

                {/* Status */}
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${student.is_active ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]' : 'bg-gray-300'}`} />
                  <span className={`text-xs font-medium ${student.is_active ? 'text-emerald-600' : 'text-mute-light'}`}>
                    {student.is_active ? 'Hoạt động' : 'Vô hiệu'}
                  </span>
                </div>

                {/* Date */}
                <span className="text-xs text-mute-light">
                  {new Date(student.created_at).toLocaleDateString('vi-VN')}
                </span>

                {/* Toggle button */}
                <button
                  disabled={loading === student.id}
                  onClick={() => toggleActive(student)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-50 whitespace-nowrap
                    ${student.is_active
                      ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
                      : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'
                    }`}
                >
                  {loading === student.id ? (
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  ) : student.is_active ? 'Vô hiệu' : 'Kích hoạt'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Preview modal ─────────────────────────────────────────────────── */}
      <Modal
        open={!!previewRows}
        onClose={() => { setPreviewRows(null); setParseError(null) }}
        title="Xem trước danh sách import"
        size="xl"
      >
        {previewRows && (
          <div className="space-y-4">
            {/* Summary chips */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {validCount} hợp lệ
              </span>
              {invalidCount > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-xs font-semibold text-red-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {invalidCount} lỗi (sẽ bỏ qua)
                </span>
              )}
              <span className="text-xs text-mute-light ml-auto">
                Nhấn ✕ để xóa dòng trước khi import
              </span>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="overflow-x-auto max-h-[52vh] overflow-y-auto">
                <table className="w-full text-sm" style={{ minWidth: '900px' }}>
                  <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-mute-light uppercase w-8">#</th>
                      {PREVIEW_COLS.map((col) => (
                        <th key={col.key} className="px-3 py-2.5 text-left text-xs font-semibold text-mute-light uppercase whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-mute-light uppercase">Status</th>
                      <th className="px-3 py-2.5 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {previewRows.map((row, i) => (
                      <tr key={i} className={`transition-colors ${row.error ? 'bg-red-50/60' : 'hover:bg-gray-50/70'}`}>
                        <td className="px-3 py-2.5 text-mute-light text-xs font-mono">{i + 1}</td>

                        {PREVIEW_COLS.map((col) => {
                          const val = row[col.key]
                          const isEmpty = val === null || val === undefined || val === ''
                          if (isEmpty) return <td key={col.key} className="px-3 py-2.5 text-gray-200 text-xs">—</td>
                          const isRequired = col.key === 'full_name' || col.key === 'email'
                          return (
                            <td key={col.key} className={`px-3 py-2.5 whitespace-nowrap max-w-[160px] truncate ${isRequired ? 'font-semibold text-ink' : 'text-xs text-mute-light'}`}>
                              {String(val)}
                            </td>
                          )
                        })}

                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {row.error
                            ? <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full border border-red-100">{row.error}</span>
                            : <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">✓ OK</span>
                          }
                        </td>

                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => removeRow(i)}
                            disabled={importing}
                            title="Xóa dòng này"
                            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-100 text-gray-300 hover:text-red-500 transition-all disabled:opacity-30"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleImport}
                disabled={importing || validCount === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold shadow-md shadow-blue-500/25 hover:shadow-lg disabled:opacity-50 transition-all"
              >
                {importing && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                Tạo {validCount} tài khoản
              </button>
              <Button variant="ghost" onClick={() => { setPreviewRows(null); setParseError(null) }} disabled={importing}>
                Hủy
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
