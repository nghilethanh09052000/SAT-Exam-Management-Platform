'use client'

import { useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
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
}

interface Enrollment {
  id: string
  enrolled_at: string
  class_id: string
  class_title: string
  course_id: string
  course_title: string
  course_end_date: string | null
  course_expires_at: string | null
}

interface CourseWithClasses {
  id: string
  title: string
  end_date: string
  expires_at: string | null
  classes: { id: string; title: string }[]
}

interface ImportResult {
  created:  number
  enrolled: number
  skipped:  number
  errors:   {
    type?: string
    email?: string
    row?: number | null
    field?: string
    path?: Array<string | number>
    code?: string
    message?: string
    error: string
  }[]
}

type StudentImportStatus = {
  status: 'processing' | 'success' | 'partial_success' | 'failed'
  result: ImportResult | null
  error_message: string | null
}

async function waitForStudentImport(importId: string, errors?: { errCheck: string; errTimeout: string }) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const res = await fetch(`/api/student-imports/${importId}`, { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok || json.error) {
      throw new Error(json.error ?? (errors?.errCheck ?? 'Cannot check import status.'))
    }

    const status = json.data as StudentImportStatus
    if (['success', 'partial_success', 'failed'].includes(status.status)) return status
    await new Promise((resolve) => setTimeout(resolve, attempt < 15 ? 2000 : 5000))
  }
  throw new Error(errors?.errTimeout ?? 'Import is still processing. Please check again later.')
}

type StudentForm = {
  full_name: string
  email: string
  phone: string
  birth_year: string
  gender: string
  school: string
  city: string
  facebook_url: string
  threads_url: string
  hobbies: string
  target_score: string
  source: string
}

const emptyStudentForm: StudentForm = {
  full_name: '',
  email: '',
  phone: '',
  birth_year: '',
  gender: '',
  school: '',
  city: '',
  facebook_url: '',
  threads_url: '',
  hobbies: '',
  target_score: '',
  source: '',
}

function studentToForm(student: Student): StudentForm {
  return {
    full_name: student.full_name,
    email: student.email,
    phone: student.phone ?? '',
    birth_year: student.birth_year?.toString() ?? '',
    gender: student.gender ?? '',
    school: student.school ?? '',
    city: student.city ?? '',
    facebook_url: student.facebook_url ?? '',
    threads_url: student.threads_url ?? '',
    hobbies: student.hobbies ?? '',
    target_score: student.target_score?.toString() ?? '',
    source: student.source ?? '',
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AdminStudentsClientProps {
  students: Student[]
  courses:  CourseWithClasses[]
}

const PAGE_SIZE = 20

export function AdminStudentsClient({ students: initial, courses }: AdminStudentsClientProps) {
  const t = useTranslations('admin.students')
  const locale = useLocale()
  const [students, setStudents] = useState(initial)
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState<string | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [studentForm, setStudentForm] = useState<StudentForm>(emptyStudentForm)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formCourseId, setFormCourseId] = useState('')
  const [formClassId, setFormClassId] = useState('')

  // Enrollment data is fetched lazily per student when detail/edit modal opens
  const [enrollmentCache, setEnrollmentCache] = useState<Record<string, Enrollment[]>>({})
  const [loadingEnrollments, setLoadingEnrollments] = useState<string | null>(null)

  async function fetchEnrollments(studentId: string) {
    if (Object.prototype.hasOwnProperty.call(enrollmentCache, studentId)) return
    setLoadingEnrollments(studentId)
    try {
      const res = await fetch(`/api/students/${studentId}/enrollments`)
      const json = await res.json()
      setEnrollmentCache((prev) => ({ ...prev, [studentId]: json.data ?? [] }))
    } catch {
      setEnrollmentCache((prev) => ({ ...prev, [studentId]: [] }))
    } finally {
      setLoadingEnrollments(null)
    }
  }

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
  const formAvailableClasses = courses.find((c) => c.id === formCourseId)?.classes ?? []
  const currentEnrollments = editingStudent ? (enrollmentCache[editingStudent.id] ?? []) : []
  const formSelectableClasses = editingStudent
    ? formAvailableClasses.filter((cl) => !currentEnrollments.some((enrollment) => enrollment.class_id === cl.id))
    : formAvailableClasses

  function updateStudentForm(field: keyof StudentForm, value: string) {
    setStudentForm((prev) => ({ ...prev, [field]: value }))
  }

  function openAddStudent() {
    setStudentForm(emptyStudentForm)
    setEditingStudent(null)
    setFormError(null)
    setFormCourseId('')
    setFormClassId('')
    setShowAddModal(true)
  }

  function openEditStudent(student: Student) {
    setStudentForm(studentToForm(student))
    setEditingStudent(student)
    setSelectedStudent(null)
    setFormError(null)
    setFormCourseId('')
    setFormClassId('')
    void fetchEnrollments(student.id)
  }

  function closeStudentForm() {
    setShowAddModal(false)
    setEditingStudent(null)
    setStudentForm(emptyStudentForm)
    setFormError(null)
    setFormCourseId('')
    setFormClassId('')
  }

  function parseOptionalNumber(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number.parseInt(trimmed, 10)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }

  function buildStudentPayload() {
    const fullName = studentForm.full_name.trim()
    const email = studentForm.email.trim().toLowerCase()
    const birthYear = parseOptionalNumber(studentForm.birth_year)
    const targetScore = parseOptionalNumber(studentForm.target_score)

    if (!fullName) return { error: t('errorNameRequired') }
    if (!editingStudent && !email) return { error: t('errorEmailRequired') }
    if (!editingStudent && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: t('errorEmailInvalid') }
    if (Number.isNaN(birthYear)) return { error: t('errorBirthYear') }
    if (Number.isNaN(targetScore)) return { error: t('errorTargetScore') }

    return {
      payload: {
        full_name: fullName,
        email,
        phone: studentForm.phone.trim() || null,
        birth_year: birthYear,
        gender: studentForm.gender.trim() || null,
        school: studentForm.school.trim() || null,
        city: studentForm.city.trim() || null,
        facebook_url: studentForm.facebook_url.trim() || null,
        threads_url: studentForm.threads_url.trim() || null,
        hobbies: studentForm.hobbies.trim() || null,
        target_score: targetScore,
        source: studentForm.source.trim() || null,
      },
    }
  }

  async function saveStudentForm() {
    const built = buildStudentPayload()
    if ('error' in built) {
      setFormError(built.error ?? t('errorInvalidData'))
      return
    }
    if (formCourseId && !formClassId) {
      setFormError(t('errorNeedClass'))
      return
    }

    setFormError(null)
    setFormLoading(true)
    try {
      if (editingStudent) {
        const { email: _email, ...profilePayload } = built.payload
        const res = await fetch(`/api/profiles/${editingStudent.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profilePayload),
        })
        const json = await res.json()
        if (!res.ok || json.error) {
          setFormError(json.error ?? t('errorUpdateStudent'))
          return
        }

        const updatedStudent = {
          ...editingStudent,
          ...json.data,
          email: editingStudent.email,
        }

        if (formClassId) {
          const selectedCourse = courses.find((course) => course.id === formCourseId)
          const selectedClass = selectedCourse?.classes.find((cl) => cl.id === formClassId)
          const enrollRes = await fetch('/api/enrollments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ class_id: formClassId, student_id: editingStudent.id }),
          })
          const enrollJson = await enrollRes.json()
          if (!enrollRes.ok || enrollJson.error) {
            setFormError(enrollJson.error ?? t('errorEnrollStudent'))
            return
          }

          setEnrollmentCache((prev) => ({
            ...prev,
            [editingStudent.id]: [
              {
                id: enrollJson.data.id,
                enrolled_at: enrollJson.data.enrolled_at ?? new Date().toISOString(),
                class_id: formClassId,
                class_title: selectedClass?.title ?? '—',
                course_id: formCourseId,
                course_title: selectedCourse?.title ?? '—',
                course_end_date: selectedCourse?.end_date ?? null,
                course_expires_at: selectedCourse?.expires_at ?? null,
              },
              ...(prev[editingStudent.id] ?? []),
            ],
          }))
        }

        setStudents((prev) => prev.map((student) => student.id === editingStudent.id ? updatedStudent : student))
        closeStudentForm()
        return
      }

      const createUrl = formClassId ? '/api/students/import' : '/api/admin/students/import'
      const createBody = formClassId
        ? { students: [built.payload], class_id: formClassId }
        : { students: [built.payload] }

      const res = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createBody),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        const rowError = json.data?.errors?.[0]?.error
        setFormError(rowError ?? json.error ?? t('errorAddStudent'))
        return
      }

      const importId = json.data?.student_import_id
      if (importId) {
        const status = await waitForStudentImport(importId, { errCheck: t('errCheckImport'), errTimeout: t('errImportPending') })
        if (status.status === 'failed') {
          setFormError(status.error_message ?? t('errorAddStudent'))
          return
        }
      }

      window.location.reload()
    } catch {
      setFormError(t('errorNetwork'))
    } finally {
      setFormLoading(false)
    }
  }

  // ── Filtered + paginated list ──────────────────────────────────────────────

  const filtered = students.filter((s) => {
    const normalized = search.toLowerCase()
    return (
      s.full_name.toLowerCase().includes(normalized) ||
      (s.email ?? '').toLowerCase().includes(normalized) ||
      (s.phone ?? '').includes(search)
    )
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageClamp  = Math.min(page, totalPages)
  const paged      = filtered.slice((pageClamp - 1) * PAGE_SIZE, pageClamp * PAGE_SIZE)

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
        setParseError(t('errorEmptyFile'))
        return
      }
      setPreviewRows(rows)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : t('errorReadFile'))
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

      let json: { data?: (ImportResult & { student_import_id?: string }) | null; error?: string | null }
      try { json = await res.json() } catch {
        setParseError(t('errorInvalidResponse'))
        return
      }

      if (!res.ok || json.error) {
        setParseError(json.error ?? t('errorStatus', { status: res.status }))
        return
      }

      const importId = json.data?.student_import_id
      if (!importId) {
        setParseError(t('errNoImportCode'))
        return
      }

      const status = await waitForStudentImport(importId, { errCheck: t('errCheckImport'), errTimeout: t('errImportPending') })
      setImportResult(status.result ?? null)
      setPreviewRows(null)
      // Reload to show newly imported students in the list
      window.location.reload()
    } catch {
      setParseError(t('errorNetwork'))
    } finally {
      setImporting(false)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  const validCount   = (previewRows ?? []).filter((r) => !r.error).length
  const invalidCount = (previewRows ?? []).filter((r) =>  r.error).length

  function isCourseActive(enrollment: Enrollment) {
    const today = new Date().toISOString().slice(0, 10)
    const now = new Date().toISOString()
    if (!enrollment.course_end_date) return false
    if (enrollment.course_end_date < today) return false
    if (enrollment.course_expires_at && enrollment.course_expires_at < now) return false
    return true
  }

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
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          <button
            onClick={openAddStudent}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-ink text-white text-sm font-semibold shadow-sm hover:bg-black transition-all"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
            </svg>
            {t('addStudent')}
          </button>

          <button
            onClick={downloadStudentTemplate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-mute-light hover:text-ink hover:border-gray-300 hover:shadow-sm transition-all"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('templateFile')}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
            </svg>
            {t('importCsv')}
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />

      {/* Parse / network error — only show outside modal */}
      {parseError && !previewRows && (
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
            <p className="text-sm font-semibold text-emerald-800">{t('importDone')}</p>
          </div>
          <p className="text-sm text-emerald-700 pl-8">
            {t('importCreated')}: <strong>{importResult.created}</strong> {t('importAccounts')}
            {' · '}{t('importEnrolled')}: <strong>{importResult.enrolled}</strong>
            {importResult.skipped > 0 && <> · {t('importSkipped')}: <strong>{importResult.skipped}</strong></>}
          </p>
          {importResult.errors.length > 0 && (
            <div className="mt-2 pl-8 space-y-0.5">
              <p className="text-xs font-medium text-red-700">{t('importErrorsLabel', { count: importResult.errors.length })}:</p>
              {importResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">{e.email ? `${e.email}: ${e.error}` : e.error}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Student list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {/* Header */}
          <div className="min-w-[820px] grid grid-cols-[minmax(180px,2fr)_minmax(200px,2fr)_130px_120px_110px_150px] gap-0 px-5 py-3 border-b border-gray-100 bg-gray-50">
            {[t('colStudent'), t('colEmail'), t('colPhone'), t('colStatus'), t('colCreated'), t('colActions')].map((h) => (
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
              <p className="text-sm font-medium text-ink mb-1">{t('noStudents')}</p>
              <p className="text-xs text-mute-light">{t('noStudentsHint')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 min-w-[820px]">
              {paged.map((student, i) => (
                <li
                  key={student.id}
                  className="grid grid-cols-[minmax(180px,2fr)_minmax(200px,2fr)_130px_120px_110px_150px] gap-0 items-center px-5 py-3 hover:bg-gray-50/70 transition-colors animate-fade-up"
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
                        {t('statusActive')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-500">
                        <svg fill="currentColor" viewBox="0 0 8 8" className="w-1.5 h-1.5"><circle cx="4" cy="4" r="4" /></svg>
                        {t('statusInactive')}
                      </span>
                    )}
                  </div>

                  {/* Date */}
                  <span className="text-xs text-mute-light pr-3">
                    {new Date(student.created_at).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setSelectedStudent(student); void fetchEnrollments(student.id) }}
                      title={t('viewDetail')}
                      className="h-8 px-2 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-all"
                    >
                      {t('viewDetail')}
                    </button>
                    <button
                      onClick={() => openEditStudent(student)}
                      title={t('editBtn')}
                      className="h-8 px-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-ink transition-all"
                    >
                      {t('editBtn')}
                    </button>
                    <button
                      disabled={loading === student.id}
                      onClick={() => toggleActive(student)}
                      title={student.is_active ? t('disableAccount') : t('enableAccount')}
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
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      ) : (
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-xs text-mute-light">
            {t('pageInfo', { count: filtered.length, page: pageClamp, total: totalPages })}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={pageClamp <= 1} onClick={() => setPage((p) => p - 1)}>
              {t('prevPageBtn')}
            </Button>
            <Button size="sm" variant="ghost" disabled={pageClamp >= totalPages} onClick={() => setPage((p) => p + 1)}>
              {t('nextPageBtn')}
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        title={t('detailTitle')}
        size="lg"
      >
        {selectedStudent && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${avatarGrad(selectedStudent.full_name)} flex items-center justify-center text-white text-lg font-bold shadow-sm`}>
                {selectedStudent.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-display font-semibold text-ink">
                  {selectedStudent.full_name}
                </h3>
                <p className="text-sm text-mute-light">{selectedStudent.email || '—'}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => openEditStudent(selectedStudent)}>
                {t('editInfo')}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [t('colPhoneDetail'), selectedStudent.phone || '—'],
                [t('colStatusDetail'), selectedStudent.is_active ? t('statusActive') : t('statusInactive')],
                [t('colBirthYear'), selectedStudent.birth_year?.toString() ?? '—'],
                [t('colGender'), selectedStudent.gender || '—'],
                [t('colSchool'), selectedStudent.school || '—'],
                [t('colCity'), selectedStudent.city || '—'],
                [t('colTargetScore'), selectedStudent.target_score?.toString() ?? '—'],
                [t('colSource'), selectedStudent.source || '—'],
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
                  <p className="text-xs font-medium text-mute-light">{t('colEnrollments')}</p>
                  {enrollmentCache[selectedStudent.id] && (
                    <span className="text-xs text-mute-light">
                      {t('enrollCount', { count: enrollmentCache[selectedStudent.id].length })}
                    </span>
                  )}
                </div>
                {loadingEnrollments === selectedStudent.id ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-mute-light">
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {t('loadingText')}
                  </div>
                ) : !enrollmentCache[selectedStudent.id] || enrollmentCache[selectedStudent.id].length === 0 ? (
                  <p className="text-sm text-ink">—</p>
                ) : (
                  <div className="space-y-2">
                    {enrollmentCache[selectedStudent.id].map((enrollment) => {
                      const active = isCourseActive(enrollment)
                      return (
                        <div key={enrollment.id} className={`rounded-lg px-3 py-2 text-sm ${active ? 'bg-emerald-50 border border-emerald-100' : 'bg-white border border-gray-100 opacity-60'}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                            <p className={`font-medium ${active ? 'text-emerald-800' : 'text-gray-400'}`}>{enrollment.course_title}</p>
                          </div>
                          <p className={`mt-0.5 pl-3 text-xs ${active ? 'text-emerald-700' : 'text-gray-400'}`}>
                            {enrollment.class_title} · {new Date(enrollment.enrolled_at).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-surface-soft p-3">
                <p className="text-xs font-medium text-mute-light">{t('colHobbies')}</p>
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
              {t('colCreated')}: {new Date(selectedStudent.created_at).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={showAddModal || !!editingStudent}
        onClose={closeStudentForm}
        title={editingStudent ? t('formEditTitle') : t('formAddTitle')}
        size="xl"
      >
        <div className="space-y-5">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('labelName')}
              value={studentForm.full_name}
              onChange={(e) => updateStudentForm('full_name', e.target.value)}
              placeholder={t('placeholderName')}
            />
            <Input
              label={t('labelEmail')}
              type="email"
              value={studentForm.email}
              onChange={(e) => updateStudentForm('email', e.target.value)}
              placeholder="student@example.com"
              disabled={!!editingStudent}
            />
            <Input
              label={t('labelPhone')}
              value={studentForm.phone}
              onChange={(e) => updateStudentForm('phone', e.target.value)}
              placeholder={t('placeholderPhone')}
            />
            <Input
              label={t('labelBirthYear')}
              inputMode="numeric"
              value={studentForm.birth_year}
              onChange={(e) => updateStudentForm('birth_year', e.target.value)}
              placeholder={t('placeholderBirthYear')}
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-ink">{t('labelGender')}</label>
              <select
                value={studentForm.gender}
                onChange={(e) => updateStudentForm('gender', e.target.value)}
                className="h-10 w-full rounded-[6px] border border-ash-light bg-canvas-light px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">—</option>
                <option value="Nam">{t('genderMale')}</option>
                <option value="Nữ">{t('genderFemale')}</option>
                <option value="Khác">{t('genderOther')}</option>
              </select>
            </div>
            <Input
              label={t('labelSchool')}
              value={studentForm.school}
              onChange={(e) => updateStudentForm('school', e.target.value)}
              placeholder={t('placeholderSchool')}
            />
            <Input
              label={t('labelCity')}
              value={studentForm.city}
              onChange={(e) => updateStudentForm('city', e.target.value)}
              placeholder={t('placeholderCity')}
            />
            <Input
              label={t('labelTargetScore')}
              inputMode="numeric"
              value={studentForm.target_score}
              onChange={(e) => updateStudentForm('target_score', e.target.value)}
              placeholder={t('placeholderTargetScore')}
            />
            <Input
              label={t('labelFacebook')}
              value={studentForm.facebook_url}
              onChange={(e) => updateStudentForm('facebook_url', e.target.value)}
              placeholder={t('placeholderFacebook')}
            />
            <Input
              label={t('labelThreads')}
              value={studentForm.threads_url}
              onChange={(e) => updateStudentForm('threads_url', e.target.value)}
              placeholder={t('placeholderThreads')}
            />
            <Input
              label={t('labelSource')}
              value={studentForm.source}
              onChange={(e) => updateStudentForm('source', e.target.value)}
              placeholder={t('placeholderSource')}
            />
          </div>

          <Textarea
            label={t('labelHobbies')}
            rows={3}
            value={studentForm.hobbies}
            onChange={(e) => updateStudentForm('hobbies', e.target.value)}
            placeholder={t('placeholderHobbies')}
          />

          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {editingStudent ? t('enrollEditSection') : t('enrollSection')}
                </p>
                <p className="mt-0.5 text-xs text-mute-light">
                  {t('enrollHint')}
                </p>
              </div>
              {editingStudent && enrollmentCache[editingStudent.id] && (
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {t('enrollCount', { count: enrollmentCache[editingStudent.id].length })}
                </span>
              )}
            </div>

            {editingStudent && loadingEnrollments === editingStudent.id && (
              <div className="mb-4 flex items-center gap-2 text-xs text-mute-light">
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {t('loadingClasses')}
              </div>
            )}

            {editingStudent && (enrollmentCache[editingStudent.id] ?? []).length > 0 && (
              <div className="mb-4 space-y-2">
                {(enrollmentCache[editingStudent.id] ?? []).map((enrollment) => {
                  const active = isCourseActive(enrollment)
                  return (
                    <div key={enrollment.id} className={`rounded-lg px-3 py-2 text-sm ${active ? 'bg-emerald-50 border border-emerald-200' : 'bg-white border border-gray-100 opacity-60'}`}>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        <p className={`font-medium ${active ? 'text-emerald-800' : 'text-gray-400'}`}>{enrollment.course_title}</p>
                      </div>
                      <p className={`mt-0.5 pl-3 text-xs ${active ? 'text-emerald-700' : 'text-gray-400'}`}>
                        {enrollment.class_title} · {new Date(enrollment.enrolled_at).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-ink">{t('importCourseLabel')}</label>
                <select
                  value={formCourseId}
                  onChange={(e) => { setFormCourseId(e.target.value); setFormClassId('') }}
                  className="h-10 w-full rounded-[6px] border border-ash-light bg-white px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">{t('enrollCoursePlaceholder')}</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.title}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-ink">{t('importClassLabel')}</label>
                <select
                  value={formClassId}
                  onChange={(e) => setFormClassId(e.target.value)}
                  disabled={!formCourseId}
                  className="h-10 w-full rounded-[6px] border border-ash-light bg-white px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                >
                  <option value="">
                    {formCourseId && formSelectableClasses.length === 0
                      ? t('enrollNoMatchClass')
                      : t('enrollClassPlaceholder')}
                  </option>
                  {formSelectableClasses.map((cl) => (
                    <option key={cl.id} value={cl.id}>{cl.title}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {editingStudent && (
            <p className="text-xs text-mute-light">
              {t('emailNote')}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
            <Button variant="ghost" onClick={closeStudentForm} disabled={formLoading}>
              {t('cancel')}
            </Button>
            <Button onClick={saveStudentForm} loading={formLoading}>
              {editingStudent ? t('saveChanges') : t('saveAdd')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Preview + class-picker modal ──────────────────────────────────────── */}
      <Modal
        open={!!previewRows}
        onClose={() => { setPreviewRows(null); setParseError(null) }}
        title={t('importPreviewTitle')}
        size="xl"
      >
        {previewRows && (
          <div className="space-y-4">

            {/* ── Import error (shown inside modal, not behind it) ───────── */}
            {parseError && (
              <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-600">{parseError}</p>
              </div>
            )}

            {/* ── Class selector (required) ──────────────────────────────── */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {t('importSelectCourse')}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs text-amber-700 mb-1">{t('importCourseLabel')}</label>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => { setSelectedCourseId(e.target.value); setSelectedClassId('') }}
                    className="w-full h-9 px-2 text-sm rounded-lg border border-amber-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <option value="">{t('importSelectCoursePlaceholder')}</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs text-amber-700 mb-1">{t('importClassLabel')}</label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    disabled={!selectedCourseId}
                    className="w-full h-9 px-2 text-sm rounded-lg border border-amber-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50"
                  >
                    <option value="">{t('importSelectClassPlaceholder')}</option>
                    {availableClasses.map((cl) => (
                      <option key={cl.id} value={cl.id}>{cl.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              {!selectedClassId && (
                <p className="text-xs text-amber-700">{t('importRequiredClass')}</p>
              )}
            </div>

            {/* Summary chips */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {t('importValidCount', { count: validCount })}
              </span>
              {invalidCount > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-xs font-semibold text-red-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {t('importErrorCount', { count: invalidCount })}
                </span>
              )}
              <span className="text-xs text-mute-light ml-auto">{t('importDeleteRowTitle')}</span>
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
                            title={t('deleteRowBtn')}
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
                  ? t('importCreateButton', { count: validCount })
                  : t('importCreateDisabled')}
              </button>
              <Button variant="ghost" onClick={() => { setPreviewRows(null); setParseError(null) }} disabled={importing}>
                {t('importCancel')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
