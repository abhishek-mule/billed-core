'use client'

import { useRouter } from 'next/navigation'
import { Plus, Search, FileText, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function InvoicesPage() {
  const router = useRouter()

  const invoices = [
    { id: 'INV-001', customer: 'Rahul Sharma', amount: '₹1,200', date: 'Today', status: 'PAID' },
    { id: 'INV-002', customer: 'Amit Patel', amount: '₹4,500', date: 'Yesterday', status: 'PENDING' },
    { id: 'INV-003', customer: 'Neha Singh', amount: '₹850', date: 'Yesterday', status: 'PAID' },
  ]

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your customer bills</p>
        </div>
        <button 
          onClick={() => router.push('/invoices/new')}
          className="btn-base bg-primary text-primary-foreground shadow-elegant px-4 py-2 text-sm"
        >
          <Plus className="w-4 h-4 mr-2" /> New
        </button>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input 
          type="text" 
          placeholder="Search invoices by customer or #..." 
          className="input-base pl-9 border-none shadow-sm"
        />
      </div>

      <div className="space-y-3">
        {invoices.map((invoice) => (
          <div key={invoice.id} className="card-base p-4 flex items-center justify-between hover:border-primary/30 cursor-pointer transition-colors">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                invoice.status === 'PAID' ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
              )}>
                {invoice.status === 'PAID' ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">{invoice.customer}</p>
                <p className="text-xs text-muted-foreground">{invoice.id} • {invoice.date}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-foreground">{invoice.amount}</p>
              <p className={cn(
                "text-[10px] font-bold uppercase tracking-wider mt-0.5",
                invoice.status === 'PAID' ? "text-success" : "text-warning"
              )}>
                {invoice.status}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
