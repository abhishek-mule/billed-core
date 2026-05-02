'use client'

import { useState } from 'react'
import Link from 'next/link'
import { 
  Plus, 
  ScanLine, 
  Package, 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  TrendingUp, 
  ShoppingBag,
  Settings,
  LogOut,
  User,
  Calendar
} from 'lucide-react'
import { useDashboardStats } from '@/hooks/useApi'
import { useSession } from '@/hooks/useSession'
import { HeroSkeleton, StatCardSkeleton, ListItemSkeleton } from '@/components/ui/Skeleton'
import { formatINR } from '@/lib/api-client'
import { MiniTrends } from '@/components/dashboard/MiniTrends'
import { AttentionRequired } from '@/components/dashboard/AttentionRequired'

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useDashboardStats()
  const session = useSession()
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  if (isLoading) {
    return (
      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-5">
        <div className="h-12 w-48 bg-muted animate-pulse rounded-xl mb-8" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-2xl" />)}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-2xl" />
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

  const { stats, recentInvoices, inventoryHealth, receivables, trends } = data
  const allSynced = stats.failedCount === 0

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="px-4 lg:px-8 py-4 lg:py-6 max-w-7xl mx-auto space-y-8 pb-20">
      
      {/* 1. Header Bar */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{session?.companyName || 'My Business'}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <Calendar className="h-3 w-3" />
            <span>{greeting()}, {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
          </div>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="h-10 w-10 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center font-bold shadow-glow transition-transform active:scale-90"
          >
            {session?.companyName?.charAt(0) || <User className="h-5 w-5" />}
          </button>
          
          {showProfileMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
              <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-2xl shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2">
                <Link href="/merchant/settings" className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Settings
                </Link>
                <button 
                  onClick={() => fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.href = '/start')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* 2. Quick Actions */}
      <section className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            href="/merchant/pos"
            className="group rounded-2xl p-4 flex flex-col items-center gap-2 border border-transparent transition-all active:scale-95 bg-gradient-primary text-primary-foreground shadow-glow hover:shadow-primary/20"
          >
            <Plus className="h-6 w-6 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold">New Invoice</span>
          </Link>
          <Link
            href="/merchant/purchases/scan"
            className="group rounded-2xl p-4 flex flex-col items-center gap-2 border border-border transition-all active:scale-95 bg-card hover:border-primary/50"
          >
            <ScanLine className="h-6 w-6 group-hover:scale-110 transition-transform text-primary" />
            <span className="text-sm font-bold text-foreground">Scan Bill</span>
          </Link>
          <Link
            href="/merchant/purchases"
            className="group rounded-2xl p-4 flex flex-col items-center gap-2 border border-border transition-all active:scale-95 bg-card hover:border-primary/50"
          >
            <ShoppingBag className="h-6 w-6 group-hover:scale-110 transition-transform text-primary" />
            <span className="text-sm font-bold text-foreground">Add Purchase</span>
          </Link>
          <Link
            href="/merchant/parties"
            className="group rounded-2xl p-4 flex flex-col items-center gap-2 border border-border transition-all active:scale-95 bg-card hover:border-primary/50"
          >
            <Users className="h-6 w-6 group-hover:scale-110 transition-transform text-primary" />
            <span className="text-sm font-bold text-foreground">Add Customer</span>
          </Link>
        </div>
      </section>

      {/* 3. Financial Snapshot */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1">How is my business doing?</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/merchant/reports?type=sales" className="rounded-2xl border border-border bg-card p-4 space-y-1 hover:border-primary/30 transition-colors group">
            <div className="text-xs text-muted-foreground font-medium">Total Sales (Month)</div>
            <div className="text-xl font-bold text-foreground number-display">{formatINR(stats.revenue)}</div>
            <div className="flex items-center gap-1 text-[10px] text-success">
              <TrendingUp className="h-3 w-3" />
              <span>+12% vs last month</span>
            </div>
          </Link>
          <Link href="/merchant/reports?type=purchases" className="rounded-2xl border border-border bg-card p-4 space-y-1 hover:border-primary/30 transition-colors group">
            <div className="text-xs text-muted-foreground font-medium">Total Purchases</div>
            <div className="text-xl font-bold text-foreground number-display">{formatINR(stats.totalPurchases)}</div>
            <div className="text-[10px] text-muted-foreground">From {stats.pendingPurchasesCount + 5} suppliers</div>
          </Link>
          <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Gross Profit</div>
            <div className="text-xl font-bold text-success number-display">{formatINR(stats.revenue - stats.totalPurchases)}</div>
            <div className="text-[10px] text-muted-foreground">Est. Margin: {Math.round(((stats.revenue - stats.totalPurchases) / stats.revenue) * 100) || 0}%</div>
          </div>
          <Link href="/merchant/reports?type=receivables" className="rounded-2xl border border-border bg-card p-4 space-y-1 hover:border-primary/30 transition-colors group">
            <div className="text-xs text-muted-foreground font-medium">Outstanding</div>
            <div className="text-xl font-bold text-warning number-display">{formatINR(stats.pendingCollections)}</div>
            <div className="text-[10px] text-warning">Needs follow-up</div>
          </Link>
        </div>
      </section>

      {/* 4. Attention Required */}
      <AttentionRequired 
        unpaidCount={stats.unpaidCount}
        unpaidAmount={stats.unpaidAmount}
        lowStockCount={inventoryHealth?.lowStockItems?.length || 0}
        pendingPurchasesCount={stats.pendingPurchasesCount}
        failedSyncCount={stats.totalFailedCount}
      />

      {/* 5. Mini Trends */}
      <MiniTrends 
        salesData={trends?.sales || []} 
        purchasesData={trends?.purchases || []} 
      />

      {/* 6. Recent Activity */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent Activity</h2>
          <Link href="/merchant/invoice" className="text-xs text-primary font-bold inline-flex items-center gap-1 hover:underline">
            View All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {recentInvoices.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No activity yet today
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recentInvoices.map((inv: any) => (
                <li key={inv.id} className="group">
                  <Link href={`/merchant/invoice/${inv.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-sm font-bold">
                      {inv.party?.charAt(0) || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-foreground truncate">{inv.party}</div>
                      <div className="text-[11px] text-muted-foreground">{inv.number} • {new Date(inv.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-foreground number-display">{formatINR(inv.amount)}</div>
                      <div className={`text-[10px] font-black uppercase tracking-tighter ${
                        inv.status === 'paid' ? 'text-success' : 
                        inv.status === 'failed' ? 'text-destructive' : 'text-warning'
                      }`}>
                        {inv.status}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 7. Inventory Alerts (Low Stock) */}
      {inventoryHealth?.lowStockItems?.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1">Low Stock Alerts</h2>
          <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
            {inventoryHealth.lowStockItems.slice(0, 3).map((item: any) => (
              <Link key={item.id} href={`/merchant/products/${item.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
                <div className="text-sm font-semibold">{item.name}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-destructive">{item.stock} {item.unit} left</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 8. Sync Indicator */}
      <footer className="pt-4 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
        <div className={`h-1.5 w-1.5 rounded-full ${allSynced ? 'bg-success' : 'bg-warning'} animate-pulse`} />
        <span>{allSynced ? 'All data synced' : 'Syncing updates...'}</span>
        <span className="opacity-50">•</span>
        <span>BillZo v1.4.2</span>
      </footer>

    </div>
  )
}