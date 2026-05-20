'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { LoadingSpinner } from '@/components/ui/loading'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'commerce' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-primary hover:bg-primary-pressed active:bg-primary-active text-white',
  secondary:
    'bg-surface-card hover:bg-surface-soft border border-ash-light text-ink',
  commerce:
    'bg-commerce hover:bg-commerce-pressed text-white',
  ghost:
    'bg-transparent hover:bg-surface-soft text-ink',
  danger:
    'bg-warning hover:bg-red-700 text-white',
}

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-12 px-7 text-base font-bold',
  lg: 'h-14 px-8 text-lg font-bold',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center justify-center gap-2 rounded-full font-display transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(' ')}
        {...props}
      >
        {loading && <LoadingSpinner className="h-4 w-4 shrink-0" />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
