'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { 
  Search, 
  Filter, 
  Download, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  MoreHorizontal,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { InvoiceDetailsModal } from '@/components/invoice/InvoiceDetailsModal'
import { useInvoices } from '@/hooks/useApi'
import { formatINR } from '@/lib/api-client'
import { TableSkeleton } from '@/components/ui/Skeleton'

export default function InvoiceListPage() {
  const [search, setSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [syncFilter, setSyncFilter] = useState<string>('')
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch } = useInvoices(undefined, 50)
  const invoices = data?.invoices || []

  const filtered = useMemo(() => {
    return invoices.filter((inv: any) => {
      const idStr = String(inv.name || inv.id || '')
      const customerStr = String(inv.customer_name || '')
      
      const matchSearch = !search || 
        idStr.toLowerCase().includes(search.toLowerCase()) ||
        customerStr.toLowerCase().includes(search.toLowerCase())
        
      const paymentStatus = inv.outstanding_amount > 0 ? 'UNPAID' : 'PAID'
      const matchStatus = !statusFilter || paymentStatus === statusFilter
      const matchSync = !syncFilter || (inv.sync_status || 'LOCAL') === syncFilter
      
      return matchSearch && matchStatus && matchSync
    })
  }, [invoices, search, statusFilter, syncFilter])

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setSyncFilter('')
  }

  const hasFilters = statusFilter || syncFilter || search

  const handleRowClick = (inv: any) => {
    setSelectedInvoice(inv)
    setIsModalOpen(true)
  }

  const getBadgeStyle = (status: string) => {
    switch (status) {
      case 'PAID':
      case 'SYNCED': return 'bg-success-soft text-success border-success/20'
      case 'PENDING':
      case 'LOCAL': return 'bg-warning-soft text-warning border-warning/20'
      case 'UNPAID':
      case 'FAILED': return 'bg-destructive/10 text-destructive border-destructive/20'
      default: return 'bg-secondary text-secondary-foreground border-border'
    }
  }

  const totalSales = useMemo(() => {
    return invoices.reduce((sum: number, inv: any) => sum + (Number(inv.grand_total) || 0), 0)
  }, [invoices])

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-6 animate-in slide-in-from-right-2">
      <InvoiceDetailsModal 
        invoice={selectedInvoice} 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Sales Invoices</h1>
          <p className="text-muted-foreground text-sm">Manage and track your customer billing history.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${
              showFilters || hasFilters ? 'border-primary bg-primary/5 text-primary' : 'border-input bg-background text-muted-foreground'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasFilters && <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px]">{(statusFilter ? 1 : 0) + (syncFilter ? 1 : 0)}</span>}
          </button>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-destructive">
              Clear
            </button>
          )}
          <button 
            onClick={async () => {
              try {
                const res = await fetch('/api/merchant/invoice/retry-all', { method: 'POST' })
                const data = await res.json()
                if (data.succeeded !== undefined) {
                  refetch()
                }
              } catch {
                // Ignore
              }
            }}
            className="flex items-center gap-2 bg-warning-soft border border-warning/20 px-4 py-2 rounded-xl font-medium text-sm text-warning-foreground hover:bg-warning/20 transition-all"
          >
            <AlertCircle className="w-4 h-4" />
            Retry Failed
          </button>
          <button 
            onClick={() => window.open('/api/export?type=invoices&format=csv')}
            className="flex items-center gap-2 bg-card border border-border px-4 py-2 rounded-xl font-medium text-sm text-foreground hover:bg-muted transition-all"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Payment Status</label>
              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 h-9 rounded-lg border border-input bg-background px-3 text-sm min-w-[140px]"
              >
                <option value="">All</option>
                <option value="PAID">Paid</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Sync Status</label>
              <select 
                value={syncFilter} 
                onChange={(e) => setSyncFilter(e.target.value)}
                className="mt-1 h-9 rounded-lg border border-input bg-background px-3 text-sm min-w-[140px]"
              >
                <option value="">All</option>
                <option value="SYNCED">Synced</option>
                <option value="FAILED">Failed</option>
                <option value="LOCAL">Local Only</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Search</label>
              <div className="mt-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Invoice #, customer name..."
                  className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 relative group">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search by invoice ID or customer name..." 
            className="w-full bg-card border border-border rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="lg:col-span-4 bg-primary/10 border border-primary/20 rounded-2xl px-5 py-3 flex items-center justify-between">
           <div className="flex flex-col">
             <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Total Sales</span>
             <span className="text-xl font-bold text-primary">{formatINR(totalSales)}</span>
           </div>
           <ArrowUpRight className="w-6 h-6 text-primary/50" />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Invoice</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Customer</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Amount</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Payment</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sync</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <TableSkeleton rows={5} cols={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground text-sm">
                    {search || statusFilter || syncFilter ? 'No invoices match your filters.' : 'No invoices found. Create your first one!'}
                  </td>
                </tr>
              ) : (
                filtered.map((inv: any) => {
                  const paymentStatus = inv.outstanding_amount > 0 ? 'UNPAID' : 'PAID'
                  const syncStatus = inv.sync_status || 'LOCAL'
                  
                  return (
                    <tr 
                      key={inv.name || inv.id} 
                      onClick={() => handleRowClick(inv)}
                      className="hover:bg-muted/40 transition-colors group cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{inv.name || inv.id}</p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">{inv.posting_date ? new Date(inv.posting_date).toLocaleDateString() : 'Just now'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-foreground">{inv.customer_name || 'Unknown'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-foreground">{formatINR(Number(inv.grand_total) || 0)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${getBadgeStyle(paymentStatus)}`}>
                          {paymentStatus === 'PAID' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {paymentStatus}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${getBadgeStyle(syncStatus)}`}>
                          {syncStatus === 'SYNCED' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {syncStatus}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length > 0 && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-muted/20">
            <span className="text-xs font-medium text-muted-foreground">Showing {filtered.length} of {invoices.length} invoices</span>
            <div className="flex items-center gap-2">
              <button className="p-2 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                 <button className="w-8 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-medium">1</button>
              </div>
              <button className="p-2 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}