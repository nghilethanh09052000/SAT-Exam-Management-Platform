'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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

interface Props {
  courses: CourseRow[]
}

export function AdminCoursesClient({ courses: initial }: Props) {
  const [courses, setCourses] = useState(initial)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  const filtered = courses.filter((c) => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase())
    const matchArchived = showArchived ? true : !c.archived_at
    return matchSearch && matchArchived
  })

  async function toggleArchive(course: CourseRow) {
    setLoading(course.id)
    const newArchive = course.archived_at ? null : new Date().toISOString()

    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived_at: newArchive }),
      })
      if (res.ok) {
        setCourses((prev) =>
          prev.map((c) =>
            c.id === course.id ? { ...c, archived_at: newArchive } : c
          )
        )
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4">
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
        <span className="ml-auto text-xs text-mute-light">{filtered.length} khóa học</span>
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
          <p className="text-sm text-mute-light text-center py-10">Không tìm thấy khóa học nào</p>
        ) : (
          filtered.map((course) => (
            <div
              key={course.id}
              className={['grid grid-cols-[1fr_140px_140px_120px_120px] gap-4 items-center px-5 py-3.5 rounded-card text-sm', course.archived_at ? 'bg-surface-soft opacity-70' : 'bg-surface-card'].join(' ')}
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
                  loading={loading === course.id}
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
  )
}
