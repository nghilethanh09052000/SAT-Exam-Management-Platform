import { Suspense } from 'react'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              SAT Platform
            </h1>
            <p className="text-sm text-gray-500">Đăng nhập vào hệ thống</p>
          </div>

          {/* Suspense required for useSearchParams() in Next.js 14 */}
          <Suspense fallback={<div className="h-48 animate-pulse bg-gray-50 rounded-lg" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
