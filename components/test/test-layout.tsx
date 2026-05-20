'use client'

import type { SyntheticEvent } from 'react'

interface TestLayoutProps {
  children: React.ReactNode
}

export function TestLayout({ children }: TestLayoutProps) {
  const blockCopy = (event: SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      className="bluebook-secure fixed inset-0 z-[9999] flex h-dvh w-screen flex-col overflow-hidden bg-white text-black"
      data-testid="bluebook-fullscreen"
      onContextMenu={blockCopy}
      onCopy={blockCopy}
      onCut={blockCopy}
      onDragStart={blockCopy}
      onSelect={blockCopy}
    >
      {children}
    </div>
  )
}
