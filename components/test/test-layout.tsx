'use client'

interface TestLayoutProps {
  children: React.ReactNode
}

export function TestLayout({ children }: TestLayoutProps) {
  return (
    <div className="fixed inset-0 flex flex-col bg-canvas-light overflow-hidden">
      {children}
    </div>
  )
}
