import { AlertTriangle, Info, AlertCircle, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"

type Severity = "info" | "warning" | "error"

interface ErrorStateProps {
  title?: string
  message: string
  severity?: Severity
  onRetry?: () => void
  retryLabel?: string
  action?: React.ReactNode
}

const SEVERITY = {
  info: {
    icon: Info,
    iconClass: "text-info bg-info-soft",
    ring: "border-info-soft",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-warning bg-warning-soft",
    ring: "border-warning-soft",
  },
  error: {
    icon: AlertCircle,
    iconClass: "text-danger bg-danger-soft",
    ring: "border-danger-soft",
  },
} as const

/**
 * One error surface for the whole product.
 * Not every failure is fatal — use `severity` to set the right tone.
 */
export function ErrorState({
  title,
  message,
  severity = "error",
  onRetry,
  retryLabel = "Try again",
  action,
}: ErrorStateProps) {
  const s = SEVERITY[severity]
  const Icon = s.icon
  return (
    <div className={cn("rounded-2xl border bg-card p-8 text-center", s.ring)}>
      <div className={cn("mx-auto flex h-12 w-12 items-center justify-center rounded-full", s.iconClass)}>
        <Icon className="h-6 w-6" />
      </div>
      {title && <p className="mt-4 text-base font-semibold text-foreground">{title}</p>}
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {(onRetry || action) && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all active:scale-[0.98]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {retryLabel}
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  )
}
