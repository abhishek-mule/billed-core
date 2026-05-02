'use client'

import { AlertTriangle, Package, Clock, ScanLine } from 'lucide-react'
import Link from 'next/link'
import { formatINR } from '@/lib/api-client'

interface AttentionRequiredProps {
  unpaidCount: number
  unpaidAmount: number
  lowStockCount: number
  pendingPurchasesCount: number
  failedSyncCount: number
}

export function AttentionRequired({
  unpaidCount,
  unpaidAmount,
  lowStockCount,
  pendingPurchasesCount,
  failedSyncCount
}: AttentionRequiredProps) {
  const items = [
    {
      show: unpaidCount > 0,
      icon: Clock,
      label: `${unpaidCount} unpaid invoices`,
      detail: `(${formatINR(unpaidAmount)})`,
      href: '/merchant/invoice?status=UNPAID',
      color: 'text-warning',
      bgColor: 'bg-warning-soft'
    },
    {
      show: lowStockCount > 0,
      icon: Package,
      label: `${lowStockCount} items low in stock`,
      href: '/merchant/products?filter=low-stock',
      color: 'text-destructive',
      bgColor: 'bg-destructive/10'
    },
    {
      show: pendingPurchasesCount > 0,
      icon: ScanLine,
      label: `${pendingPurchasesCount} purchases not reviewed`,
      href: '/merchant/purchases?status=DRAFT',
      color: 'text-primary',
      bgColor: 'bg-primary-soft'
    },
    {
      show: failedSyncCount > 0,
      icon: AlertTriangle,
      label: `${failedSyncCount} invoices failed to sync`,
      href: '/merchant/invoice?sync=FAILED',
      color: 'text-destructive',
      bgColor: 'bg-destructive/10'
    }
  ]

  const activeItems = items.filter(i => i.show)

  if (activeItems.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1">Attention Required</h2>
      <div className="grid grid-cols-1 gap-2">
        {activeItems.map((item, idx) => (
          <Link
            key={idx}
            href={item.href}
            className={`flex items-center justify-between p-4 rounded-2xl border border-transparent hover:border-border transition-all active:scale-[0.98] ${item.bgColor}`}
          >
            <div className="flex items-center gap-3">
              <div className={`grid h-8 w-8 place-items-center rounded-lg ${item.color} bg-white/50 backdrop-blur-sm`}>
                <item.icon className="h-4 w-4" />
              </div>
              <div className="font-semibold text-sm text-foreground">
                {item.label} <span className="text-muted-foreground font-normal">{item.detail}</span>
              </div>
            </div>
            <AlertTriangle className={`h-4 w-4 ${item.color} animate-pulse`} />
          </Link>
        ))}
      </div>
    </div>
  )
}
