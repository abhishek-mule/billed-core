'use client'

import { cn } from '@/lib/utils'
import { forwardRef, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'

interface DropdownMenuProps {
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'end'
  className?: string
}

export function DropdownMenu({ trigger, children, align = 'end', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen(v => !v)}>{trigger}</div>

      {open && (
        <>
          <div className="fixed inset-0 z-[90] bg-transparent" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute z-[95] min-w-[180px] bg-card border border-border rounded-xl p-1 shadow-drawer animate-fade-scale-in',
              align === 'end' ? 'right-0' : 'left-0',
              'top-full mt-1',
              className,
            )}
            role="menu"
          >
            {children}
          </div>
        </>
      )}
    </div>
  )
}

interface DropdownMenuItemProps extends HTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  destructive?: boolean
}

export const DropdownMenuItem = forwardRef<HTMLButtonElement, DropdownMenuItemProps>(
  ({ className, icon, destructive, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        role="menuitem"
        className={cn(
          'flex w-full items-center gap-2 px-2.5 py-[7px] rounded text-xs font-medium transition-colors',
          destructive
            ? 'text-destructive hover:bg-destructive/10'
            : 'text-foreground hover:bg-secondary',
          className,
        )}
        {...props}
      >
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        {children}
      </button>
    )
  },
)
DropdownMenuItem.displayName = 'DropdownMenuItem'

interface DropdownMenuSeparatorProps extends HTMLAttributes<HTMLDivElement> {}

export const DropdownMenuSeparator = forwardRef<HTMLDivElement, DropdownMenuSeparatorProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('h-px bg-border my-[3px] mx-1.5', className)}
        {...props}
      />
    )
  },
)
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator'
