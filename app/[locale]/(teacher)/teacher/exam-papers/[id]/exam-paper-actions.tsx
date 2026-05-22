'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function ExamPaperActions({ paperId }: { paperId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleArchive() {
    setLoading(true)
    try {
      const res = await fetch(`/api/exam-papers/${paperId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.error) {
        router.push('/teacher/exam-papers')
        router.refresh()
      }
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-warning font-medium">Xóa đề thi này?</span>
        <Button size="sm" variant="danger" loading={loading} onClick={handleArchive}>
          Xác nhận
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Hủy
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Link href={`/teacher/exam-papers/${paperId}/edit`}>
        <Button size="sm" variant="secondary">Chỉnh sửa</Button>
      </Link>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-warning">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </Button>
    </div>
  )
}
