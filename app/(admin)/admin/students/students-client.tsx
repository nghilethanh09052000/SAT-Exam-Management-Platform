'use client'

import { useState } from 'react'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Student {
  id: string
  full_name: string
  phone: string | null
  is_active: boolean
  created_at: string
}

interface AdminStudentsClientProps {
  students: Student[]
}

export function AdminStudentsClient({ students: initial }: AdminStudentsClientProps) {
  const [students, setStudents] = useState(initial)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState<string | null>(null)

  const filtered = students.filter((s) =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone ?? '').includes(search)
  )

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
          prev.map((s) =>
            s.id === student.id ? { ...s, is_active: !s.is_active } : s
          )
        )
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Tìm kiếm theo tên hoặc số điện thoại..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <DataTable
        columns={[
          { key: 'full_name', header: 'Họ tên' },
          {
            key: 'phone',
            header: 'Điện thoại',
            render: (row) => (row.phone as string | null) ?? '—',
          },
          {
            key: 'is_active',
            header: 'Trạng thái',
            render: (row) =>
              row.is_active ? (
                <Badge variant="success">Đang hoạt động</Badge>
              ) : (
                <Badge variant="error">Đã vô hiệu</Badge>
              ),
          },
          {
            key: 'created_at',
            header: 'Ngày đăng ký',
            render: (row) =>
              new Date(String(row.created_at)).toLocaleDateString('vi-VN'),
          },
          {
            key: 'actions',
            header: 'Thao tác',
            render: (row) => {
              const student = students.find((s) => s.id === row.id)!
              return (
                <Button
                  variant={student.is_active ? 'danger' : 'secondary'}
                  size="sm"
                  loading={loading === student.id}
                  onClick={() => toggleActive(student)}
                >
                  {student.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}
                </Button>
              )
            },
          },
        ]}
        data={filtered as unknown as Record<string, unknown>[]}
        keyField="id"
        emptyMessage="Không tìm thấy học sinh nào"
      />
    </div>
  )
}
