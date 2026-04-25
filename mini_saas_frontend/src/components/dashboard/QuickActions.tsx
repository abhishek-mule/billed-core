'use client'

import { Plus, RefreshCw, Clock, Settings } from 'lucide-react'
import Link from 'next/link'
import { cx, dashboardCardBase } from './styles'

export function QuickActions() {
  const actions = [
    {
      icon: Plus,
      label: 'New Invoice',
      href: '/merchant/invoice/new',
      primary: true
    },
    {
      icon: Clock,
      label: 'Pending Sync',
      href: '/merchant/invoice?status=pending',
      primary: false
    },
    {
      icon: RefreshCw,
      label: 'Invoices',
      href: '/merchant/invoice',
      primary: false
    },
    {
      icon: Settings,
      label: 'Settings',
      href: '/merchant/settings',
      primary: false
    }
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <Link
            key={action.label}
            href={action.href}
            className={cx(
              'group flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl transition-all duration-200 active:scale-[0.98] ring-1 ring-inset',
              action.primary
                ? 'bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white shadow-lg shadow-indigo-600/25 hover:shadow-indigo-500/35 ring-indigo-300/20'
                : `${dashboardCardBase} hover:bg-[#1a2030] hover:-translate-y-0.5 text-slate-300 hover:text-white ring-white/10`
            )}
          >
            <Icon className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
            <span className="text-[11px] font-semibold tracking-tight">{action.label}</span>
          </Link>
        )
      })}
    </div>
  )
}