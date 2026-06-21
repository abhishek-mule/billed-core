'use client'

import { cn } from '@/lib/utils'
import { forwardRef, useEffect, useCallback, type HTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  fullscreen: 'max-w-[95vw] h-[95vh]',
}

interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean
  onClose: () => void
  size?: keyof typeof sizes
  title?: string
  description?: string
  showClose?: boolean
  children: ReactNode
}

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
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

    if (!open) return null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/40 animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            'relative z-10 w-full rounded-xl border border-border bg-card text-card-foreground shadow-xl animate-scale-in',
            sizes[size],
            className,
          )}
          {...props}
        >
          {(title || showClose) && (
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
              <div className="min-w-0 flex-1">
                {title && (
                  <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
                )}
                {description && (
                  <p className="mt-1 text-xs text-muted-foreground">{description}</p>
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
          )}
          <div className="px-6 pb-6 pt-3">{children}</div>
        </div>
      </div>
    )
  },
)

Modal.displayName = 'Modal'
