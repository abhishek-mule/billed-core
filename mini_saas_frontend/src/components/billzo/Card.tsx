import { cn } from "@/lib/utils"
import { HTMLAttributes, ReactNode } from "react"

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Removes inner padding when you want to compose your own layout */
  bare?: boolean
}

/**
 * The single card primitive for the whole product.
 * One radius (16px / rounded-2xl), one shadow (shadow-sm), one border.
 * Keep this dumb — it only owns visual framing, never layout logic.
 */
export function Card({ children, className, bare, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-sm",
        !bare && "p-5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-between mb-4 gap-3", className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-sm font-semibold text-foreground", className)} {...props}>
      {children}
    </h3>
  )
}

export function CardDescription({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)} {...props}>
      {children}
    </p>
  )
}

export function CardContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("pt-4", className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-2 pt-4 border-t border-border", className)} {...props}>
      {children}
    </div>
  )
}
