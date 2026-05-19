interface CreateFlowShellProps {
  children: React.ReactNode
  className?: string
}

export function CreateFlowShell({ children, className = '' }: CreateFlowShellProps) {
  return (
    <div className={`relative isolate -m-4 min-h-[calc(100vh-3.5rem)] overflow-hidden px-4 py-6 md:-m-8 md:min-h-screen md:px-8 md:py-8 ${className}`}>
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_10%,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_84%_20%,rgba(168,85,247,0.16),transparent_30%),radial-gradient(circle_at_62%_92%,rgba(16,185,129,0.12),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 -z-20 bg-gradient-to-br from-blue-50 via-violet-50/80 to-emerald-50/60" />
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-48 w-[70%] -translate-x-1/2 rounded-full bg-white/50 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-24 -z-10 h-56 w-56 rounded-full bg-fuchsia-200/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-24 -z-10 h-64 w-64 rounded-full bg-cyan-200/35 blur-3xl" />

      <div className="relative">{children}</div>
    </div>
  )
}
