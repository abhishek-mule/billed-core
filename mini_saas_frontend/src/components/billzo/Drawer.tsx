'use client'

import { cn } from '@/lib/utils'
import { forwardRef, useEffect, useCallback, type HTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
}

interface DrawerProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean
  onClose: () => void
  size?: keyof typeof sizes
  title?: string
  description?: string
  showClose?: boolean
  children: ReactNode
}

export const Drawer = forwardRef<HTMLDivElement, DrawerProps>(
  (
    {
      className,
      open,
      onClose,
      size = 'md',
      title,
      description,
      showClose = true,
      children,
      ...props
    },
    ref,
  ) => {
    const handleEscape = useCallback(
      (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      },
      [onClose],
    )

    useEffect(() => {
      if (!open) return
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
      return () => {
        document.removeEventListener('keydown', handleEscape)
        document.body.style.overflow = ''
      }
    }, [open, handleEscape])

    return (
      <>
        {open && (
          <div
            className="fixed inset-0 z-40 bg-black/20 animate-fade-in"
            onClick={onClose}
            aria-hidden="true"
          />
        )}

        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            'fixed top-0 right-0 z-50 h-full w-full border-l border-border bg-card text-card-foreground shadow-drawer transform transition-transform duration-200 ease-out',
            open ? 'translate-x-0' : 'translate-x-full',
            sizes[size],
            className,
          )}
          {...props}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                {title && (
                  <h2 className="text-base font-bold text-card-foreground">{title}</h2>
                )}
                {description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                )}
              </div>
              {showClose && (
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin">{children}</div>
          </div>
        </div>
      </>
    )
  },
)

Drawer.displayName = 'Drawer'
