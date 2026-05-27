interface CreateFlowShellProps {
  children: React.ReactNode
  className?: string
}

export function CreateFlowShell({ children, className = '' }: CreateFlowShellProps) {
  return (
    <div
      className={`-m-4 min-h-[calc(100vh-3.5rem)] bg-slate-50 px-4 py-6 md:-m-8 md:min-h-screen md:px-8 md:py-8 ${className}`}
    >
      {children}
    </div>
  )
}
