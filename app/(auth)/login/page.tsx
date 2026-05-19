import { Suspense } from 'react'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#f7f8fb] p-0 text-ink md:p-4">
      <div className="relative min-h-screen overflow-hidden bg-white shadow-[0_24px_90px_rgba(15,23,42,0.08)] md:min-h-[calc(100vh-2rem)] md:rounded-[32px] md:border md:border-slate-200">
        <Suspense fallback={<div className="h-screen animate-pulse bg-slate-100" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
