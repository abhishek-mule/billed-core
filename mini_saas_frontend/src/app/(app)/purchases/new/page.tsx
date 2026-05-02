'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  ArrowLeft, 
  Store, 
  FileCheck, 
  Save, 
  AlertCircle,
  Zap,
  Loader2,
  Trash2,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Info,
  Package,
  IndianRupee,
  Barcode,
  RefreshCcw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'

interface LineItem {
  id: string
  name: string
  qty: number
  price: number
  confidence: number // 0-1
}

type FormState = 'PROCESSING' | 'AUTO_FILLED' | 'NEEDS_REVIEW' | 'MANUAL'

function NewPurchaseContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { enqueue, isOnline } = useOfflineQueue()
  
  const isFromScan = searchParams?.get('fromScan') === 'true'
  const [state, setState] = useState<FormState>(isFromScan ? 'PROCESSING' : 'MANUAL')
  
  // Form Data
  const [supplierName, setSupplierName] = useState('')
  const [gstin, setGstin] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [date, setDate] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [confidenceScores, setConfidenceScores] = useState<Record<string, number>>({})

  // 1. Simulate OCR Pipeline
  useEffect(() => {
    if (isFromScan) {
      const timer = setTimeout(() => {
        setSupplierName('A1 Electronics Distributors')
        setGstin('27AAAAA0000A1Z5')
        setInvoiceNumber('PUR/2026/0401')
        setDate(new Date().toISOString().split('T')[0])
        
        setItems([
          { id: '1', name: 'USB-C Charging Cable (Fast)', qty: 10, price: 400, confidence: 0.95 },
          { id: '2', name: 'Wireless Optical Mouse', qty: 5, price: 750, confidence: 0.72 }, // Needs verify
          { id: '3', name: 'HDMI 2.1 Cable 2m', qty: 2, price: 1200, confidence: 0.45 }, // Needs input
        ])

        setConfidenceScores({
          supplier: 0.98,
          gstin: 0.92,
          invoiceNumber: 0.88,
          date: 0.95
        })

        setState('AUTO_FILLED')
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [isFromScan])

  // 2. GST Logic
  const subtotal = useMemo(() => items.reduce((sum, i) => sum + (i.qty * i.price), 0), [items])
  const isInterState = gstin && !gstin.startsWith('27') // Assuming tenant is in Maharashtra (27)
  const gstRate = 0.18
  const gstAmount = subtotal * gstRate
  const totalAmount = subtotal + gstAmount

  // 3. Field Confidence Styling
  const getFieldStyle = (score: number = 1) => {
    if (score < 0.6) return "border-destructive/50 bg-destructive/5 ring-1 ring-destructive/20"
    if (score < 0.85) return "border-warning/50 bg-warning/5 ring-1 ring-warning/20"
    return "border-border bg-card/50"
  }

  const getConfidenceIcon = (score: number = 1) => {
    if (score < 0.6) return <AlertCircle className="w-3.5 h-3.5 text-destructive animate-pulse" />
    if (score < 0.85) return <AlertTriangle className="w-3.5 h-3.5 text-warning" />
    return <CheckCircle2 className="w-3.5 h-3.5 text-success opacity-50" />
  }

  const handleSave = async () => {
    const purchaseData = {
      supplier_name: supplierName,
      gstin,
      invoice_number: invoiceNumber,
      date,
      items,
      total_amount: totalAmount,
      gst_amount: gstAmount,
      status: state === 'AUTO_FILLED' ? 'PROCESSED' : 'NEEDS_REVIEW'
    }

    await enqueue('invoice:create', purchaseData) // Reusing type for now
    router.push('/purchases')
  }

  if (state === 'PROCESSING') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-8 relative">
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <Zap className="w-10 h-10 text-primary fill-primary animate-pulse" />
        </div>
        <h2 className="text-3xl font-black italic tracking-tighter mb-4 uppercase">Extracting Data</h2>
        <div className="space-y-3 max-w-xs w-full">
          <div className="h-4 bg-muted rounded-full animate-pulse w-3/4 mx-auto" />
          <div className="h-4 bg-muted rounded-full animate-pulse w-1/2 mx-auto opacity-60" />
          <div className="h-4 bg-muted rounded-full animate-pulse w-2/3 mx-auto opacity-30" />
        </div>
        <p className="mt-12 text-xs font-black text-muted-foreground uppercase tracking-[0.3em]">Processing Bill...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-32 animate-fade-in md:pl-20 lg:pl-64">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border h-16 flex items-center px-4 justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-90 transition-all">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-base font-black tracking-tight text-foreground leading-none">PURCHASE ENTRY</h1>
            <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest">
              {state === 'AUTO_FILLED' ? '🤖 AI Auto-filled' : 'Manual Entry'}
            </p>
          </div>
        </div>
        {state === 'AUTO_FILLED' && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-success-soft text-success rounded-full border border-success/20">
            <CheckCircle2 className="w-3 h-3" />
            <span className="text-[10px] font-black uppercase tracking-tighter">OCR Success</span>
          </div>
        )}
      </header>

      <div className="p-4 max-w-3xl mx-auto space-y-6">
        {/* 1. Supplier Info */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Store className="w-3 h-3" /> Supplier details
            </h2>
          </div>
          <div className={cn("card-base p-4 space-y-4 transition-all duration-500", getFieldStyle(confidenceScores.supplier))}>
            <div className="relative">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter mb-1.5 block flex items-center gap-1.5">
                Supplier Name {getConfidenceIcon(confidenceScores.supplier)}
              </label>
              <input 
                type="text" 
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Name as per bill"
                className="w-full bg-transparent border-none focus-visible:ring-0 text-lg font-black p-0 placeholder:font-medium placeholder:text-muted-foreground/30"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
              <div className="relative">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter mb-1.5 block flex items-center gap-1.5">
                  GSTIN {getConfidenceIcon(confidenceScores.gstin)}
                </label>
                <input 
                  type="text" 
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="27AAAAA..."
                  className="w-full bg-transparent border-none focus-visible:ring-0 text-sm font-black p-0 uppercase"
                />
              </div>
              <div className="relative">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter mb-1.5 block flex items-center gap-1.5">
                  Invoice # {getConfidenceIcon(confidenceScores.invoiceNumber)}
                </label>
                <input 
                  type="text" 
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Bill Number"
                  className="w-full bg-transparent border-none focus-visible:ring-0 text-sm font-black p-0"
                />
              </div>
            </div>
          </div>
        </section>

        {/* 2. Items List */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Package className="w-3 h-3" /> Line items extracted
            </h2>
            <button className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Item
            </button>
          </div>
          
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.id} className={cn(
                "card-base p-4 transition-all duration-500 space-y-4 group",
                getFieldStyle(item.confidence)
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Item {idx + 1}</span>
                      {getConfidenceIcon(item.confidence)}
                    </div>
                    <input 
                      type="text" 
                      value={item.name}
                      onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, name: e.target.value} : i))}
                      className="w-full bg-transparent border-none focus-visible:ring-0 text-sm font-black p-0 placeholder:text-muted-foreground/30 leading-tight"
                    />
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[9px] font-bold text-muted-foreground uppercase mb-1 block">Qty</label>
                    <input 
                      type="number" 
                      value={item.qty}
                      className="w-full bg-muted/30 border-none rounded-lg h-9 text-center text-xs font-black focus:ring-1 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-muted-foreground uppercase mb-1 block">Rate</label>
                    <input 
                      type="number" 
                      value={item.price}
                      className="w-full bg-muted/30 border-none rounded-lg h-9 text-center text-xs font-black focus:ring-1 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-muted-foreground uppercase mb-1 block">Stock</label>
                    <div className="w-full bg-success/5 border border-success/20 rounded-lg h-9 flex items-center justify-center gap-1.5 px-2">
                      <Barcode className="w-3 h-3 text-success" />
                      <span className="text-[10px] font-black text-success uppercase">+AUTO</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Tax Breakdown */}
        <section className="card-base p-6 bg-primary/5 border-primary/20 space-y-4">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Subtotal</p>
              <p className="text-xl font-black text-foreground leading-none">₹{subtotal.toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                {isInterState ? 'IGST' : 'CGST + SGST'} (18%)
              </p>
              <p className="text-xl font-black text-success leading-none">+₹{gstAmount.toLocaleString()}</p>
            </div>
          </div>
          <div className="h-px bg-primary/10" />
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Grand Total</p>
              <p className="text-4xl font-black text-primary tracking-tighter italic">₹{totalAmount.toLocaleString()}</p>
            </div>
            <div className="text-right">
               <div className="flex items-center gap-1.5 text-[10px] font-black text-success bg-success-soft px-3 py-1 rounded-full border border-success/10 uppercase tracking-tighter">
                 <Barcode className="w-3 h-3" />
                 Inventory Auto-Updated
               </div>
            </div>
          </div>
        </section>
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-20 lg:left-64 p-4 bg-background/80 backdrop-blur-xl border-t border-border z-50 pb-safe">
        <div className="max-w-3xl mx-auto flex gap-3">
          <button 
            onClick={handleSave}
            className="flex-1 btn-base py-5 bg-primary text-primary-foreground font-black uppercase tracking-widest shadow-glow active:scale-[0.98] transition-all flex items-center justify-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5" />
            Confirm & Save
          </button>
          <button 
            onClick={() => router.push('/scan')}
            className="px-6 btn-base py-5 bg-secondary text-secondary-foreground font-black uppercase tracking-widest active:scale-[0.98] transition-all"
          >
            <RefreshCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <style jsx global>{`
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  )
}

export default function NewPurchasePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 text-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <h2 className="text-xl font-bold text-foreground uppercase tracking-tighter italic">Loading Engine...</h2>
      </div>
    }>
      <NewPurchaseContent />
    </Suspense>
  )
}
