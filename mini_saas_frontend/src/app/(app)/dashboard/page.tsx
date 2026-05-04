'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Plus, 
  Scan, 
  Wallet,
  AlertCircle,
  Clock,
  RefreshCcw,
  Truck,
  TrendingUp,
  CreditCard,
  History,
  FileWarning,
  Wifi,
  WifiOff
} from 'lucide-react'
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

export type MerchantStatsDTO = {
  success?: boolean;
  error?: string;
  window: { start: string; end: string };
  money: {
    collectedTodayPaise: number;
    invoicedTodayPaise: number;
    outstandingPaise: number;
    overduePaise: number;
    cashCollectedPaise: number;
  };
  counts: {
    invoicesCreatedToday: number;
    paymentsToday: number;
    unpaidInvoices: number;
    overdueInvoices: number;
  };
  failures: {
    whatsapp: number;
    payments: number;
    system: number;
    total: number;
  };
  inventory: {
    lowStock: Array<any>;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    entityId: string;
    amountPaise?: number;
    customerName?: string;
    createdAt: string;
  }>;
  lastEventAt: string | null;
  systemState: "nominal" | "warning" | "degraded";
};

export default function DashboardPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [data, setData] = useState<MerchantStatsDTO | null>(null)

  const fetchDashboardData = async () => {
    try {
      const statsRes = await fetch('/api/merchant/stats')
      const statsData = await statsRes.json()

      if (statsData.success) {
        setData(statsData)
      } else {
        setError(statsData.error || 'Failed to load stats')
      }
    } catch (error: any) {
      console.error('Failed to fetch dashboard data:', error)
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const { status: realtimeStatus, isConnected, reconnect: reconnectSSE } = useRealtimeEvents({
    endpoint: '/api/events/stream',
    onMessage: (updates) => {
      if (updates.length > 0) {
        console.log('[SSE] Received new events, refetching dashboard data...', updates)
        fetchDashboardData()
      }
    },
    onError: (error) => {
      console.error('[SSE] Connection error:', error)
    },
    fallbackRefetch: fetchDashboardData,
  })

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const stats = [
    { 
      label: 'Invoiced Today', 
      value: data ? `₹${(data.money.invoicedTodayPaise / 100).toLocaleString()}` : '₹0', 
      trend: data ? `${data.counts.invoicesCreatedToday} bills` : '0 bills', 
      isPositive: true, 
      icon: TrendingUp,
      color: 'text-success',
      bgColor: 'bg-success-soft',
      path: '/reports'
    },
    { 
      label: 'Outstanding', 
      value: data ? `₹${(data.money.outstandingPaise / 100).toLocaleString()}` : '₹0', 
      trend: data ? `${data.counts.unpaidInvoices} unpaid` : '0 unpaid', 
      isPositive: false, 
      icon: Clock,
      color: 'text-warning',
      bgColor: 'bg-warning-soft',
      path: '/invoices?status=pending'
    },
    { 
      label: 'Collected Today', 
      value: data ? `₹${(data.money.cashCollectedPaise / 100).toLocaleString()}` : '₹0', 
      trend: data ? `${data.counts.paymentsToday} payments` : 'Ready', 
      isPositive: true, 
      icon: Wallet,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      path: '/reports/cash'
    },
  ]

  const actions = [
    { label: 'Invoice', sub: 'Create New', icon: Plus, path: '/invoices/new', color: 'bg-primary text-primary-foreground shadow-glow' },
    { label: 'Scan Bill', sub: 'OCR Entry', icon: Scan, path: '/scan', color: 'bg-black text-white shadow-xl' },
    { label: 'Add Expense', sub: 'Manual', icon: CreditCard, path: '/purchases/new', color: 'bg-card border-2 border-border' },
  ]

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse p-1">
        <div className="h-24 bg-muted rounded-[2rem]" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-32 bg-muted rounded-[2rem]" />
          <div className="h-32 bg-muted rounded-[2rem]" />
        </div>
        <div className="space-y-3">
          <div className="h-20 bg-muted rounded-2xl" />
          <div className="h-20 bg-muted rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="w-20 h-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Sync Error</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs leading-relaxed">
          We couldn't refresh your business pulse. Check your connection or try manual refresh.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 btn-base bg-primary text-primary-foreground px-8 py-3 font-black uppercase tracking-widest shadow-glow flex items-center gap-2"
        >
          <RefreshCcw className="w-4 h-4" /> Retry Sync
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-10 animate-fade-in pb-24 max-w-4xl mx-auto px-1">
      {/* Debug Panel (Internal Only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="p-3 bg-card border-2 border-dashed border-primary/50 rounded-xl mb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Debug: DTO Contract</p>
          <pre className="text-[10px] overflow-auto max-h-32 text-muted-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}

      {/* Real-time Connection Status */}
      <div className="flex items-center justify-between">
        <div className={cn(
          "flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full",
          isConnected ? "bg-success-soft text-success" : 
          realtimeStatus === 'reconnecting' ? "bg-warning-soft text-warning" :
          "bg-destructive/10 text-destructive"
        )}>
          {isConnected ? (
            <>
              <Wifi className="w-3 h-3" />
              <span>Live</span>
            </>
          ) : realtimeStatus === 'reconnecting' ? (
            <>
              <RefreshCcw className="w-3 h-3 animate-spin" />
              <span>Reconnecting...</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3" />
              <span>Updates paused</span>
              <button 
                onClick={reconnectSSE}
                className="underline hover:text-destructive ml-1"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>

      {/* 1. Primary Metrics Grid */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((stat, i) => (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={stat.label}
              onClick={() => router.push(stat.path)}
              className="card-base p-6 text-left hover:border-primary/30 transition-all group flex flex-col justify-between h-36 bg-card/40 backdrop-blur-sm border-border/50"
            >
              <div className="flex items-center justify-between w-full">
                <div className={cn("p-2 rounded-xl", stat.bgColor, stat.color)}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div className={cn(
                  "text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-tighter",
                  stat.isPositive ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
                )}>
                  {stat.trend}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">{stat.label}</p>
                <p className="text-3xl font-black tracking-tighter text-foreground mt-1">{stat.value}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* 2. Fast Actions HUD */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Quick HUD</h2>
          <Zap className="w-3 h-3 text-primary animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {actions.map((action, i) => (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + (i * 0.05) }}
              key={action.label}
              onClick={() => router.push(action.path)}
              className={cn(
                "p-5 rounded-[2rem] flex flex-col items-center justify-center gap-2 transition-all active:scale-90 group relative overflow-hidden",
                action.color
              )}
            >
              <action.icon className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />
              <div className="text-center">
                <p className="text-xs font-black uppercase tracking-tight leading-none">{action.label}</p>
                <p className="text-[9px] font-bold opacity-60 uppercase mt-1 tracking-widest">{action.sub}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* 3. Smart Alerts & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Alerts Column */}
        <section className="space-y-4">
          <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] flex items-center gap-2">
            <AlertCircle className="w-3 h-3 text-warning" /> Critical Feed
          </h2>
          <div className="space-y-3">
              {data.inventory.lowStock.length > 0 && (
                 <div className="card-base p-5 bg-warning-soft/30 border-warning/20 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                       <Truck className="w-16 h-16 -rotate-12" />
                    </div>
                    <p className="text-[10px] font-black text-warning uppercase tracking-widest mb-2">Inventory Alert</p>
                    <h3 className="text-lg font-black tracking-tight text-foreground leading-tight">{data.inventory.lowStock.length} Items Low Stock</h3>
                    <div className="mt-3 space-y-2">
                       {data.inventory.lowStock.slice(0, 2).map((item, idx) => (
                         <div key={idx} className="flex justify-between items-center text-[10px] font-bold uppercase">
                            <span className="text-muted-foreground">{item.name}</span>
                            <span className="text-destructive">{item.stock} left</span>
                         </div>
                       ))}
                    </div>
                    <div className="flex gap-2 mt-5">
                       <button onClick={() => router.push('/inventory?filter=low')} className="flex-1 py-2.5 bg-warning text-warning-foreground rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">Order Stock</button>
                    </div>
                 </div>
              )}

              {data.failures.total > 0 ? (
                <div className="card-base p-5 bg-destructive/5 border-destructive/10 relative overflow-hidden group">
                   <p className="text-[10px] font-black text-destructive uppercase tracking-widest mb-2">System Degradation</p>
                   <h3 className="text-lg font-black tracking-tight text-foreground leading-tight">Sync & Comm Failures</h3>
                   <div className="mt-2 space-y-1">
                     {data.failures.whatsapp > 0 && <p className="text-xs text-muted-foreground font-medium">• {data.failures.whatsapp} WhatsApp messages failed.</p>}
                     {data.failures.payments > 0 && <p className="text-xs text-muted-foreground font-medium">• {data.failures.payments} Payment links failed.</p>}
                     {data.failures.system > 0 && <p className="text-xs text-muted-foreground font-medium">• {data.failures.system} Core system failures.</p>}
                   </div>
                   <button onClick={() => router.push('/settings/integrations')} className="mt-5 w-full py-2.5 bg-destructive text-destructive-foreground rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-destructive/20 active:scale-95 transition-all">Review Errors</button>
                </div>
              ) : data.systemState === "warning" ? (
                <div className="card-base p-5 bg-warning-soft/30 border-warning/20 relative overflow-hidden group">
                   <p className="text-[10px] font-black text-warning uppercase tracking-widest mb-2">No Recent Activity</p>
                   <h3 className="text-lg font-black tracking-tight text-foreground leading-tight">Heartbeat Stale</h3>
                   <p className="text-xs text-muted-foreground mt-2 font-medium">No activity recorded for over 2 hours. Ensure system is tracking events correctly.</p>
                </div>
              ) : (
                data.inventory.lowStock.length === 0 && (
                  <div className="card-base p-8 text-center bg-card/20 border-border/20 flex flex-col items-center justify-center">
                    <div className="w-12 h-12 bg-success/10 text-success rounded-full flex items-center justify-center mb-3">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-foreground">All Systems Nominal</p>
                    <p className="text-xs text-muted-foreground mt-1">No critical alerts requiring your attention.</p>
                  </div>
                )
              )}
          </div>
        </section>

        {/* Recent History Column */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] flex items-center gap-2">
              <History className="w-3 h-3" /> Recent Activity
            </h2>
            <button onClick={() => router.push('/invoices')} className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">Full Log</button>
          </div>
          <div className="card-base divide-y divide-border/30 overflow-hidden bg-card/20 backdrop-blur-sm">
             {data.recentActivity.length > 0 ? data.recentActivity.map((log) => (
               <button key={log.id} className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors group text-left">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground group-hover:scale-110 transition-transform">
                        {log.type === 'payment_success' ? <Wallet className="w-4 h-4 text-success" /> : log.type === 'invoice_created' ? <Plus className="w-4 h-4 text-primary" /> : <RefreshCcw className="w-4 h-4" />}
                     </div>
                     <div>
                        <p className="text-xs font-black uppercase tracking-tight text-foreground">
                          {log.type.replace('_', ' ')}
                        </p>
                        <p className="text-[10px] font-bold text-muted-foreground mt-1 truncate max-w-[120px]">
                          {log.customerName || 'System'} • {new Date(log.createdAt).toLocaleDateString()}
                        </p>
                     </div>
                  </div>
                  {log.amountPaise !== undefined && log.amountPaise !== null && (
                    <p className={cn("text-xs font-black tracking-tight", log.type === 'payment_success' ? 'text-success' : 'text-foreground')}>
                      {log.type === 'payment_success' ? '+' : ''}₹{(log.amountPaise / 100).toLocaleString()}
                    </p>
                  )}
               </button>
             )) : (
                <div className="p-8 text-center text-muted-foreground">
                  <FileWarning className="w-8 h-8 mx-auto mb-3 opacity-20" />
                  <p className="text-xs font-bold uppercase tracking-widest">No Recent Activity</p>
                </div>
             )}
          </div>
        </section>
      </div>
    </div>
  )
}

function Zap(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 14.71 13.18 3h.51l-2.02 8.23H18l-8.68 11.23h-.5l1.58-8.75H4z" />
    </svg>
  )
}

