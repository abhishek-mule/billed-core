import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        className
      )}
    />
  )
}

/** A full stat card skeleton */
export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-4 w-14 rounded-full" />
      </div>
      <Skeleton className="h-4 w-24 mt-1" />
      <Skeleton className="h-7 w-32" />
    </div>
  )
}

/** A table row skeleton */
export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <Skeleton className={`h-4 ${i === 0 ? 'w-32' : i === cols - 1 ? 'w-12' : 'w-24'}`} />
        </td>
      ))}
    </tr>
  )
}

/** Multiple table row skeletons */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} cols={cols} />
      ))}
    </>
  )
}

/** A list item skeleton (for dashboard recent invoices) */
export function ListItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="text-right space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3 w-12 ml-auto" />
      </div>
    </div>
  )
}

/** A product card grid skeleton */
export function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col items-center gap-3">
      <Skeleton className="h-12 w-12 rounded-xl" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-3 w-16" />
    </div>
  )
}

/** Hero/revenue card skeleton */
export function HeroSkeleton() {
  return (
    <div className="rounded-2xl bg-muted p-6 lg:p-8 animate-pulse">
      <Skeleton className="h-4 w-28 bg-muted-foreground/20 mb-3" />
      <Skeleton className="h-14 w-48 bg-muted-foreground/20 mb-3" />
      <Skeleton className="h-4 w-40 bg-muted-foreground/20" />
    </div>
  )
}
