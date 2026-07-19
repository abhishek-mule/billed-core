import { cn } from "@/lib/utils"

/** Composable loading primitives. Compose, don't specialize per page. */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />
}

export function SkeletonAvatar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-full bg-muted h-10 w-10 flex-shrink-0", className)} />
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  )
}

export function SkeletonCard({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card shadow-sm p-5", className)}>
      <div className="flex items-center gap-3 mb-4">
        <SkeletonAvatar />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonText lines={lines} />
    </div>
  )
}
