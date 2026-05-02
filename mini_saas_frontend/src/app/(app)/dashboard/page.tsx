'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Plus, 
  Scan, 
  Wallet,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  Clock,
  PackageX,
  FileWarning,
  ChevronRight,
  Send,
  Eye,
  RefreshCcw,
  Truck,
  TrendingUp,
  CreditCard,
  History
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

export default function DashboardPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<any>(null)
  const [lowStockItems, setLowStockItems] = useState<any[]>([])

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true)
      try {
        const [summaryRes, lowStockRes] = await Promise.all([
          fetch('/api/dashboard/today-summary'),
          fetch('/api/merchant/inventory/low-stock')
        ])
        
        const summaryData = await summaryRes.json()
        const lowStockData = await lowStockRes.json()

        if (summaryData.success) setSummary(summaryData.data)
        if (lowStockData.success) setLowStockItems(lowStockData.data)
      } catch (error: any) {
        console.error('Failed to fetch dashboard data:', error)
        setError(error.message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  const stats = [
    { 
      label: 'Today Sales', 
      value: summary ? `₹${summary.totalSales.toLocaleString()}` : '₹0', 
      trend: summary ? `${summary.salesGrowth}%` : '0%', 
      isPositive: (summary?.salesGrowth || 0) >= 0, 
      icon: TrendingUp,
      color: 'text-success',
      bgColor: 'bg-success-soft',
      path: '/reports'
    },
    { 
      label: 'Pending', 
      value: summary ? `₹${summary.pendingAmount.toLocaleString()}` : '₹0', 
      trend: summary ? `${summary.pendingCount} unpaid` : '0 unpaid', 
      isPositive: false, 
      icon: Clock,
      color: 'text-warning',
      bgColor: 'bg-warning-soft',
      path: '/invoices?status=pending'
    },
    { 
      label: 'Cash In Hand', 
      value: summary ? `₹${summary.cashInHand.toLocaleString()}` : '₹0', 
      trend: 'Ready', 
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
    { label: 'Customers', sub: 'Manage', icon: Users, path: '/customers', color: 'bg-card border-2 border-border' },
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

  if (error) {
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
              {lowStockItems.length > 0 && (
                 <div className="card-base p-5 bg-warning-soft/30 border-warning/20 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                       <Truck className="w-16 h-16 -rotate-12" />
                    </div>
                    <p className="text-[10px] font-black text-warning uppercase tracking-widest mb-2">Inventory Alert</p>
                    <h3 className="text-lg font-black tracking-tight text-foreground leading-tight">{lowStockItems.length} Items Low Stock</h3>
                    <div className="mt-3 space-y-2">
                       {lowStockItems.slice(0, 2).map(item => (
                         <div key={item.id} className="flex justify-between items-center text-[10px] font-bold uppercase">
                            <span className="text-muted-foreground">{item.name}</span>
                            <span className="text-destructive">{item.stock} {item.unit} left</span>
                         </div>
                       ))}
                    </div>
                    <div className="flex gap-2 mt-5">
                       <button onClick={() => router.push('/inventory?filter=low')} className="flex-1 py-2.5 bg-warning text-warning-foreground rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">Order Stock</button>
                       <button className="px-4 py-2.5 bg-card border border-warning/20 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all text-warning">View</button>
                    </div>
                 </div>
              )}

              <div className="card-base p-5 bg-destructive/5 border-destructive/10 relative overflow-hidden group">
                 <p className="text-[10px] font-black text-destructive uppercase tracking-widest mb-2">Data Failure</p>
                 <h3 className="text-lg font-black tracking-tight text-foreground leading-tight">OCR Extraction Failed</h3>
                 <p className="text-xs text-muted-foreground mt-2 font-medium">Purchase bill #402 couldn't be auto-read.</p>
                 <button onClick={() => router.push('/purchases?review=true')} className="mt-5 w-full py-2.5 bg-destructive text-destructive-foreground rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-destructive/20 active:scale-95 transition-all">Manual Review</button>
              </div>
          </div>
        </section>

        {/* Recent History Column */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] flex items-center gap-2">
              <History className="w-3 h-3" /> Recent Log
            </h2>
            <button className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">Full Log</button>
          </div>
          <div className="card-base divide-y divide-border/30 overflow-hidden bg-card/20 backdrop-blur-sm">
             {[
               { icon: Plus, title: 'Invoice #012', sub: 'Rahul Sharma • 10m ago', val: '+₹1,200', color: 'text-success' },
               { icon: RefreshCcw, title: 'Payment Recv', sub: 'Invoice #010 • 1h ago', val: '+₹450', color: 'text-success' },
               { icon: Scan, title: 'Purchase Entry', sub: 'Wholesale Mart • 3h ago', val: '-₹8,500', color: 'text-foreground' },
             ].map((log, i) => (
               <button key={i} className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors group text-left">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground group-hover:scale-110 transition-transform">
                        <log.icon className="w-4 h-4" />
                     </div>
                     <div>
                        <p className="text-xs font-black uppercase tracking-tight text-foreground">{log.title}</p>
                        <p className="text-[10px] font-bold text-muted-foreground mt-1">{log.sub}</p>
                     </div>
                  </div>
                  <p className={cn("text-xs font-black tracking-tight", log.color)}>{log.val}</p>
               </button>
             ))}
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
