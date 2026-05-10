import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-ink"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={[
            'h-10 w-full rounded-[6px] border px-3 text-sm text-ink',
            'bg-canvas-light placeholder:text-ash-light',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-soft',
            error
              ? 'border-warning'
              : 'border-ash-light',
            className,
          ].join(' ')}
          {...props}
        />
        {error && (
          <p className="text-xs text-warning">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          className={[
            'w-full rounded-[6px] border px-3 py-2 text-sm text-ink',
            'bg-canvas-light placeholder:text-ash-light resize-none',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-soft',
            error ? 'border-warning' : 'border-ash-light',
            className,
          ].join(' ')}
          {...props}
        />
        {error && <p className="text-xs text-warning">{error}</p>}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
