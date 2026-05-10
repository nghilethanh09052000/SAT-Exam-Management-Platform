import { type HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'light' | 'dark'
}

export function Card({
  variant = 'light',
  className = '',
  children,
  ...props
}: CardProps) {
  const base =
    variant === 'dark'
      ? 'bg-surface-dark-card text-on-dark'
      : 'bg-surface-card text-ink'

  return (
    <div
      className={['rounded-card', base, className].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
