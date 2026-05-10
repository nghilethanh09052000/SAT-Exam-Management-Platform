'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'

interface Week {
  id: string
  title: string
  order: number
}

interface Instance {
  id: string
  week_id: string
  deadline: string
  published_at: string | null
  title: string
}

interface ClassDetailClientProps {
  classId: string
  courseId: string
  weeks: Week[]
  instances: Instance[]
}

export function ClassDetailClient({
  classId,
  courseId,
  weeks: initialWeeks,
  instances: initialInstances,
}: ClassDetailClientProps) {
  const [weeks, setWeeks] = useState(initialWeeks)
  const [instances, setInstances] = useState(initialInstances)
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set())
  const [addingWeek, setAddingWeek] = useState(false)
  const [newWeekTitle, setNewWeekTitle] = useState('')
  const [weekLoading, setWeekLoading] = useState(false)

  function toggleWeek(id: string) {
    setOpenWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function createWeek() {
    if (!newWeekTitle.trim()) return
    setWeekLoading(true)
    try {
      const res = await fetch('/api/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId,
          title: newWeekTitle.trim(),
          order: weeks.length + 1,
        }),
      })
      const json = await res.json()
      if (!json.error) {
        setWeeks((prev) => [...prev, json.data])
        setNewWeekTitle('')
        setAddingWeek(false)
      }
    } finally {
      setWeekLoading(false)
    }
  }

  const now = new Date().toISOString()

  return (
    <div className="space-y-4">
      {/* Add week button */}
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-ink">Danh sách tuần học</h2>
        <Button size="sm" onClick={() => setAddingWeek(true)}>
          Thêm tuần
        </Button>
      </div>

      {/* Add week inline form */}
      {addingWeek && (
        <Card className="p-4 flex items-center gap-3">
          <Input
            placeholder="Tên tuần học..."
            value={newWeekTitle}
            onChange={(e) => setNewWeekTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createWeek()}
            className="flex-1"
          />
          <Button size="sm" loading={weekLoading} onClick={createWeek}>
            Lưu
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAddingWeek(false)
              setNewWeekTitle('')
            }}
          >
            Hủy
          </Button>
        </Card>
      )}

      {weeks.length === 0 && !addingWeek ? (
        <EmptyState
          title="Chưa có tuần học nào"
          description="Thêm tuần học để tổ chức bài tập"
          action={
            <Button size="sm" onClick={() => setAddingWeek(true)}>
              Thêm tuần học
            </Button>
          }
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-2">
          {weeks.map((week) => {
            const weekInstances = instances.filter((i) => i.week_id === week.id)
            const isOpen = openWeeks.has(week.id)

            return (
              <div key={week.id} className="border border-hairline-light rounded-card overflow-hidden">
                {/* Week header */}
                <button
                  onClick={() => toggleWeek(week.id)}
                  className="w-full flex items-center justify-between px-5 py-3.5 bg-canvas-light hover:bg-surface-soft transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`w-4 h-4 text-mute-light transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="font-medium text-ink">{week.title}</span>
                  </div>
                  <Badge variant="muted">{weekInstances.length} bài tập</Badge>
                </button>

                {/* Week content */}
                {isOpen && (
                  <div className="bg-surface-soft border-t border-hairline-light p-4 space-y-2">
                    {weekInstances.length === 0 ? (
                      <p className="text-sm text-mute-light text-center py-3">
                        Chưa có bài tập nào trong tuần này
                      </p>
                    ) : (
                      weekInstances.map((inst) => {
                        const isExpired = inst.deadline < now
                        const isPublished = !!inst.published_at

                        return (
                          <div
                            key={inst.id}
                            className="flex items-center justify-between gap-4 px-4 py-3 bg-canvas-light rounded-[6px]"
                          >
                            <div>
                              <p className="font-medium text-sm text-ink">{inst.title}</p>
                              <p className="text-xs text-mute-light mt-0.5">
                                Hạn nộp:{' '}
                                {new Date(inst.deadline).toLocaleDateString('vi-VN', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {isExpired ? (
                                <Badge variant="muted">Đã hết hạn</Badge>
                              ) : isPublished ? (
                                <Badge variant="success">Đã xuất bản</Badge>
                              ) : (
                                <Badge variant="warning">Chưa xuất bản</Badge>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
