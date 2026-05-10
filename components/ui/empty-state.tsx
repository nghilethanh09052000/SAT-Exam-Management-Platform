interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      {icon && (
        <div className="w-16 h-16 rounded-full bg-surface-soft flex items-center justify-center text-mute-light">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="font-display font-semibold text-ink">{title}</p>
        {description && (
          <p className="text-sm text-mute-light max-w-xs">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
