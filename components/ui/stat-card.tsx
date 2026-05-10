import { Card } from './card'

interface StatCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  trend?: string
}

export function StatCard({ label, value, icon, trend }: StatCardProps) {
  return (
    <Card className="p-6 flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm text-mute-light font-medium">{label}</p>
        <p className="text-3xl font-display font-bold text-ink">{value}</p>
        {trend && <p className="text-xs text-mute-light">{trend}</p>}
      </div>
      {icon && (
        <div className="w-10 h-10 rounded-card bg-primary/10 flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
      )}
    </Card>
  )
}
