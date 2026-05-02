'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Share2, 
  CheckCircle2, 
  AlertCircle,
  Download,
  MoreVertical,
  Store,
  Package,
  History,
  Check,
  Eye,
  RefreshCcw,
  Keyboard,
  Barcode,
  Image as ImageIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function PurchaseDetailPage() {
  const { id } = useParams()
  const router = useRouter()

  // Mock Data
  const purchase = {
    id: id as string,
    supplier: {
      name: 'A1 Electronics Distributors',
      gstin: '27AAAAA0000A1Z5',
      address: 'Industrial Area, Phase 2, Pune'
    },
    items: [
      { name: 'USB-C Charging Cable (Fast)', qty: 10, price: 400, tax: 720 },
      { name: 'Wireless Optical Mouse', qty: 5, price: 750, tax: 675 },
      { name: 'HDMI 2.1 Cable 2m', qty: 2, price: 1200, tax: 432 },
    ],
    subtotal: 10150,
    taxTotal: 1827,
    grandTotal: 11977,
    status: 'PROCESSED' as 'PROCESSED' | 'NEEDS_REVIEW' | 'FAILED',
    date: 'May 02, 2026',
    imageUrl: 'https://images.unsplash.com/photo-1586486855514-8c633cc6fd38?auto=format&fit=crop&q=80&w=800', // Mock bill image
    timeline: [
      { event: 'Bill Scanned', time: '10:30 AM', status: 'completed' },
      { event: 'OCR Processing', time: '10:31 AM', status: 'completed' },
      { event: 'Data Validated', time: '10:32 AM', status: 'completed' },
      { event: 'Inventory Updated', time: '10:32 AM', status: 'completed' },
    ]
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
            <h1 className="text-base font-black tracking-tight text-foreground leading-none">{purchase.id}</h1>
            <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest">Purchase Detail</p>
          </div>
        </div>
        <button className="p-2 rounded-full hover:bg-muted active:scale-95 transition-all">
          <MoreVertical className="w-5 h-5 text-muted-foreground" />
        </button>
      </header>

      <div className="p-4 max-w-3xl mx-auto space-y-6">
        {/* 1. Status Summary */}
        <section className="card-base p-6 bg-card/50 backdrop-blur-sm border-border/50 flex flex-col items-center text-center">
          <div className={cn(
            "w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-elegant",
            purchase.status === 'PROCESSED' ? "bg-success-soft text-success" : 
            purchase.status === 'FAILED' ? "bg-destructive/10 text-destructive" : "bg-warning-soft text-warning"
          )}>
            {purchase.status === 'PROCESSED' ? <CheckCircle2 className="w-8 h-8" /> : 
             purchase.status === 'FAILED' ? <AlertCircle className="w-8 h-8" /> : 
             <History className="w-8 h-8" />}
          </div>
          <h2 className="text-3xl font-black tracking-tighter text-foreground italic">₹{purchase.grandTotal.toLocaleString()}</h2>
          <div className={cn(
            "mt-2 text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full border border-current opacity-80",
            purchase.status === 'PROCESSED' ? "text-success" : 
            purchase.status === 'FAILED' ? "text-destructive" : "text-warning"
          )}>
            {purchase.status.replace('_', ' ')}
          </div>
        </section>

        {/* 2. Original Image Preview */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
            <ImageIcon className="w-3 h-3" /> Original Bill Capture
          </h2>
          <div className="card-base overflow-hidden bg-muted/20 border-border/50 relative group cursor-zoom-in">
             <img src={purchase.imageUrl} alt="Original Bill" className="w-full h-48 object-cover object-top transition-transform duration-500 group-hover:scale-105" />
             <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
               <button className="bg-white/20 backdrop-blur-md text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/20">
                 Tap to Enlarge
               </button>
             </div>
          </div>
        </section>

        {/* 3. Supplier & Items */}
        <div className="grid md:grid-cols-2 gap-6">
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
              <Store className="w-3 h-3" /> Supplier
            </h2>
            <div className="card-base p-4 bg-card/50 border-border/50 h-full">
              <p className="font-black text-base text-foreground leading-tight">{purchase.supplier.name}</p>
              <p className="text-[10px] font-bold text-success mt-2 uppercase tracking-widest">GSTIN: {purchase.supplier.gstin}</p>
              <p className="text-xs text-muted-foreground mt-4 font-medium leading-relaxed">{purchase.supplier.address}</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
              <History className="w-3 h-3" /> Auto-Timeline
            </h2>
            <div className="card-base p-4 bg-card/50 border-border/50 h-full space-y-4">
              {purchase.timeline.map((step, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5",
                    step.status === 'completed' ? "bg-success border-success/20" : "bg-muted border-border"
                  )}>
                    {step.status === 'completed' && <Check className="w-2 h-2 text-white m-auto" />}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-tighter text-foreground leading-none">{step.event}</p>
                    <p className="text-[9px] font-bold text-muted-foreground mt-1">{step.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* 4. Items Breakdown */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
            <Package className="w-3 h-3" /> Extracted Line Items
          </h2>
          <div className="card-base divide-y divide-border/50 overflow-hidden bg-card/50 border-border/50">
            {purchase.items.map((item, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-black text-foreground truncate pr-4">{item.name}</p>
                  <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest">
                    {item.qty} units • ₹{item.price}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-black text-foreground tracking-tight">₹{(item.qty * item.price).toLocaleString()}</p>
                  <p className="text-[9px] font-bold text-success mt-1 uppercase tracking-widest">+₹{item.tax} GST</p>
                </div>
              </div>
            ))}
            <div className="p-4 bg-muted/20 flex justify-between items-center">
              <div className="flex items-center gap-2 text-[10px] font-black text-success uppercase tracking-widest">
                <Barcode className="w-4 h-4" />
                Inventory Stock Increased
              </div>
              <div className="text-right space-y-1">
                 <p className="text-[10px] font-bold text-muted-foreground uppercase">Total GST</p>
                 <p className="text-sm font-black text-foreground">₹{purchase.taxTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-20 lg:left-64 p-4 bg-background/80 backdrop-blur-xl border-t border-border z-50 pb-safe">
        <div className="max-w-3xl mx-auto flex gap-3">
          <button className="flex-1 btn-base py-4 bg-secondary text-secondary-foreground font-black uppercase tracking-widest shadow-sm active:scale-[0.98]">
            <Share2 className="w-5 h-5 mr-3" /> Share Record
          </button>
          <button className="flex-1 btn-base py-4 bg-secondary text-secondary-foreground font-black uppercase tracking-widest shadow-sm active:scale-[0.98]">
            <Download className="w-5 h-5 mr-3" /> PDF Export
          </button>
        </div>
      </div>
    </div>
  )
}
