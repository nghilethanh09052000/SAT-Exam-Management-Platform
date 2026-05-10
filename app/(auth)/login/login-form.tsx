'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

// ─── Vietnamese error messages ───────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  account_disabled:
    'Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ giáo viên.',
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  invalid_login_credentials: 'Email hoặc mật khẩu không đúng.',
  device_limit:
    'Bạn đang đăng nhập trên một thiết bị khác. Vui lòng đăng xuất thiết bị đó trước.',
  no_code: 'Đăng nhập thất bại. Vui lòng thử lại.',
  access_denied: 'Bạn đã huỷ đăng nhập bằng Google.',
}

function getErrorMessage(code: string | null): string | null {
  if (!code) return null
  return ERROR_MESSAGES[code] ?? 'Đã có lỗi xảy ra. Vui lòng thử lại.'
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(getErrorMessage(errorParam))

  const supabase = createBrowserClient()

  // ── Email / password login (Admin & Teacher) ──────────────────────────────
  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError(
        getErrorMessage(signInError.message) ??
          getErrorMessage('invalid_credentials')!
      )
      setLoading(false)
      return
    }

    // Redirect to root — middleware will route by role
    router.push('/')
    router.refresh()
  }

  // ── Google OAuth login (Students) ─────────────────────────────────────────
  async function handleGoogleLogin() {
    setError(null)
    setGoogleLoading(true)

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })

    if (oauthError) {
      setError('Không thể kết nối Google. Vui lòng thử lại.')
      setGoogleLoading(false)
    }
    // On success the browser is redirected — no further action needed
  }

  return (
    <div className="space-y-5">
      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── Student section ─────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Học sinh
        </p>
        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {googleLoading ? (
            <Spinner />
          ) : (
            <GoogleIcon />
          )}
          Đăng nhập bằng Google
        </button>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-3 bg-white text-xs text-gray-400">
            hoặc dành cho giáo viên / admin
          </span>
        </div>
      </div>

      {/* ── Admin / Teacher section ──────────────────────────────── */}
      <form onSubmit={handleEmailLogin} className="space-y-3">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading || googleLoading}
            placeholder="giaovien@example.com"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-medium text-gray-700 mb-1">
            Mật khẩu
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading || googleLoading}
            placeholder="••••••••"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        <button
          type="submit"
          disabled={loading || googleLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Spinner white /> : null}
          Đăng nhập
        </button>
      </form>
    </div>
  )
}

// ─── Small icons ─────────────────────────────────────────────────────────────

function Spinner({ white }: { white?: boolean }) {
  return (
    <svg
      className={`animate-spin h-4 w-4 ${white ? 'text-white' : 'text-gray-500'}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}
