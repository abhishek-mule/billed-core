'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Plus, 
  Search, 
  Send, 
  Eye, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  MoreVertical,
  ChevronRight,
  Filter
} from 'lucide-react'
import { cn } from '@/lib/utils'

type InvoiceStatus = 'PAID' | 'UNPAID' | 'OVERDUE'

interface Invoice {
  id: string
  customer: string
  amount: string
  date: string
  status: InvoiceStatus
  dueDate?: string
}

export default function InvoicesPage() {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<'ALL' | InvoiceStatus>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [invoices, setInvoices] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchInvoices = async () => {
      setIsLoading(true)
      try {
        const res = await fetch('/api/merchant/invoices?limit=50')
        const json = await res.json()
        if (json.invoices) {
          setInvoices(json.invoices.map((inv: any) => ({
            id: inv.name,
            customer: inv.customer_name,
            amount: `₹${inv.grand_total.toLocaleString()}`,
            date: new Date(inv.posting_date).toLocaleDateString(),
            status: inv.outstanding_amount > 0 ? 'UNPAID' : 'PAID',
            dbId: inv.id || inv.name
          })))
        }
      } catch (e) {
        console.error('Failed to fetch invoices', e)
      } finally {
        setIsLoading(false)
      }
    }
    fetchInvoices()
  }, [])

  const filters = [
    { id: 'ALL', label: 'All' },
    { id: 'UNPAID', label: 'Unpaid' },
    { id: 'PAID', label: 'Paid' },
  ]

  const filteredInvoices = useMemo(() => {
    return invoices
      .filter(inv => {
        const matchesFilter = activeFilter === 'ALL' || inv.status === activeFilter
        const matchesSearch = inv.customer.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             inv.id.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesFilter && matchesSearch
      })
  }, [activeFilter, searchQuery, invoices])

  const handleReminder = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    console.log(`Sending reminder for ${id}`)
    // Logic for instant reminder
  }

  return (
    <div className="space-y-6 animate-fade-in pb-24">
      <header className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Invoices</h1>
          <p className="text-xs font-bold text-muted-foreground mt-1 uppercase tracking-widest">Money Flow Engine</p>
        </div>
        <button 
          onClick={() => router.push('/invoices/new')}
          className="w-12 h-12 bg-primary text-primary-foreground rounded-2xl shadow-glow flex items-center justify-center active:scale-90 transition-all"
        >
          <Plus className="w-6 h-6" />
        </button>
      </header>

      {/* Search & Filters */}
      <div className="space-y-4">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search name, phone or invoice #" 
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
                "px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border",
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

      {/* Invoice List */}
      <div className="space-y-3 px-1">
        {filteredInvoices.length > 0 ? (
          filteredInvoices.map((inv) => (
            <div 
              key={inv.id} 
              onClick={() => router.push(`/invoices/${inv.dbId}`)}
              className="card-base p-4 border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-all group cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
                    inv.status === 'PAID' && "bg-success-soft text-success",
                    inv.status === 'UNPAID' && "bg-warning-soft text-warning",
                    inv.status === 'OVERDUE' && "bg-destructive/10 text-destructive"
                  )}>
                    {inv.status === 'PAID' ? <CheckCircle2 className="w-6 h-6" /> : 
                     inv.status === 'OVERDUE' ? <AlertCircle className="w-6 h-6" /> : 
                     <Clock className="w-6 h-6" />}
                  </div>
                  <div>
                    <p className="font-bold text-base text-foreground leading-none">{inv.customer}</p>
                    <p className="text-[10px] font-bold text-muted-foreground mt-2 uppercase tracking-widest">
                      {inv.id} • {inv.date}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black tracking-tight">{inv.amount}</p>
                  <div className={cn(
                    "text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-full inline-block mt-1.5",
                    inv.status === 'PAID' && "bg-success-soft text-success",
                    inv.status === 'UNPAID' && "bg-warning-soft text-warning",
                    inv.status === 'OVERDUE' && "bg-destructive/10 text-destructive"
                  )}>
                    {inv.status}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                {inv.status !== 'PAID' && (
                  <button 
                    onClick={(e) => handleReminder(e, inv.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest shadow-glow active:scale-95 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" /> Send Reminder
                  </button>
                )}
                <button 
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all bg-secondary text-secondary-foreground",
                    inv.status === 'PAID' ? "flex-1" : "px-4"
                  )}
                >
                  <Eye className="w-3.5 h-3.5" /> {inv.status === 'PAID' ? 'View Details' : ''}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
              <FileText className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold text-foreground">No Invoices Found</h2>
            <p className="text-xs text-muted-foreground mt-2 max-w-[200px] leading-relaxed">
              Create your first invoice to start tracking payments and growing your business.
            </p>
            <button 
              onClick={() => router.push('/invoices/new')}
              className="mt-8 btn-base bg-primary text-primary-foreground px-8 py-3 font-black uppercase tracking-widest shadow-glow"
            >
              Create Invoice
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function FileText(props: any) {
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
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  )
}
