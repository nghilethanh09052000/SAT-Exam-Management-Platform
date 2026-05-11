import { Suspense } from 'react'
import Image from 'next/image'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas-dark">
      {/* Subtle blue glow backdrop */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md px-4">
        {/* Logo mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4">
            <Image src="/logo.jpg" alt="SAT Platform" width={56} height={56} className="rounded-full shadow-lg shadow-primary/30" priority />
          </div>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">
            SAT Platform
          </h1>
          <p className="text-sm text-on-dark-mute mt-1">Đăng nhập vào hệ thống</p>
        </div>

        {/* Card */}
        <div className="bg-surface-dark-card rounded-2xl border border-white/10 p-8 space-y-6 shadow-xl">
          <Suspense fallback={<div className="h-48 animate-pulse bg-white/5 rounded-lg" />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-xs text-on-dark-mute mt-6">
          © {new Date().getFullYear()} SAT Platform · Mọi quyền được bảo lưu
        </p>
      </div>
    </div>
  )
}
