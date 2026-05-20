type LoadingSpinnerProps = {
  className?: string
  label?: string
}

type LoadingPageProps = {
  label?: string
  className?: string
}

export function LoadingSpinner({
  className = 'h-5 w-5',
  label = 'Đang tải',
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

export function LoadingPage({
  label = 'Đang tải dữ liệu',
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
