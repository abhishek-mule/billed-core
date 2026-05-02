'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Plus, 
  Search, 
  Store, 
  Eye, 
  AlertCircle, 
  CheckCircle2, 
  FileWarning, 
  RefreshCcw, 
  ChevronRight,
  Camera,
  Keyboard,
  Filter
} from 'lucide-react'
import { cn } from '@/lib/utils'

type PurchaseStatus = 'PROCESSED' | 'NEEDS_REVIEW' | 'FAILED'

interface Purchase {
  id: string
  supplier: string
  amount: string
  gstAmount: string
  date: string
  status: PurchaseStatus
}

export default function PurchasesPage() {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<'ALL' | PurchaseStatus>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const purchases: Purchase[] = [
    { id: 'PUR-402', supplier: 'A1 Electronics Distributors', amount: '₹12,400', gstAmount: '₹1,892', date: '2 hours ago', status: 'FAILED' },
    { id: 'PUR-401', supplier: 'Wholesale Mart', amount: '₹8,500', gstAmount: '₹1,530', date: '5 hours ago', status: 'NEEDS_REVIEW' },
    { id: 'PUR-400', supplier: 'Global Supplies', amount: '₹3,200', gstAmount: '₹576', date: 'Yesterday', status: 'PROCESSED' },
    { id: 'PUR-399', supplier: 'Tech Solutions', amount: '₹45,000', gstAmount: '₹8,100', date: '2 days ago', status: 'PROCESSED' },
  ]

  const filters = [
    { id: 'ALL', label: 'All' },
    { id: 'FAILED', label: 'Failed' },
    { id: 'NEEDS_REVIEW', label: 'Needs Review' },
    { id: 'PROCESSED', label: 'Processed' },
  ]

  const filteredPurchases = useMemo(() => {
    return purchases
      .filter(p => {
        const matchesFilter = activeFilter === 'ALL' || p.status === activeFilter
        const matchesSearch = p.supplier.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             p.id.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesFilter && matchesSearch
      })
      .sort((a, b) => {
        const priority: Record<PurchaseStatus, number> = { FAILED: 0, NEEDS_REVIEW: 1, PROCESSED: 2 }
        return priority[a.status] - priority[b.status]
      })
  }, [activeFilter, searchQuery])

  return (
    <div className="space-y-6 animate-fade-in pb-24">
      <header className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground italic uppercase">Purchases</h1>
          <p className="text-[10px] font-black text-muted-foreground mt-1 uppercase tracking-[0.2em]">Automated Expense Engine</p>
        </div>
        <button 
          onClick={() => router.push('/scan')}
          className="w-12 h-12 bg-primary text-primary-foreground rounded-2xl shadow-glow flex items-center justify-center active:scale-90 transition-all group"
        >
          <Camera className="w-6 h-6 group-hover:scale-110 transition-transform" />
        </button>
      </header>

      {/* Search & Filters */}
      <div className="space-y-4">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search supplier or bill #" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-base pl-11 py-6 bg-card/50 border-none shadow-sm text-sm font-medium"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none px-1">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id as any)}
              className={cn(
                "px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border",
                activeFilter === filter.id 
                  ? "bg-primary border-primary text-primary-foreground shadow-glow" 
                  : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Purchase List */}
      <div className="space-y-3 px-1">
        {filteredPurchases.length > 0 ? (
          filteredPurchases.map((p) => (
            <div 
              key={p.id} 
              onClick={() => router.push(`/purchases/${p.id}`)}
              className="card-base p-4 border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-all group cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
                    p.status === 'PROCESSED' && "bg-success-soft text-success",
                    p.status === 'NEEDS_REVIEW' && "bg-warning-soft text-warning",
                    p.status === 'FAILED' && "bg-destructive/10 text-destructive shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                  )}>
                    {p.status === 'PROCESSED' ? <CheckCircle2 className="w-6 h-6" /> : 
                     p.status === 'FAILED' ? <FileWarning className="w-6 h-6 animate-pulse" /> : 
                     <AlertCircle className="w-6 h-6" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-base text-foreground leading-none truncate pr-2">{p.supplier}</p>
                    <p className="text-[10px] font-bold text-muted-foreground mt-2 uppercase tracking-widest">
                      {p.id} • {p.date}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black tracking-tight">{p.amount}</p>
                  <p className="text-[9px] font-bold text-success mt-0.5 uppercase tracking-tighter">GST: {p.gstAmount}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                {p.status === 'FAILED' ? (
                  <>
                    <button 
                      onClick={(e) => { e.stopPropagation(); router.push('/scan') }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest shadow-glow active:scale-95 transition-all"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" /> Retry OCR
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); router.push('/purchases/new') }}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-secondary text-secondary-foreground text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                    >
                      <Keyboard className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : p.status === 'NEEDS_REVIEW' ? (
                  <button 
                    onClick={(e) => { e.stopPropagation(); router.push(`/purchases/${p.id}`) }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-warning text-warning-foreground text-[10px] font-black uppercase tracking-widest shadow-elegant active:scale-95 transition-all"
                  >
                    <AlertCircle className="w-3.5 h-3.5" /> Review Now
                  </button>
                ) : (
                  <button 
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary text-secondary-foreground text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" /> View Record
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
              <Store className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold text-foreground italic uppercase">No Purchases</h2>
            <p className="text-xs text-muted-foreground mt-2 max-w-[200px] leading-relaxed font-bold uppercase tracking-widest opacity-60">
              Scan your first bill to track expenses and auto-update inventory.
            </p>
            <button 
              onClick={() => router.push('/scan')}
              className="mt-8 btn-base bg-primary text-primary-foreground px-10 py-4 font-black uppercase tracking-widest shadow-glow flex items-center gap-3"
            >
              <Camera className="w-5 h-5" />
              Scan Bill
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
