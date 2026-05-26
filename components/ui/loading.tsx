type LoadingSpinnerProps = {
  className?: string
  label?: string
}

type LoadingInlineProps = {
  label: string
  className?: string
  spinnerClassName?: string
}

type LoadingOverlayProps = {
  label?: string
  className?: string
  spinnerClassName?: string
}

type LoadingPageProps = {
  label?: string
  className?: string
}

export function LoadingSpinner({
  className = 'h-5 w-5',
  label = 'Loading',
}: LoadingSpinnerProps) {
  return (
    <span className="inline-flex items-center justify-center" role="status" aria-label={label}>
      <svg
        className={`animate-spin ${className}`}
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function LoadingInline({
  label,
  className = 'flex items-center gap-2 text-sm text-mute-light',
  spinnerClassName = 'h-4 w-4',
}: LoadingInlineProps) {
  return (
    <div className={className} role="status" aria-live="polite">
      <LoadingSpinner className={spinnerClassName} label={label} />
      <span>{label}</span>
    </div>
  )
}

export function LoadingBlock({
  label = 'Loading data',
  className = 'py-8',
  spinnerClassName = 'h-5 w-5',
}: LoadingOverlayProps) {
  return (
    <div className={`flex items-center justify-center text-center ${className}`}>
      <LoadingInline
        label={label}
        className="inline-flex items-center justify-center gap-2 text-sm text-mute-light"
        spinnerClassName={spinnerClassName}
      />
    </div>
  )
}

export function LoadingOverlay({
  label = 'Loading',
  className = 'bg-black/40 text-white',
  spinnerClassName = 'h-8 w-8',
}: LoadingOverlayProps) {
  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-sm ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-3">
        <LoadingSpinner className={spinnerClassName} label={label} />
        <span className="text-sm text-current/70">{label}...</span>
      </div>
    </div>
  )
}

export function LoadingPage({
  label = 'Loading data',
  className = '',
}: LoadingPageProps) {
  return (
    <div className={`flex min-h-[320px] items-center justify-center ${className}`}>
      <div className="flex flex-col items-center gap-4 text-center text-mute-light">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/15 bg-white/85 text-primary shadow-sm">
          <LoadingSpinner className="h-7 w-7" label={label} />
        </div>
        <p className="font-display text-sm font-semibold">{label}</p>
      </div>
    </div>
  )
}
