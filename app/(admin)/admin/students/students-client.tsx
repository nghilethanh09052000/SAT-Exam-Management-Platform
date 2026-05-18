'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import {
  parseStudentCSV,
  downloadStudentTemplate,
  PREVIEW_COLS,
  type ParsedStudentRow,
} from '@/lib/utils/parse-csv'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: string
  full_name: string
  email: string
  phone: string | null
  is_active: boolean
  created_at: string
  birth_year: number | null
  gender: string | null
  school: string | null
  city: string | null
  facebook_url: string | null
  threads_url: string | null
  hobbies: string | null
  target_score: number | null
  source: string | null
  enrollments: {
    id: string
    enrolled_at: string
    class_id: string
    class_title: string
    course_id: string
    course_title: string
  }[]
}

interface CourseWithClasses {
  id: string
  title: string
  classes: { id: string; title: string }[]
}

interface ImportResult {
  created:  number
  enrolled: number
  skipped:  number
  errors:   { email: string; error: string }[]
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AdminStudentsClientProps {
  students: Student[]
  courses:  CourseWithClasses[]
}

export function AdminStudentsClient({ students: initial, courses }: AdminStudentsClientProps) {
  const [students, setStudents] = useState(initial)
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState<string | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  // ── Import state ─────────────────────────────────────────────────────────
  const fileInputRef                    = useRef<HTMLInputElement>(null)
  const [parseError, setParseError]     = useState<string | null>(null)
  const [previewRows, setPreviewRows]   = useState<ParsedStudentRow[] | null>(null)
  const [importing, setImporting]       = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Class selection inside the import modal
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [selectedClassId, setSelectedClassId]   = useState('')

  const availableClasses = courses.find((c) => c.id === selectedCourseId)?.classes ?? []

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = students.filter((s) =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.phone ?? '').includes(search)
  )

  // ── Toggle active ──────────────────────────────────────────────────────────

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

  // ── File selected ──────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setParseError(null)
    setImportResult(null)
    setSelectedCourseId('')
    setSelectedClassId('')

    try {
      const rows = await parseStudentCSV(file)
      if (rows.length === 0) {
        setParseError('File không có dữ liệu hoặc không đúng định dạng.')
        return
      }
      setPreviewRows(rows)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Không thể đọc file.')
    }
  }

  function removeRow(index: number) {
    setPreviewRows((prev) => {
      if (!prev) return prev
      const next = prev.filter((_, i) => i !== index)
      return next.length === 0 ? null : next
    })
  }

  // ── Submit import ──────────────────────────────────────────────────────────

  async function handleImport() {
    if (!previewRows || !selectedClassId) return
    const validRows = previewRows.filter((r) => !r.error)
    if (validRows.length === 0) return

    setImporting(true)
    try {
      const res = await fetch('/api/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: validRows, class_id: selectedClassId }),
      })

      let json: { data?: ImportResult | null; error?: string | null }
      try { json = await res.json() } catch {
        setParseError('Phản hồi không hợp lệ từ server.')
        return
      }

      if (!res.ok && !json.data) {
        setParseError(json.error ?? `Lỗi ${res.status}`)
        return
      }

      setImportResult(json.data ?? null)
      setPreviewRows(null)
      // Reload to show newly imported students in the list
      window.location.reload()
    } catch {
      setParseError('Lỗi kết nối, vui lòng thử lại.')
    } finally {
      setImporting(false)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  const validCount   = (previewRows ?? []).filter((r) => !r.error).length
  const invalidCount = (previewRows ?? []).filter((r) =>  r.error).length

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

  // ── Render ─────────────────────────────────────────────────────────────────

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
          <button
            onClick={downloadStudentTemplate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-mute-light hover:text-ink hover:border-gray-300 hover:shadow-sm transition-all"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            File mẫu
          </button>

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

      {/* Import success banner */}
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
            Tạo mới: <strong>{importResult.created}</strong> tài khoản
            {' · '}Ghi danh: <strong>{importResult.enrolled}</strong> học sinh
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
        <div className="overflow-x-auto">
          {/* Header */}
          <div className="min-w-[760px] grid grid-cols-[minmax(160px,2fr)_minmax(160px,2fr)_120px_110px_100px_120px] gap-0 px-5 py-3 border-b border-gray-100 bg-gray-50">
            {['Học sinh', 'Email', 'Số điện thoại', 'Trạng thái', 'Ngày tạo', 'Hành động'].map((h) => (
              <span key={h} className="text-xs font-semibold text-mute-light uppercase tracking-wide pr-3">{h}</span>
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
            <ul className="divide-y divide-gray-50 min-w-[760px]">
              {filtered.map((student, i) => (
                <li
                  key={student.id}
                  className="grid grid-cols-[minmax(160px,2fr)_minmax(160px,2fr)_120px_110px_100px_120px] gap-0 items-center px-5 py-3 hover:bg-gray-50/70 transition-colors animate-fade-up"
                  style={{ animationDelay: `${i * 25}ms` }}
                >
                  {/* Avatar + name */}
                  <div className="flex items-center gap-2.5 min-w-0 pr-3">
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${avatarGrad(student.full_name)} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
                      {student.full_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className="text-sm font-medium text-ink truncate">{student.full_name}</span>
                  </div>

                  {/* Email */}
                  <span className="text-xs text-mute-light truncate pr-3">{student.email || '—'}</span>

                  {/* Phone */}
                  <span className="text-xs text-mute-light pr-3">{student.phone || '—'}</span>

                  {/* Status badge */}
                  <div className="pr-3">
                    {student.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                        <svg fill="currentColor" viewBox="0 0 8 8" className="w-1.5 h-1.5"><circle cx="4" cy="4" r="4" /></svg>
                        Hoạt động
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-500">
                        <svg fill="currentColor" viewBox="0 0 8 8" className="w-1.5 h-1.5"><circle cx="4" cy="4" r="4" /></svg>
                        Vô hiệu
                      </span>
                    )}
                  </div>

                  {/* Date */}
                  <span className="text-xs text-mute-light pr-3">
                    {new Date(student.created_at).toLocaleDateString('vi-VN')}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedStudent(student)}
                      title="Xem chi tiết"
                      className="h-8 px-2 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-all"
                    >
                      Xem chi tiết
                    </button>
                    <button
                      disabled={loading === student.id}
                      onClick={() => toggleActive(student)}
                      title={student.is_active ? 'Vô hiệu hoá tài khoản' : 'Kích hoạt tài khoản'}
                      className={[
                        'w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-40',
                        student.is_active
                          ? 'text-red-400 hover:bg-red-50 hover:text-red-600'
                          : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700',
                      ].join(' ')}
                    >
                      {loading === student.id ? (
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      ) : student.is_active ? (
                        /* Ban / deactivate icon */
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      ) : (
                        /* Check-circle / activate icon */
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Modal
        open={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        title="Chi tiết học sinh"
        size="lg"
      >
        {selectedStudent && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${avatarGrad(selectedStudent.full_name)} flex items-center justify-center text-white text-lg font-bold shadow-sm`}>
                {selectedStudent.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <h3 className="text-lg font-display font-semibold text-ink">
                  {selectedStudent.full_name}
                </h3>
                <p className="text-sm text-mute-light">{selectedStudent.email || '—'}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Số điện thoại', selectedStudent.phone || '—'],
                ['Trạng thái', selectedStudent.is_active ? 'Hoạt động' : 'Vô hiệu'],
                ['Năm sinh', selectedStudent.birth_year?.toString() ?? '—'],
                ['Giới tính', selectedStudent.gender || '—'],
                ['Trường học', selectedStudent.school || '—'],
                ['Tỉnh / thành phố', selectedStudent.city || '—'],
                ['Mục tiêu SAT', selectedStudent.target_score?.toString() ?? '—'],
                ['Nguồn biết đến', selectedStudent.source || '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-surface-soft p-3">
                  <p className="text-xs font-medium text-mute-light">{label}</p>
                  <p className="mt-1 text-sm text-ink">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3">
              <div className="rounded-xl bg-surface-soft p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-mute-light">Khóa học / lớp học</p>
                  <span className="text-xs text-mute-light">
                    {selectedStudent.enrollments.length} ghi danh
                  </span>
                </div>
                {selectedStudent.enrollments.length === 0 ? (
                  <p className="text-sm text-ink">—</p>
                ) : (
                  <div className="space-y-2">
                    {selectedStudent.enrollments.map((enrollment) => (
                      <div
                        key={enrollment.id}
                        className="rounded-lg bg-white px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-ink">{enrollment.course_title}</p>
                        <p className="text-mute-light">
                          {enrollment.class_title} · {new Date(enrollment.enrolled_at).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-surface-soft p-3">
                <p className="text-xs font-medium text-mute-light">Sở thích</p>
                <p className="mt-1 text-sm text-ink">{selectedStudent.hobbies || '—'}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-surface-soft p-3">
                  <p className="text-xs font-medium text-mute-light">Facebook</p>
                  {selectedStudent.facebook_url ? (
                    <a
                      href={selectedStudent.facebook_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-sm text-primary hover:underline"
                    >
                      {selectedStudent.facebook_url}
                    </a>
                  ) : (
                    <p className="mt-1 text-sm text-ink">—</p>
                  )}
                </div>
                <div className="rounded-xl bg-surface-soft p-3">
                  <p className="text-xs font-medium text-mute-light">Threads</p>
                  {selectedStudent.threads_url ? (
                    <a
                      href={selectedStudent.threads_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-sm text-primary hover:underline"
                    >
                      {selectedStudent.threads_url}
                    </a>
                  ) : (
                    <p className="mt-1 text-sm text-ink">—</p>
                  )}
                </div>
              </div>
            </div>

            <p className="text-xs text-mute-light">
              Ngày tạo: {new Date(selectedStudent.created_at).toLocaleString('vi-VN')}
            </p>
          </div>
        )}
      </Modal>

      {/* ── Preview + class-picker modal ──────────────────────────────────────── */}
      <Modal
        open={!!previewRows}
        onClose={() => { setPreviewRows(null); setParseError(null) }}
        title="Xem trước danh sách import"
        size="xl"
      >
        {previewRows && (
          <div className="space-y-4">

            {/* ── Class selector (required) ──────────────────────────────── */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Chọn lớp học để ghi danh
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs text-amber-700 mb-1">Khóa học</label>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => { setSelectedCourseId(e.target.value); setSelectedClassId('') }}
                    className="w-full h-9 px-2 text-sm rounded-lg border border-amber-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <option value="">— Chọn khóa học —</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs text-amber-700 mb-1">Lớp học</label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    disabled={!selectedCourseId}
                    className="w-full h-9 px-2 text-sm rounded-lg border border-amber-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50"
                  >
                    <option value="">— Chọn lớp —</option>
                    {availableClasses.map((cl) => (
                      <option key={cl.id} value={cl.id}>{cl.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              {!selectedClassId && (
                <p className="text-xs text-amber-700">⚠ Bắt buộc chọn lớp để ghi danh học sinh</p>
              )}
            </div>

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
              <span className="text-xs text-mute-light ml-auto">Nhấn ✕ để xóa dòng</span>
            </div>

            {/* Preview table */}
            <div className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
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
                disabled={importing || validCount === 0 || !selectedClassId}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold shadow-md shadow-blue-500/25 hover:shadow-lg disabled:opacity-50 transition-all"
              >
                {importing && (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {selectedClassId
                  ? `Tạo tài khoản & ghi danh ${validCount} học sinh`
                  : 'Chọn lớp trước khi import'}
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
