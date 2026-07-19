'use client'

import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface PageShellProps {
  children: ReactNode
  className?: string
  variant?: 'default' | 'narrow' | 'wide' | 'full'
  title?: string
  subtitle?: string
  action?: ReactNode
}

export function PageShell({
  children,
  className,
  variant = 'default',
  title,
  subtitle,
  action,
}: PageShellProps) {
  const variantClass = {
    default: '',
    narrow: 'page-shell--narrow',
    wide: 'page-shell--wide',
    full: 'page-shell--full',
  }[variant]

  return (
    <div className={cn('page-shell', variantClass, className)}>
      <div className="page-shell-main">
        {(title || action) && (
          <header className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              {title && <h1 className="text-xl font-bold tracking-tight">{title}</h1>}
              {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {action && <div className="mt-3 sm:mt-0">{action}</div>}
          </header>
        )}
        {children}
      </div>
    </div>
  )
}

export function PageShellHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3', className)}>
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="mt-3 sm:mt-0">{action}</div>}
    </header>
  )
}