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
  not_registered: 'Email của bạn chưa được đăng ký trong hệ thống.',
}

function getErrorMessage(code: string | null): string | null {
  if (!code) return null
  return ERROR_MESSAGES[code] ?? 'Đã có lỗi xảy ra. Vui lòng thử lại.'
}

// ─── Shared input class ───────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2.5 text-sm bg-white/5 border border-white/15 rounded-lg text-white placeholder:text-on-dark-mute focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

const labelCls = 'block text-xs font-medium text-on-dark-mute mb-1.5'

// ─── Component ───────────────────────────────────────────────────────────────

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    errorParam === 'not_registered' ? null : getErrorMessage(errorParam)
  )
  const [showNotRegistered, setShowNotRegistered] = useState(
    errorParam === 'not_registered'
  )

  const supabase = createBrowserClient()
  const showLocalStudentQaLogin =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('127.0.0.1')

  // ── Email / password login (Admin & Teacher only) ────────────────────────
  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
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

    // Guard: students must use Google — block them even if they somehow
    // have a password set (e.g. via Supabase Studio or "forgot password").
    const role = data.user?.user_metadata?.role as string | undefined
    if (role === 'student') {
      await supabase.auth.signOut()
      setError('Học sinh vui lòng đăng nhập bằng Google bên trên.')
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
    setShowNotRegistered(false)
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

  // ── Local QA helper (development only) ───────────────────────────────────
  async function handleLocalStudentQaLogin() {
    setError(null)
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: 'student1@gmail.com',
      password: 'password123',
    })

    if (signInError) {
      setError('Không thể đăng nhập tài khoản học sinh thử nghiệm.')
      setLoading(false)
      return
    }

    router.push('/student')
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {/* ── Not-registered dialog (prominent) ───────────────────── */}
      {showNotRegistered && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-amber-400 shrink-0">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-300">
                Email chưa được đăng ký
              </p>
              <p className="mt-1 text-sm text-amber-200/80">
                Tài khoản Google của bạn chưa có trong danh sách học sinh.
                Vui lòng liên hệ giáo viên hoặc quản trị viên để được thêm vào hệ thống.
              </p>
            </div>
            <button
              onClick={() => setShowNotRegistered(false)}
              className="shrink-0 text-amber-400/60 hover:text-amber-300 transition-colors"
              aria-label="Đóng"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Generic error banner */}
      {error && !showNotRegistered && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* ── Student section ─────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-on-dark-mute uppercase tracking-wider">
          Học sinh
        </p>
        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-white/15 rounded-lg text-sm font-medium text-white bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {googleLoading ? (
            <Spinner />
          ) : (
            <GoogleIcon />
          )}
          Đăng nhập bằng Google
        </button>
        {showLocalStudentQaLogin && (
          <button
            onClick={handleLocalStudentQaLogin}
            disabled={googleLoading || loading}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-on-dark-mute border border-dashed border-white/20 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Đăng nhập học sinh thử nghiệm
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-3 bg-surface-dark-card text-xs text-on-dark-mute">
            hoặc dành cho giáo viên / admin
          </span>
        </div>
      </div>

      {/* ── Admin / Teacher section ──────────────────────────────── */}
      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className={labelCls}>
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
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="password" className={labelCls}>
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
            className={inputCls}
          />
        </div>

        <button
          type="submit"
          disabled={loading || googleLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/25"
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
      className={`animate-spin h-4 w-4 ${white ? 'text-white' : 'text-on-dark-mute'}`}
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
