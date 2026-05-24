import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border p-8 text-center", className)}>
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {description && (
        <div className="mt-1 text-xs text-muted-foreground max-w-xs">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
