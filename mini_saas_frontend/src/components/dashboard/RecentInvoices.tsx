'use client'

import { useEffect, useState } from 'react'
import { FileText, ChevronRight, ArrowUpRight, Search, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'

interface Invoice {
  name: string
  customer_name: string
  grand_total: number
  posting_date: string
  outstanding_amount: number
  status: 'Paid' | 'Unpaid' | 'Failed'
}

export function RecentInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([
    // Mocking some data for immediate visual feedback as per screenshot
    { name: 'INV-842', customer_name: 'Anjali Sharma', grand_total: 4200, posting_date: new Date().toISOString(), outstanding_amount: 4200, status: 'Failed' },
    { name: 'INV-841', customer_name: 'Rahul Verma', grand_total: 1850, posting_date: new Date().toISOString(), outstanding_amount: 1850, status: 'Unpaid' },
    { name: 'INV-840', customer_name: 'Sneha Patil', grand_total: 950, posting_date: new Date().toISOString(), outstanding_amount: 950, status: 'Unpaid' },
    { name: 'INV-839', customer_name: 'Amit Kumar', grand_total: 3400, posting_date: new Date().toISOString(), outstanding_amount: 0, status: 'Paid' },
    { name: 'INV-838', customer_name: 'Vikram Singh', grand_total: 5600, posting_date: new Date().toISOString(), outstanding_amount: 0, status: 'Paid' },
  ])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'All' | 'Today' | 'Unpaid'>('All')

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return 'bg-emerald-50 text-emerald-600 border-emerald-100'
      case 'Unpaid': return 'bg-rose-50 text-rose-600 border-rose-100'
      case 'Failed': return 'bg-amber-50 text-amber-600 border-amber-100'
      default: return 'bg-slate-50 text-slate-600 border-slate-100'
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters - Matching Screenshot 4 */}
      <div className="flex items-center gap-2 px-1">
        {['All', 'Today', 'Unpaid'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-6 py-2 rounded-full text-xs font-bold transition-all border ${
              filter === f 
                ? 'bg-black text-white border-black' 
                : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Sync Failure Banner - Matching Screenshot 4 */}
      <div className="flex items-center justify-between bg-amber-50 border-y border-amber-100 px-4 py-2">
        <div className="flex items-center gap-2 text-amber-900 font-bold text-[11px]">
          <SlidersHorizontal className="w-4 h-4 rotate-90" />
          <span>1 FAILED SYNC</span>
        </div>
        <button className="text-amber-900 font-black text-[11px] tracking-tight">RETRY ALL</button>
      </div>

      {/* Invoice List */}
      <div className="divide-y divide-slate-100 bg-white">
        {invoices.map((invoice) => (
          <Link
            key={invoice.name}
            href={`/merchant/invoice/${invoice.name}`}
            className="flex items-center justify-between px-4 py-4 hover:bg-slate-50 active:bg-slate-100 transition-colors"
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-bold text-[#1A1C1E] tracking-tight">{invoice.customer_name}</h3>
              <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                <span>{invoice.name}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span>Today, {formatTime(invoice.posting_date)}</span>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-base font-bold text-[#1A1C1E]">{formatCurrency(invoice.grand_total)}</span>
              <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${getStatusColor(invoice.status)}`}>
                {invoice.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}