'use client'

interface TestLayoutProps {
  children: React.ReactNode
}

export function TestLayout({ children }: TestLayoutProps) {
  return (
    <div className="relative flex h-[calc(100vh-7.5rem)] min-h-[620px] w-full flex-col overflow-hidden rounded-[28px] border border-white/80 bg-canvas-light shadow-2xl shadow-blue-100/70 lg:h-[calc(100vh-4.5rem)]">
      {children}
    </div>
  )
}
