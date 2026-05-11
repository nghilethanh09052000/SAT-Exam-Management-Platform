'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
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

export function AdminCoursesClient({ courses: initial, teachers }: Props) {
  const router = useRouter()
  const [courses, setCourses] = useState(initial)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [archiving, setArchiving] = useState<string | null>(null)

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({
    title: '',
    start_date: '',
    end_date: '',
    expires_at: '',
    teacher_id: teachers[0]?.id ?? '',
  })

  const filtered = courses.filter((c) => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase())
    const matchArchived = showArchived ? true : !c.archived_at
    return matchSearch && matchArchived
  })

  function handleCreateChange(field: keyof typeof createForm, value: string) {
    setCreateForm((prev) => ({ ...prev, [field]: value }))
    setCreateError(null)
  }

  function validateCreate(): string | null {
    if (!createForm.title.trim()) return 'Vui lòng nhập tên khóa học.'
    if (!createForm.start_date) return 'Vui lòng chọn ngày bắt đầu.'
    if (!createForm.end_date) return 'Vui lòng chọn ngày kết thúc.'
    if (createForm.start_date >= createForm.end_date) return 'Ngày kết thúc phải sau ngày bắt đầu.'
    if (!createForm.teacher_id) return 'Vui lòng chọn giáo viên.'
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

      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      let json: { data?: CourseRow | null; error?: string | null }
      try { json = await res.json() } catch {
        setCreateError('Phản hồi không hợp lệ từ server.')
        return
      }

      if (!res.ok || json.error) {
        setCreateError(json.error ?? `Lỗi ${res.status}.`)
        return
      }

      if (!json.data) {
        setCreateError('Tạo thất bại, vui lòng thử lại.')
        return
      }

      // Add to list and close modal
      const newCourse: CourseRow = {
        ...(json.data as CourseRow),
        profiles: teachers.find(t => t.id === createForm.teacher_id) ? { full_name: teachers.find(t => t.id === createForm.teacher_id)!.full_name } : null,
      }
      setCourses((prev) => [newCourse, ...prev])
      setShowCreate(false)
      setCreateForm({ title: '', start_date: '', end_date: '', expires_at: '', teacher_id: teachers[0]?.id ?? '' })
      router.refresh()
    } catch (err) {
      console.error('Create course error:', err)
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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived_at: newArchive }),
      })
      if (res.ok) {
        setCourses((prev) =>
          prev.map((c) => c.id === course.id ? { ...c, archived_at: newArchive } : c)
        )
      }
    } finally {
      setArchiving(null)
    }
  }

  return (
    <>
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <Input
            placeholder="Tìm kiếm khóa học..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm text-mute-light">Hiện đã lưu trữ</span>
          </label>
          <span className="text-xs text-mute-light">{filtered.length} khóa học</span>
          <div className="ml-auto">
            <Button size="sm" onClick={() => setShowCreate(true)}>
              + Tạo khóa học
            </Button>
          </div>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[1fr_140px_140px_120px_120px] gap-4 px-5 py-2 text-xs font-medium text-mute-light uppercase tracking-wide">
          <span>Tên khóa học</span>
          <span>Bắt đầu</span>
          <span>Kết thúc</span>
          <span>Trạng thái</span>
          <span className="text-right">Thao tác</span>
        </div>

        <div className="space-y-1">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-mute-light">Không tìm thấy khóa học nào</p>
              <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
                + Tạo khóa học đầu tiên
              </Button>
            </div>
          ) : (
            filtered.map((course) => (
              <div
                key={course.id}
                className={[
                  'grid grid-cols-[1fr_140px_140px_120px_120px] gap-4 items-center px-5 py-3.5 rounded-card text-sm',
                  course.archived_at ? 'bg-surface-soft opacity-70' : 'bg-surface-card',
                ].join(' ')}
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">{course.title}</p>
                  {course.profiles?.full_name && (
                    <p className="text-xs text-mute-light">{course.profiles.full_name}</p>
                  )}
                </div>
                <span className="text-mute-light">
                  {new Date(course.start_date).toLocaleDateString('vi-VN')}
                </span>
                <span className="text-mute-light">
                  {new Date(course.end_date).toLocaleDateString('vi-VN')}
                </span>
                <div>
                  {course.archived_at ? (
                    <Badge variant="muted">Đã lưu trữ</Badge>
                  ) : (
                    <Badge variant="success">Hoạt động</Badge>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant={course.archived_at ? 'secondary' : 'ghost'}
                    loading={archiving === course.id}
                    onClick={() => toggleArchive(course)}
                  >
                    {course.archived_at ? 'Khôi phục' : 'Lưu trữ'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Course Modal */}
      <Modal
        open={showCreate}
        title="Tạo khóa học mới"
        onClose={() => { setShowCreate(false); setCreateError(null) }}
      >
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          {createError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-600">{createError}</p>
            </div>
          )}

          <Input
            label="Tên khóa học *"
            placeholder="Ví dụ: SAT Spring 2025 — Intensive"
            value={createForm.title}
            onChange={(e) => handleCreateChange('title', e.target.value)}
          />

          {teachers.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-ink">Giáo viên *</label>
              <select
                value={createForm.teacher_id}
                onChange={(e) => handleCreateChange('teacher_id', e.target.value)}
                className="h-10 w-full rounded-[6px] border border-ash-light px-3 text-sm text-ink bg-canvas-light focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Ngày bắt đầu *"
              type="date"
              value={createForm.start_date}
              onChange={(e) => handleCreateChange('start_date', e.target.value)}
            />
            <Input
              label="Ngày kết thúc *"
              type="date"
              value={createForm.end_date}
              onChange={(e) => handleCreateChange('end_date', e.target.value)}
            />
          </div>

          <div>
            <Input
              label="Hạn truy cập (tùy chọn)"
              type="datetime-local"
              value={createForm.expires_at}
              onChange={(e) => handleCreateChange('expires_at', e.target.value)}
            />
            <p className="text-xs text-mute-light mt-1">Sau ngày này học sinh không còn truy cập được.</p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" loading={creating}>Tạo khóa học</Button>
            <Button type="button" variant="ghost" onClick={() => { setShowCreate(false); setCreateError(null) }}>
              Hủy
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
