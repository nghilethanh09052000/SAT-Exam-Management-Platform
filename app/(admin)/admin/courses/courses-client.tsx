'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

interface CourseRow {
  id: string
  title: string
  start_date: string
  end_date: string
  archived_at: string | null
  created_at: string
  teacher_id: string
  profiles: { full_name: string } | null
}

interface Teacher {
  id: string
  full_name: string
}

interface Props {
  courses: CourseRow[]
  teachers: Teacher[]
}

// Colour palette for course cards (cycles by index)
const CARD_THEMES = [
  { border: 'border-l-blue-500',    icon: 'from-blue-500 to-indigo-600',   badge: 'bg-blue-50 text-blue-700',   glow: 'hover:shadow-blue-100'   },
  { border: 'border-l-violet-500',  icon: 'from-violet-500 to-purple-600', badge: 'bg-violet-50 text-violet-700', glow: 'hover:shadow-violet-100' },
  { border: 'border-l-emerald-500', icon: 'from-emerald-400 to-teal-500',  badge: 'bg-emerald-50 text-emerald-700', glow: 'hover:shadow-emerald-100' },
  { border: 'border-l-amber-500',   icon: 'from-amber-400 to-orange-500',  badge: 'bg-amber-50 text-amber-700', glow: 'hover:shadow-amber-100'   },
  { border: 'border-l-pink-500',    icon: 'from-pink-500 to-rose-500',     badge: 'bg-pink-50 text-pink-700',   glow: 'hover:shadow-pink-100'    },
  { border: 'border-l-cyan-500',    icon: 'from-cyan-400 to-sky-600',      badge: 'bg-cyan-50 text-cyan-700',   glow: 'hover:shadow-cyan-100'    },
]

function courseInitials(title: string) {
  return title.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

export function AdminCoursesClient({ courses: initial, teachers }: Props) {
  const router = useRouter()
  const [courses, setCourses]     = useState(initial)
  const [search, setSearch]       = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [archiving, setArchiving] = useState<string | null>(null)

  const [showCreate, setShowCreate]   = useState(false)
  const [creating, setCreating]       = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createForm, setCreateForm]   = useState({
    title: '', start_date: '', end_date: '', expires_at: '',
    teacher_id: teachers[0]?.id ?? '',
  })

  const filtered = courses.filter((c) => {
    const matchSearch   = !search || c.title.toLowerCase().includes(search.toLowerCase())
    const matchArchived = showArchived ? true : !c.archived_at
    return matchSearch && matchArchived
  })

  function handleCreateChange(field: keyof typeof createForm, value: string) {
    setCreateForm((prev) => ({ ...prev, [field]: value }))
    setCreateError(null)
  }

  function validateCreate(): string | null {
    if (!createForm.title.trim())                      return 'Vui lòng nhập tên khóa học.'
    if (!createForm.start_date)                        return 'Vui lòng chọn ngày bắt đầu.'
    if (!createForm.end_date)                          return 'Vui lòng chọn ngày kết thúc.'
    if (createForm.start_date >= createForm.end_date)  return 'Ngày kết thúc phải sau ngày bắt đầu.'
    if (!createForm.teacher_id)                        return 'Vui lòng chọn giáo viên.'
    return null
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    const err = validateCreate()
    if (err) { setCreateError(err); return }
    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        title: createForm.title.trim(),
        start_date: createForm.start_date,
        end_date: createForm.end_date,
        teacher_id: createForm.teacher_id,
      }
      if (createForm.expires_at) body.expires_at = new Date(createForm.expires_at).toISOString()

      const res  = await fetch('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      let json: { data?: CourseRow | null; error?: string | null }
      try { json = await res.json() } catch { setCreateError('Phản hồi không hợp lệ từ server.'); return }
      if (!res.ok || json.error) { setCreateError(json.error ?? `Lỗi ${res.status}.`); return }
      if (!json.data) { setCreateError('Tạo thất bại, vui lòng thử lại.'); return }

      const newCourse: CourseRow = {
        ...(json.data as CourseRow),
        profiles: teachers.find(t => t.id === createForm.teacher_id) ? { full_name: teachers.find(t => t.id === createForm.teacher_id)!.full_name } : null,
      }
      setCourses((prev) => [newCourse, ...prev])
      setShowCreate(false)
      setCreateForm({ title: '', start_date: '', end_date: '', expires_at: '', teacher_id: teachers[0]?.id ?? '' })
      router.refresh()
    } catch {
      setCreateError('Lỗi kết nối, vui lòng thử lại.')
    } finally {
      setCreating(false)
    }
  }

  async function toggleArchive(course: CourseRow) {
    setArchiving(course.id)
    const newArchive = course.archived_at ? null : new Date().toISOString()
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived_at: newArchive }),
      })
      if (res.ok) setCourses((prev) => prev.map((c) => c.id === course.id ? { ...c, archived_at: newArchive } : c))
    } finally {
      setArchiving(null)
    }
  }

  return (
    <>
      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mute-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <Input
            placeholder="Tìm kiếm khóa học..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => setShowArchived(v => !v)}
            className={`w-9 h-5 rounded-full relative transition-colors duration-200 cursor-pointer ${showArchived ? 'bg-violet-500' : 'bg-gray-200'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${showArchived ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-mute-light">Đã lưu trữ</span>
        </label>

        <span className="text-xs font-medium text-mute-light bg-gray-100 px-2.5 py-1 rounded-full">
          {filtered.length} khóa học
        </span>

        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-violet-500/30 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tạo khóa học
        </button>
      </div>

      {/* ── Course cards ──────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-violet-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink mb-1">Không tìm thấy khóa học nào</p>
          <p className="text-xs text-mute-light mb-4">Hãy tạo khóa học đầu tiên</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold shadow-md"
          >
            + Tạo khóa học
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((course, i) => {
            const theme = CARD_THEMES[i % CARD_THEMES.length]
            const isActive = !course.archived_at
            return (
              <div
                key={course.id}
                className={`group relative bg-white rounded-2xl border border-gray-100 border-l-4 ${theme.border}
                            shadow-sm hover:shadow-lg ${theme.glow} transition-all duration-250
                            hover:-translate-y-0.5 animate-fade-up overflow-hidden`}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {/* Archived overlay */}
                {!isActive && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 rounded-2xl flex items-center justify-center">
                    <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full">Đã lưu trữ</span>
                  </div>
                )}

                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${theme.icon} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-md`}>
                      {courseInitials(course.title)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-ink text-sm leading-snug truncate">{course.title}</h3>
                      {course.profiles?.full_name && (
                        <p className="text-xs text-mute-light mt-0.5 flex items-center gap-1">
                          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-3 h-3 shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {course.profiles.full_name}
                        </p>
                      )}
                    </div>
                    {/* Status pill */}
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                      {isActive ? '● Mở' : '○ Lưu trữ'}
                    </span>
                  </div>

                  {/* Date range */}
                  <div className="flex items-center gap-2 text-xs text-mute-light mb-4">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{new Date(course.start_date).toLocaleDateString('vi-VN')}</span>
                    <span className="text-gray-300">→</span>
                    <span>{new Date(course.end_date).toLocaleDateString('vi-VN')}</span>
                  </div>

                  {/* Archive button */}
                  <button
                    disabled={archiving === course.id}
                    onClick={() => toggleArchive(course)}
                    className={`w-full py-2 rounded-xl text-xs font-semibold transition-all duration-200
                      ${isActive
                        ? 'bg-gray-50 text-mute-light hover:bg-red-50 hover:text-red-500 border border-gray-100 hover:border-red-100'
                        : 'bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-100'
                      } disabled:opacity-50`}
                  >
                    {archiving === course.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Đang xử lý...
                      </span>
                    ) : isActive ? '📦 Lưu trữ' : '♻️ Khôi phục'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create Course Modal ──────────────────────────────────────────── */}
      <Modal open={showCreate} title="Tạo khóa học mới" onClose={() => { setShowCreate(false); setCreateError(null) }}>
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          {createError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-600">{createError}</p>
            </div>
          )}
          <Input label="Tên khóa học *" placeholder="VD: SAT Spring 2025 — Intensive" value={createForm.title} onChange={(e) => handleCreateChange('title', e.target.value)} />
          {teachers.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-ink">Giáo viên *</label>
              <select value={createForm.teacher_id} onChange={(e) => handleCreateChange('teacher_id', e.target.value)} className="h-10 w-full rounded-xl border border-ash-light px-3 text-sm text-ink bg-canvas-light focus:outline-none focus:ring-2 focus:ring-violet-400">
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Ngày bắt đầu *" type="date" value={createForm.start_date} onChange={(e) => handleCreateChange('start_date', e.target.value)} />
            <Input label="Ngày kết thúc *" type="date" value={createForm.end_date} onChange={(e) => handleCreateChange('end_date', e.target.value)} />
          </div>
          <div>
            <Input label="Hạn truy cập (tùy chọn)" type="datetime-local" value={createForm.expires_at} onChange={(e) => handleCreateChange('expires_at', e.target.value)} />
            <p className="text-xs text-mute-light mt-1">Sau ngày này học sinh không còn truy cập được.</p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={creating} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold shadow-md shadow-violet-500/30 hover:shadow-lg disabled:opacity-50 transition-all">
              {creating && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
              Tạo khóa học
            </button>
            <Button type="button" variant="ghost" onClick={() => { setShowCreate(false); setCreateError(null) }}>Hủy</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
