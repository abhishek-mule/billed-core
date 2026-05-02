'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  PlusCircle, 
  ScanLine, 
  Wallet,
  UserPlus,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  Clock,
  PackageX,
  FileWarning,
  Camera,
  ChevronRight,
  Send,
  Eye,
  RefreshCcw,
  Truck
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const router = useRouter()
  const [hasData, setHasData] = useState(true) // For testing empty state

  const quickActions = [
    { label: 'Create Invoice', icon: PlusCircle, path: '/invoices/new', color: 'bg-card text-foreground' },
    { label: 'Scan Bill', icon: ScanLine, path: '/scan', color: 'bg-primary text-primary-foreground', isPrimary: true },
    { label: 'Add Expense', icon: Wallet, path: '/purchases/new', color: 'bg-card text-foreground' },
    { label: 'Add Customer', icon: UserPlus, path: '/customers/new', color: 'bg-card text-foreground' },
  ]

  const alerts = [
    { 
      id: 'unpaid', 
      title: '2 Unpaid Invoices', 
      subtitle: '₹4,500 pending collection', 
      icon: AlertCircle, 
      color: 'text-warning bg-warning/10',
      actions: [
        { label: 'Send Reminder', icon: Send, primary: true, onClick: () => console.log('Send reminder') },
        { label: 'View All', icon: Eye, onClick: () => router.push('/invoices?status=pending') }
      ]
    },
    { 
      id: 'ocr-failed', 
      title: 'OCR Failed', 
      subtitle: '1 bill needs review', 
      icon: FileWarning, 
      color: 'text-destructive bg-destructive/10',
      actions: [
        { label: 'Review Now', icon: RefreshCcw, primary: true, onClick: () => router.push('/purchases?review=true') }
      ]
    },
    { 
      id: 'low-stock', 
      title: 'Low Stock – USB Cable', 
      subtitle: 'Only 3 units left', 
      icon: PackageX, 
      color: 'text-primary bg-primary/10',
      actions: [
        { label: 'Restock', icon: Truck, primary: true, onClick: () => console.log('Restock') },
        { label: 'View Items', icon: Eye, onClick: () => router.push('/inventory') }
      ]
    },
  ]

  const recentActivity = [
    { id: 1, action: 'Invoice #012 created', target: 'Rahul Sharma', time: '10 mins ago', amount: '₹1,200', type: 'in', event: 'invoice_created' },
    { id: 2, action: 'Payment received', target: 'Invoice #010', time: '1 hour ago', amount: '₹450', type: 'in', event: 'payment_received' },
    { id: 3, action: 'OCR Failed', target: 'Supplier Bill #402', time: '3 hours ago', amount: null, type: 'alert', event: 'ocr_failed' },
    { id: 4, action: 'Purchase added', target: 'Wholesale Mart', time: '5 hours ago', amount: '₹8,500', type: 'out', event: 'purchase_added' },
  ]

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 animate-fade-in">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
          <PlusCircle className="w-10 h-10 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Welcome to BillZo</h2>
        <p className="text-muted-foreground mb-8 max-w-xs">
          Start by creating your first invoice or scanning a bill to see your business pulse.
        </p>
        <div className="grid grid-cols-1 w-full gap-3 max-w-xs">
          <button 
            onClick={() => router.push('/invoices/new')}
            className="btn-base py-4 bg-primary text-primary-foreground font-bold shadow-glow"
          >
            Create First Invoice
          </button>
          <button 
            onClick={() => router.push('/scan')}
            className="btn-base py-4 bg-secondary text-secondary-foreground font-bold"
          >
            Scan a Bill
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in pb-24 max-w-3xl mx-auto">
      {/* 1. Quick Actions */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                onClick={() => router.push(action.path)}
                className={cn(
                  "flex flex-col items-center justify-center p-4 rounded-2xl transition-all active:scale-95 border border-border shadow-sm",
                  action.color,
                  action.isPrimary && "shadow-glow"
                )}
              >
                <div className={cn(
                  "p-3 rounded-xl mb-2",
                  action.isPrimary ? "bg-white/20" : "bg-muted"
                )}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-center tracking-tight">{action.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* 2. Needs Attention */}
      {alerts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Needs Attention</h2>
          <div className="space-y-3">
            {alerts.slice(0, 3).map((alert) => {
              const Icon = alert.icon
              return (
                <div 
                  key={alert.id} 
                  className="card-base p-4 border-border/50 bg-card/50 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className={cn("p-2.5 rounded-xl flex-shrink-0", alert.color)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="font-bold text-base text-foreground leading-none">{alert.title}</p>
                      <p className="text-sm text-muted-foreground mt-1.5">{alert.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {alert.actions.map((action, idx) => {
                      const ActionIcon = action.icon
                      return (
                        <button
                          key={idx}
                          onClick={action.onClick}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all active:scale-95",
                            action.primary 
                              ? "bg-primary text-primary-foreground shadow-sm" 
                              : "bg-secondary text-secondary-foreground"
                          )}
                        >
                          <ActionIcon className="w-3.5 h-3.5" />
                          {action.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 3. Today Snapshot */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Today Snapshot</h2>
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => router.push('/reports')}
            className="card-base p-5 text-left active:scale-[0.98] transition-all border-success/20 hover:border-success/40 group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-success uppercase tracking-widest">Today Sales</span>
              <ArrowUpRight className="w-4 h-4 text-success group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black tracking-tighter">₹12,450</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 font-bold">12 INVOICES</p>
          </button>

          <button 
            onClick={() => router.push('/invoices?status=pending')}
            className="card-base p-5 text-left active:scale-[0.98] transition-all border-warning/20 hover:border-warning/40 group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-warning uppercase tracking-widest">Pending Amount</span>
              <ArrowDownRight className="w-4 h-4 text-warning group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition-transform" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black tracking-tighter">₹4,500</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 font-bold">2 UNPAID</p>
          </button>
        </div>
      </section>

      {/* 4. Recent Activity */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Recent Activity</h2>
          <button className="text-xs font-bold text-primary hover:underline">View All</button>
        </div>
        <div className="card-base divide-y divide-border/50 overflow-hidden bg-card/30">
          {recentActivity.slice(0, 10).map((item) => (
            <div 
              key={item.id} 
              className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground group-hover:scale-110 transition-transform">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground leading-none">{item.action}</p>
                  <p className="text-xs text-muted-foreground mt-1.5 font-medium">{item.target} • {item.time}</p>
                </div>
              </div>
              {item.amount && (
                <p className={cn(
                  "text-sm font-black tracking-tight",
                  item.type === 'in' ? "text-success" : "text-foreground"
                )}>
                  {item.type === 'in' ? '+' : '-'}{item.amount}
                </p>
              )}
              {!item.amount && (
                <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
