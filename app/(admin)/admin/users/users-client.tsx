'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

export interface StaffAccount {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: 'admin' | 'teacher'
  is_active: boolean
  created_at: string
  last_sign_in_at: string | null
}

interface Props {
  users: StaffAccount[]
}

const ROLE_LABEL = {
  admin: 'Admin',
  teacher: 'Giáo viên',
} as const

const ROLE_BADGE = {
  admin: 'border-violet-200 bg-violet-50 text-violet-700',
  teacher: 'border-blue-200 bg-blue-50 text-blue-700',
} as const

export function AdminUsersClient({ users: initial }: Props) {
  const [users, setUsers] = useState(initial)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'teacher'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: 'teacher' as 'admin' | 'teacher',
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return users.filter((user) => {
      const matchesRole = roleFilter === 'all' || user.role === roleFilter
      const matchesSearch =
        !term ||
        user.full_name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        (user.phone ?? '').includes(term)
      return matchesRole && matchesSearch
    })
  }, [users, search, roleFilter])

  const counts = {
    all: users.length,
    admin: users.filter((user) => user.role === 'admin').length,
    teacher: users.filter((user) => user.role === 'teacher').length,
    active: users.filter((user) => user.is_active).length,
  }

  function resetCreate() {
    setForm({ full_name: '', email: '', password: '', phone: '', role: 'teacher' })
    setError(null)
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          phone: form.phone.trim() || null,
        }),
      })
      const json: { data?: StaffAccount | null; error?: string | null } = await res.json()
      if (!res.ok || !json.data) {
        setError(json.error ?? 'Không thể tạo tài khoản.')
        return
      }
      setUsers((prev) => [json.data!, ...prev])
      setShowCreate(false)
      resetCreate()
      setSuccess(`Đã tạo tài khoản ${ROLE_LABEL[json.data.role]} cho ${json.data.full_name}.`)
    } catch {
      setError('Lỗi kết nối, vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  async function updateUser(user: StaffAccount, patch: Partial<Pick<StaffAccount, 'role' | 'is_active' | 'full_name' | 'phone'>>) {
    setLoadingId(user.id)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json: { data?: Partial<StaffAccount> | null; error?: string | null } = await res.json()
      if (!res.ok || !json.data) {
        setError(json.error ?? 'Không thể cập nhật tài khoản.')
        return
      }
      setUsers((prev) => prev.map((item) => item.id === user.id ? { ...item, ...json.data } : item))
      setSuccess('Đã cập nhật phân quyền.')
    } catch {
      setError('Lỗi kết nối, vui lòng thử lại.')
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Tổng tài khoản" value={counts.all} color="from-blue-500 to-indigo-600" />
        <Metric label="Admin" value={counts.admin} color="from-violet-500 to-fuchsia-600" />
        <Metric label="Giáo viên" value={counts.teacher} color="from-emerald-400 to-teal-600" />
        <Metric label="Đang hoạt động" value={counts.active} color="from-amber-400 to-orange-600" />
      </div>

      <div className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo tên, email hoặc SĐT..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              ['all', 'Tất cả'],
              ['admin', 'Admin'],
              ['teacher', 'Giáo viên'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setRoleFilter(value as 'all' | 'admin' | 'teacher')}
                className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${roleFilter === value ? 'bg-ink text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {label}
              </button>
            ))}
            <Button onClick={() => { resetCreate(); setShowCreate(true) }}>+ Tạo tài khoản</Button>
          </div>
        </div>
      </div>

      {error && <Notice tone="error" message={error} />}
      {success && <Notice tone="success" message={success} />}

      <div className="overflow-hidden rounded-3xl border border-white/70 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-[minmax(220px,1.5fr)_minmax(220px,1.5fr)_130px_130px_160px_220px] border-b border-slate-100 bg-slate-50 px-5 py-3">
            {['Tài khoản', 'Email', 'Vai trò', 'Trạng thái', 'Đăng nhập cuối', 'Phân quyền'].map((header) => (
              <span key={header} className="pr-3 text-xs font-black uppercase tracking-wide text-slate-400">{header}</span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm font-medium text-mute-light">Không tìm thấy tài khoản phù hợp.</div>
          ) : (
            <ul className="min-w-[980px] divide-y divide-slate-50">
              {filtered.map((user, index) => (
                <li key={user.id} className="grid grid-cols-[minmax(220px,1.5fr)_minmax(220px,1.5fr)_130px_130px_160px_220px] items-center px-5 py-4 transition-colors hover:bg-slate-50/70" style={{ animationDelay: `${index * 25}ms` }}>
                  <div className="flex min-w-0 items-center gap-3 pr-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${user.role === 'admin' ? 'from-violet-500 to-fuchsia-600' : 'from-blue-500 to-indigo-600'} text-sm font-black text-white shadow-lg`}>
                      {user.full_name[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-ink">{user.full_name}</p>
                      <p className="truncate text-xs font-medium text-mute-light">{user.phone || '—'}</p>
                    </div>
                  </div>
                  <span className="truncate pr-3 text-sm font-medium text-slate-600">{user.email || '—'}</span>
                  <div className="pr-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${ROLE_BADGE[user.role]}`}>{ROLE_LABEL[user.role]}</span>
                  </div>
                  <div className="pr-3">
                    <button
                      disabled={loadingId === user.id}
                      onClick={() => updateUser(user, { is_active: !user.is_active })}
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black transition-all disabled:opacity-50 ${user.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      {user.is_active ? 'Hoạt động' : 'Vô hiệu'}
                    </button>
                  </div>
                  <span className="pr-3 text-xs font-medium text-mute-light">
                    {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('vi-VN') : 'Chưa đăng nhập'}
                  </span>
                  <div className="flex items-center gap-2 pr-3">
                    <select
                      value={user.role}
                      disabled={loadingId === user.id}
                      onChange={(event) => updateUser(user, { role: event.target.value as 'admin' | 'teacher' })}
                      className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                    >
                      <option value="teacher">Giáo viên</option>
                      <option value="admin">Admin</option>
                    </select>
                    {loadingId === user.id && <Spinner />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Modal open={showCreate} title="Tạo tài khoản admin / giáo viên" onClose={() => setShowCreate(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">Vai trò</label>
            <div className="grid grid-cols-2 gap-2">
              {(['teacher', 'admin'] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, role }))}
                  className={`rounded-2xl border px-4 py-3 text-left transition-all ${form.role === role ? ROLE_BADGE[role] + ' shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  <p className="text-sm font-black">{ROLE_LABEL[role]}</p>
                  <p className="mt-1 text-xs font-medium opacity-70">{role === 'admin' ? 'Toàn quyền hệ thống' : 'Quản lý lớp, bài tập, câu hỏi'}</p>
                </button>
              ))}
            </div>
          </div>
          <Field label="Họ tên" value={form.full_name} onChange={(value) => setForm((prev) => ({ ...prev, full_name: value }))} required />
          <Field label="Email" type="email" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} required />
          <Field label="Mật khẩu tạm thời" type="password" value={form.password} onChange={(value) => setForm((prev) => ({ ...prev, password: value }))} required placeholder="Tối thiểu 8 ký tự" />
          <Field label="Số điện thoại" value={form.phone} onChange={(value) => setForm((prev) => ({ ...prev, phone: value }))} />
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Hủy</Button>
            <Button type="submit" loading={saving}>Tạo tài khoản</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-3xl bg-gradient-to-br ${color} p-5 text-white shadow-xl shadow-blue-500/10`}>
      <p className="text-sm font-bold text-white/75">{label}</p>
      <p className="mt-2 text-4xl font-black leading-none">{value}</p>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-500">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition-all focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
      />
    </label>
  )
}

function Notice({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
      {message}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-mute-light" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
