'use client'

import Link from 'next/link'
import {
  Activity,
  BarChart3,
  Home,
  LogOut,
  Package,
  Receipt,
  Settings,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
// ─── Nav model (BillZo routes — do not rename/remove without product sign-off) ─

export type BillzoNavItem = {
  href: string
  label: string
  icon: React.ElementType
}

export type BillzoNavGroup = {
  heading: string
  items: BillzoNavItem[]
}

export const BILLZO_NAV_GROUPS: BillzoNavGroup[] = [
  {
    heading: 'Workspace',
    items: [
      { href: '/recovery', label: 'Recovery', icon: Zap },
      { href: '/dashboard', label: 'Home', icon: Home },
      { href: '/invoices', label: 'Invoices', icon: Receipt },
      { href: '/parties', label: 'Customers', icon: Users },
      { href: '/pulse', label: 'Payments', icon: Activity },
      { href: '/cashflow', label: 'Cashflow', icon: TrendingUp },
    ],
  },
  {
    heading: 'Manage',
    items: [
      { href: '/products', label: 'Products', icon: Package },
      { href: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    heading: 'System',
    items: [{ href: '/settings', label: 'Settings', icon: Settings }],
  },
]

export const BILLZO_NAV_FLAT: BillzoNavItem[] = BILLZO_NAV_GROUPS.flatMap((g) => g.items)

// ─── SidebarNav ─────────────────────────────────────────────────────────────
// Clean, minimal, theme-aware sidebar body. The parent provides the positioned
// <aside className="bz-sidebar"> wrapper (see AppShell); this renders header,
// grouped nav, and the user footer inside it.

export function SidebarNav({
  pathname,
  onLogout,
  className = '',
}: {
  pathname: string
  onLogout: () => void
  className?: string
}) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label="BillZo home">
          <img src="/logo.svg" alt="BillZo" className="h-7 w-7 shrink-0 rounded-lg object-contain" />
          <span className="truncate text-[15px] font-bold tracking-tight text-foreground">BillZo</span>
        </Link>
      </div>

      {/* Nav */}
      <nav
        aria-label="Main navigation"
        className="flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-2.5 py-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {BILLZO_NAV_GROUPS.map((group) => (
          <div key={group.heading} className="flex flex-col gap-0.5">
            <span className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.heading}
            </span>
            {group.items.map((item) => {
              const Icon = item.icon
              const active = pathname.startsWith(item.href)
              const isRecovery = item.label === 'Recovery'
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors duration-150',
                    active
                      ? 'bg-recovery/10 font-semibold text-recovery'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  {isRecovery && (
                    <span
                      aria-hidden="true"
                      className="absolute -left-2.5 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-r bg-recovery"
                    />
                  )}
                  <Icon
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className={cn(
                      'shrink-0 transition-colors',
                      active || isRecovery ? 'text-recovery' : 'text-muted-foreground/70 group-hover:text-foreground',
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-border p-2.5">
        <button
          onClick={onLogout}
          title="Sign out"
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <LogOut size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          <span className="flex-1 truncate">Log out</span>
        </button>
      </div>
    </div>
  )
}

export default SidebarNav
