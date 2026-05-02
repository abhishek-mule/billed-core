'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Send, 
  Share2, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Download,
  MoreVertical,
  User,
  Package,
  History,
  Check
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [isMarkingPaid, setIsMarkingPaid] = useState(false)

  // Mock Data
  const invoice = {
    id: id as string,
    customer: {
      name: 'Rahul Sharma',
      phone: '+91 98765 43210',
      address: '123, MG Road, Mumbai'
    },
    items: [
      { name: 'USB-C Charging Cable', qty: 2, price: 400, tax: 72 },
      { name: 'Wireless Mouse', qty: 1, price: 800, tax: 144 },
    ],
    subtotal: 1600,
    taxTotal: 288,
    grandTotal: 1888,
    status: 'UNPAID' as 'PAID' | 'UNPAID' | 'OVERDUE',
    createdAt: '2026-05-02T10:30:00Z',
    timeline: [
      { event: 'Invoice Created', time: 'May 02, 10:30 AM', status: 'completed' },
      { event: 'Sent to Customer', time: 'May 02, 10:31 AM', status: 'completed' },
      { event: 'Viewed by Customer', time: 'May 02, 11:15 AM', status: 'completed' },
      { event: 'Payment Pending', time: 'Waiting...', status: 'pending' },
    ]
  }

  const handleMarkAsPaid = () => {
    setIsMarkingPaid(true)
    setTimeout(() => {
      invoice.status = 'PAID'
      setIsMarkingPaid(false)
      // Actual update logic here
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-background pb-32 animate-fade-in md:pl-20 lg:pl-64">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border h-16 flex items-center px-4 justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-all">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-base font-black tracking-tight text-foreground leading-none">{invoice.id}</h1>
            <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest">Invoice Details</p>
          </div>
        </div>
        <button className="p-2 rounded-full hover:bg-muted active:scale-95 transition-all">
          <MoreVertical className="w-5 h-5 text-muted-foreground" />
        </button>
      </header>

      <div className="p-4 max-w-2xl mx-auto space-y-6">
        {/* 1. Status & Summary */}
        <section className="card-base p-6 bg-card/50 backdrop-blur-sm border-border/50 flex flex-col items-center text-center">
          <div className={cn(
            "w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-elegant transition-transform hover:scale-110",
            invoice.status === 'PAID' ? "bg-success-soft text-success" : 
            invoice.status === 'OVERDUE' ? "bg-destructive/10 text-destructive" : "bg-warning-soft text-warning"
          )}>
            {invoice.status === 'PAID' ? <CheckCircle2 className="w-8 h-8" /> : 
             invoice.status === 'OVERDUE' ? <AlertCircle className="w-8 h-8" /> : 
             <Clock className="w-8 h-8" />}
          </div>
          <h2 className="text-3xl font-black tracking-tighter text-foreground">₹{invoice.grandTotal.toLocaleString()}</h2>
          <div className={cn(
            "mt-2 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
            invoice.status === 'PAID' ? "bg-success-soft text-success" : 
            invoice.status === 'OVERDUE' ? "bg-destructive/10 text-destructive" : "bg-warning-soft text-warning"
          )}>
            {invoice.status}
          </div>
        </section>

        {/* 2. Customer Info */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
            <User className="w-3 h-3" /> Customer
          </h2>
          <div className="card-base p-4 bg-card/50 border-border/50">
            <p className="font-black text-base text-foreground">{invoice.customer.name}</p>
            <p className="text-sm text-muted-foreground mt-1 font-medium">{invoice.customer.phone}</p>
            <p className="text-xs text-muted-foreground/70 mt-2 leading-relaxed">{invoice.customer.address}</p>
          </div>
        </section>

        {/* 3. Items Breakdown */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
            <Package className="w-3 h-3" /> Items breakdown
          </h2>
          <div className="card-base divide-y divide-border/50 overflow-hidden bg-card/50 border-border/50">
            {invoice.items.map((item, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div>
                  <p className="text-sm font-bold text-foreground leading-tight">{item.name}</p>
                  <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest">
                    {item.qty} units • ₹{item.price} each
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-foreground tracking-tight">₹{(item.qty * item.price).toLocaleString()}</p>
                  <p className="text-[9px] font-bold text-success mt-1 uppercase tracking-widest">+₹{item.tax} GST</p>
                </div>
              </div>
            ))}
            <div className="p-4 bg-muted/20 space-y-2">
              <div className="flex justify-between text-xs font-bold text-muted-foreground uppercase tracking-widest">
                <span>Subtotal</span>
                <span className="text-foreground">₹{invoice.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-muted-foreground uppercase tracking-widest">
                <span>Total Tax</span>
                <span className="text-success">₹{invoice.taxTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Timeline */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
            <History className="w-3 h-3" /> Activity Timeline
          </h2>
          <div className="card-base p-6 bg-card/50 border-border/50 space-y-6">
            {invoice.timeline.map((step, idx) => (
              <div key={idx} className="flex gap-4 relative">
                {idx !== invoice.timeline.length - 1 && (
                  <div className="absolute left-[9px] top-6 w-[2px] h-10 bg-border/50" />
                )}
                <div className={cn(
                  "w-5 h-5 rounded-full border-4 flex-shrink-0 z-10",
                  step.status === 'completed' ? "bg-success border-success/20" : "bg-background border-border"
                )}>
                  {step.status === 'completed' && <Check className="w-3 h-3 text-white m-auto" />}
                </div>
                <div>
                  <p className={cn(
                    "text-xs font-bold uppercase tracking-widest leading-none",
                    step.status === 'completed' ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {step.event}
                  </p>
                  <p className="text-[10px] font-medium text-muted-foreground mt-1.5">{step.time}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-20 lg:left-64 p-4 bg-background/80 backdrop-blur-xl border-t border-border z-50 pb-safe">
        <div className="max-w-2xl mx-auto flex gap-3">
          {invoice.status !== 'PAID' ? (
            <>
              <button 
                onClick={() => console.log('Sending reminder')}
                className="flex-1 btn-base py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest shadow-glow active:scale-[0.98]"
              >
                <Send className="w-5 h-5 mr-3" /> Send Reminder
              </button>
              <button 
                onClick={handleMarkAsPaid}
                disabled={isMarkingPaid}
                className="flex-1 btn-base py-4 bg-secondary text-secondary-foreground font-black uppercase tracking-widest active:scale-[0.98] disabled:opacity-50"
              >
                {isMarkingPaid ? 'Updating...' : 'Mark as Paid'}
              </button>
            </>
          ) : (
            <>
              <button className="flex-1 btn-base py-4 bg-secondary text-secondary-foreground font-black uppercase tracking-widest active:scale-[0.98]">
                <Share2 className="w-5 h-5 mr-3" /> Share Invoice
              </button>
              <button className="flex-1 btn-base py-4 bg-secondary text-secondary-foreground font-black uppercase tracking-widest active:scale-[0.98]">
                <Download className="w-5 h-5 mr-3" /> Download PDF
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
