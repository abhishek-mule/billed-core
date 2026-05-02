'use client'

import { useRouter } from 'next/navigation'
import { 
  PlusCircle, 
  ScanLine, 
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  Clock,
  PackageX,
  FileWarning
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const router = useRouter()

  const quickActions = [
    { label: 'Create Invoice', icon: PlusCircle, path: '/invoices/new', color: 'bg-primary text-primary-foreground', shadow: 'shadow-glow' },
    { label: 'Scan Bill', icon: ScanLine, path: '/scan', color: 'bg-secondary text-secondary-foreground', shadow: 'shadow-sm' },
    { label: 'Add Expense', icon: Wallet, path: '/purchases/new', color: 'bg-secondary text-secondary-foreground', shadow: 'shadow-sm' },
  ]

  const alerts = [
    { id: 1, title: '2 Unpaid Invoices', description: '₹4,500 pending collection', icon: AlertCircle, color: 'text-warning bg-warning-soft', border: 'border-warning/20' },
    { id: 2, title: 'Low Stock: USB Cable', description: 'Only 3 units left', icon: PackageX, color: 'text-destructive bg-destructive/10', border: 'border-destructive/20' },
    { id: 3, title: 'OCR Failed', description: 'Supplier bill #402 couldn\'t be read', icon: FileWarning, color: 'text-muted-foreground bg-muted', border: 'border-border' },
  ]

  const recentActivity = [
    { id: 1, action: 'Invoice #012 created', target: 'Rahul Sharma', time: '10 mins ago', amount: '₹1,200', type: 'in' },
    { id: 2, action: 'Payment received', target: 'Invoice #010', time: '1 hour ago', amount: '₹450', type: 'in' },
    { id: 3, action: 'Purchase added', target: 'Wholesale Mart', time: '3 hours ago', amount: '₹8,500', type: 'out' },
  ]

  return (
    <div className="space-y-8 animate-fade-in pb-8">
      {/* Quick Actions */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                onClick={() => router.push(action.path)}
                className={cn(
                  "flex flex-col items-center justify-center p-4 rounded-2xl transition-all active:scale-95",
                  action.color,
                  action.shadow
                )}
              >
                <Icon className="w-6 h-6 mb-2" />
                <span className="text-xs font-semibold text-center">{action.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Financial Snapshot */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Today's Snapshot</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="card-base p-4 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => router.push('/reports')}>
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              Sales <ArrowUpRight className="w-3 h-3 text-success" />
            </p>
            <p className="text-xl font-bold mt-1 tracking-tight">₹12,450</p>
          </div>
          <div className="card-base p-4 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => router.push('/invoices?status=pending')}>
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              Pending <ArrowDownRight className="w-3 h-3 text-warning" />
            </p>
            <p className="text-xl font-bold mt-1 tracking-tight">₹4,500</p>
          </div>
        </div>
      </section>

      {/* Attention Alerts */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Needs Attention</h2>
        <div className="space-y-3">
          {alerts.map((alert) => {
            const Icon = alert.icon
            return (
              <div 
                key={alert.id} 
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:shadow-md",
                  alert.border,
                  "bg-card"
                )}
              >
                <div className={cn("p-2 rounded-lg", alert.color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="font-semibold text-sm text-foreground truncate">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{alert.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Recent Activity */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h2>
          <button className="text-xs font-semibold text-primary">View All</button>
        </div>
        <div className="card-base divide-y divide-border overflow-hidden">
          {recentActivity.map((item) => (
            <div key={item.id} className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.action}</p>
                  <p className="text-xs text-muted-foreground">{item.target} • {item.time}</p>
                </div>
              </div>
              <p className={cn(
                "text-sm font-bold",
                item.type === 'in' ? "text-success" : "text-foreground"
              )}>
                {item.type === 'in' ? '+' : '-'}{item.amount}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}