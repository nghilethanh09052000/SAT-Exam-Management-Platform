interface ProgressStep {
  n: number
  label: string
}

interface ProgressStepperProps {
  steps: ProgressStep[]
  currentStep: number
  className?: string
  onStepClick?: (step: number) => void
}

export function ProgressStepper({
  steps,
  currentStep,
  className = '',
  onStepClick,
}: ProgressStepperProps) {
  return (
    <div className={`relative mb-8 overflow-hidden rounded-3xl border border-white/80 bg-gradient-to-br from-white via-blue-50/70 to-violet-50/80 px-5 py-5 shadow-xl shadow-blue-500/5 backdrop-blur-sm ${className}`}>
      <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-blue-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-violet-300/20 blur-3xl" />

      <div className="relative flex min-w-0 items-start">
        {steps.map((step, index) => {
          const done = currentStep > step.n
          const active = currentStep === step.n
          const enabled = Boolean(onStepClick && step.n < currentStep)
          const tone = STEP_TONES[index % STEP_TONES.length]
          const dotCls = done
            ? 'bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-emerald-500/30'
            : active
              ? `${tone.dot} text-white ${tone.shadow}`
              : `${tone.idle} ${tone.text} shadow-slate-200/60`
          const labelCls = active
            ? tone.textStrong
            : done
              ? 'text-emerald-700'
              : 'text-slate-500'

          return (
            <div key={step.n} className="flex min-w-0 flex-1 items-start">
              <button
                type="button"
                disabled={!enabled}
                onClick={() => enabled && onStepClick?.(step.n)}
                className={[
                  'group flex min-w-[92px] flex-col items-center gap-3 text-center outline-none',
                  enabled ? 'cursor-pointer' : 'cursor-default',
                ].join(' ')}
              >
                <span
                  className={[
                    'relative flex h-12 w-12 items-center justify-center rounded-full text-sm font-black shadow-lg ring-4 ring-white/80 transition-all duration-300',
                    dotCls,
                    enabled ? 'group-hover:-translate-y-0.5 group-hover:scale-105' : '',
                  ].join(' ')}
                >
                  {(active || done) && (
                    <span className={`absolute inset-0 -z-10 rounded-full blur-md ${done ? 'bg-emerald-400/40' : tone.glow}`} />
                  )}
                  {done ? (
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.6} className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.n
                  )}
                </span>
                <span className={`text-sm font-bold transition-colors ${labelCls}`}>
                  {step.label}
                </span>
              </button>

              {index < steps.length - 1 && (
                <div className="mx-3 mt-[23px] h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-white shadow-inner ring-1 ring-slate-200/70">
                  <div
                    className={[
                      'h-full rounded-full transition-all duration-700',
                      currentStep > step.n
                        ? 'w-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400'
                        : active
                          ? `w-1/2 ${tone.bar}`
                          : 'w-0 bg-transparent',
                    ].join(' ')}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const STEP_TONES = [
  {
    dot: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    bar: 'bg-gradient-to-r from-blue-500 to-indigo-500',
    idle: 'bg-blue-50',
    text: 'text-blue-500',
    textStrong: 'text-blue-700',
    shadow: 'shadow-blue-500/30',
    glow: 'bg-blue-400/40',
  },
  {
    dot: 'bg-gradient-to-br from-violet-500 to-fuchsia-600',
    bar: 'bg-gradient-to-r from-violet-500 to-fuchsia-500',
    idle: 'bg-violet-50',
    text: 'text-violet-500',
    textStrong: 'text-violet-700',
    shadow: 'shadow-violet-500/30',
    glow: 'bg-violet-400/40',
  },
  {
    dot: 'bg-gradient-to-br from-amber-400 to-orange-600',
    bar: 'bg-gradient-to-r from-amber-400 to-orange-500',
    idle: 'bg-amber-50',
    text: 'text-amber-600',
    textStrong: 'text-orange-700',
    shadow: 'shadow-orange-500/30',
    glow: 'bg-amber-400/40',
  },
  {
    dot: 'bg-gradient-to-br from-emerald-400 to-teal-600',
    bar: 'bg-gradient-to-r from-emerald-400 to-teal-500',
    idle: 'bg-emerald-50',
    text: 'text-emerald-600',
    textStrong: 'text-emerald-700',
    shadow: 'shadow-emerald-500/30',
    glow: 'bg-emerald-400/40',
  },
]
