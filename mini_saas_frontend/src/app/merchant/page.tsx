'use client'

import Link from 'next/link'
import { Plus, ScanLine, Package, Users, AlertTriangle, CheckCircle2, ArrowRight, TrendingUp } from 'lucide-react'
import { useDashboardStats } from '@/hooks/useApi'
import { HeroSkeleton, StatCardSkeleton, ListItemSkeleton } from '@/components/ui/Skeleton'
import { formatINRCompact, formatINR } from '@/lib/api-client'

const statusBadge: Record<string, string> = {
  synced: 'bg-success-soft text-success',
  pending: 'bg-warning-soft text-warning',
  failed: 'bg-destructive/10 text-destructive',
}

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useDashboardStats()

  if (isLoading) {
    return (
      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-5">
        <HeroSkeleton />
        <StatCardSkeleton />
        <div className="grid grid-cols-4 gap-3">
           <StatCardSkeleton />
           <StatCardSkeleton />
           <StatCardSkeleton />
           <StatCardSkeleton />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
           <ListItemSkeleton />
           <ListItemSkeleton />
           <ListItemSkeleton />
        </div>
      </div>
    )
  }

  if (isError || !data || !data.success) {
    return (
      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[50vh]">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load dashboard</h2>
        <button 
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
        >
          Try Again
        </button>
      </div>
    )
  }

  const { stats, recentInvoices } = data
  const allSynced = stats.failedCount === 0

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-5">
      {/* Revenue hero card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-card text-primary-foreground p-6 lg:p-8 shadow-elegant">
        <div className="absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,hsl(var(--success)),transparent_50%)]" />
        </div>
        <div className="relative">
          <div className="text-sm opacity-80">Today&apos;s revenue</div>
          <div className="mt-2 text-5xl lg:text-6xl font-bold number-display tracking-tight">
            {formatINR(stats.revenue)}
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm opacity-90">
            <span>{stats.invoiceCount} invoices</span>
            <span className="opacity-50">•</span>
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> vs yesterday
            </span>
          </div>
        </div>
      </div>

      {/* Sync status */}
      <div className={`rounded-2xl border p-5 flex items-center gap-4 ${allSynced ? 'border-success/30 bg-success-soft' : 'border-warning/40 bg-warning-soft'}`}>
        <div className={`grid h-11 w-11 place-items-center rounded-xl ${allSynced ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}`}>
          {allSynced ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold ${allSynced ? 'text-success' : 'text-warning'}`}>
            {allSynced ? 'All invoices synced' : `${stats.failedCount} invoices failed to sync`}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {allSynced ? 'Last synced just now' : 'Tap retry to send them again'}
          </div>
        </div>
        {!allSynced && (
          <button 
            onClick={async () => {
              try {
                const res = await fetch('/api/merchant/invoice/retry-all', { method: 'POST' })
                const resData = await res.json()
                if (resData.succeeded !== undefined) {
                  // Use toast in a real app, here we just refetch
                  refetch()
                }
              } catch {
                // Ignore error
              }
            }}
            className="px-4 py-2 rounded-lg bg-warning text-warning-foreground text-sm font-medium hover:bg-warning/90"
          >
            Retry All
          </button>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-3">
        <Link
          href="/merchant/pos"
          className="rounded-2xl p-4 flex flex-col items-center gap-2 border transition-spring active:scale-95 bg-gradient-primary text-primary-foreground border-transparent shadow-glow"
        >
          <Plus className="h-5 w-5" />
          <span className="text-xs font-semibold">Bill</span>
        </Link>
        <Link
          href="/merchant/purchases"
          className="rounded-2xl p-4 flex flex-col items-center gap-2 border transition-spring active:scale-95 bg-card border-border hover:border-primary/30 hover:shadow-md"
        >
          <ScanLine className="h-5 w-5" />
          <span className="text-xs font-semibold">Scan</span>
        </Link>
        <Link
          href="/merchant/products"
          className="rounded-2xl p-4 flex flex-col items-center gap-2 border transition-spring active:scale-95 bg-card border-border hover:border-primary/30 hover:shadow-md"
        >
          <Package className="h-5 w-5" />
          <span className="text-xs font-semibold">Products</span>
        </Link>
        <Link
          href="/merchant/parties"
          className="rounded-2xl p-4 flex flex-col items-center gap-2 border transition-spring active:scale-95 bg-card border-border hover:border-primary/30 hover:shadow-md"
        >
          <Users className="h-5 w-5" />
          <span className="text-xs font-semibold">Parties</span>
        </Link>
      </div>

      {/* Recent invoices */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Recent invoices</h2>
          <Link href="/merchant/invoice" className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:underline">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {recentInvoices.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No invoices yet today — tap Bill to create your first
          </div>
        ) : (
          <ul className="divide-y divide-border max-h-80 overflow-y-auto">
            {recentInvoices.map((inv: any) => (
              <li key={inv.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-base">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-semibold">
                  {inv.party?.charAt(0) || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{inv.party}</div>
                  <div className="text-xs text-muted-foreground">{inv.number} • {new Date(inv.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-foreground number-display">{formatINR(inv.amount)}</div>
                  <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadge[inv.status] || 'bg-secondary text-secondary-foreground'}`}>
                    {inv.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}