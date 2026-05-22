'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

export default function NewCoursePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    start_date: '',
    end_date: '',
    expires_at: '',
  })

  function handleChange(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  function validate(): string | null {
    if (!form.title.trim()) return 'Vui lòng nhập tên khóa học.'
    if (!form.start_date) return 'Vui lòng chọn ngày bắt đầu.'
    if (!form.end_date) return 'Vui lòng chọn ngày kết thúc.'
    if (form.start_date >= form.end_date) return 'Ngày kết thúc phải sau ngày bắt đầu.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
      }
      if (form.expires_at) body.expires_at = new Date(form.expires_at).toISOString()

      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      let json: { data?: { id: string; title: string } | null; error?: string | null }
      try {
        json = await res.json()
      } catch {
        setError('Server trả về phản hồi không hợp lệ. Vui lòng thử lại.')
        return
      }

      if (!res.ok || json.error) {
        setError(json.error ?? `Lỗi ${res.status}. Vui lòng thử lại.`)
        return
      }

      if (!json.data?.id) {
        setError('Tạo khóa học thất bại. Vui lòng thử lại.')
        return
      }

      router.push(`/teacher/courses/${json.data.id}`)
      router.refresh()
    } catch (err) {
      console.error('Create course error:', err)
      setError('Đã có lỗi xảy ra. Vui lòng kiểm tra kết nối và thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader
        title="Tạo khóa học mới"
        breadcrumbs={[
          { label: 'Khóa học', href: '/teacher/courses' },
          { label: 'Tạo mới' },
        ]}
      />

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <Input
            label="Tên khóa học *"
            placeholder="Ví dụ: SAT Spring 2025 — Intensive"
            value={form.title}
            onChange={(e) => handleChange('title', e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Ngày bắt đầu *"
              type="date"
              value={form.start_date}
              onChange={(e) => handleChange('start_date', e.target.value)}
            />
            <Input
              label="Ngày kết thúc *"
              type="date"
              value={form.end_date}
              onChange={(e) => handleChange('end_date', e.target.value)}
            />
          </div>

          <div>
            <Input
              label="Hạn truy cập (tùy chọn)"
              type="datetime-local"
              value={form.expires_at}
              onChange={(e) => handleChange('expires_at', e.target.value)}
            />
            <p className="text-xs text-mute-light mt-1">
              Sau ngày này, học sinh sẽ không còn truy cập được khóa học.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" loading={loading}>
              Tạo khóa học
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
            >
              Hủy
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
