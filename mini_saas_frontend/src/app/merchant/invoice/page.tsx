'use client'

import { useState } from 'react'
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

const mockInvoices = [
  { id: 'INV-23-0145', date: '2 mins ago', customer: 'Arjun Kumar', amount: 18306, payment: 'PAID', sync: 'SYNCED' },
  { id: 'INV-23-0144', date: '15 mins ago', customer: 'TechCorp Solutions', amount: 45200, payment: 'PENDING', sync: 'SYNCED' },
  { id: 'INV-23-0143', date: '1 hour ago', customer: 'Meera Sharma', amount: 2150, payment: 'PAID', sync: 'RETRYING' },
  { id: 'INV-23-0142', date: '3 hours ago', customer: 'Walk-in Customer', amount: 850, payment: 'PAID', sync: 'FAILED' },
  { id: 'INV-23-0141', date: '4 hours ago', customer: 'Ramesh Hardware', amount: 12400, payment: 'UNPAID', sync: 'SYNCED' },
  { id: 'INV-23-0140', date: 'Yesterday', customer: 'Suresh & Co', amount: 9200, payment: 'PAID', sync: 'SYNCED' },
]

export default function InvoiceListPage() {
  const [search, setSearch] = useState('')

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const getBadgeStyle = (status: string) => {
    switch (status) {
      case 'PAID':
      case 'SYNCED': return 'bg-emerald-50 text-emerald-600 border-emerald-100'
      case 'PENDING':
      case 'RETRYING': return 'bg-amber-50 text-amber-600 border-amber-100'
      case 'UNPAID':
      case 'FAILED': return 'bg-rose-50 text-rose-600 border-rose-100'
      default: return 'bg-gray-50 text-gray-600 border-gray-100'
    }
  }

  return (
    <div className="space-y-8 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Sales Invoices</h1>
          <p className="text-gray-500 text-sm font-medium italic">Manage and track your customer billing history.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2.5 rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-50 transition-all">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <Link 
            href="/merchant/invoice/new"
            className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            New Invoice
          </Link>
        </div>
      </div>

      {/* Search & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 relative group">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-300 group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search by invoice ID or customer name..." 
            className="w-full bg-white border border-gray-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:outline-none ring-4 ring-primary/0 focus:ring-primary/5 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="lg:col-span-4 bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-3 flex items-center justify-between">
           <div className="flex flex-col">
             <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Total Sales (Today)</span>
             <span className="text-xl font-black text-indigo-700">₹28,450</span>
           </div>
           <ArrowUpRight className="w-6 h-6 text-indigo-300" />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Invoice</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Sync</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mockInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors group cursor-pointer">
                  <td className="px-6 py-5">
                    <p className="text-sm font-black text-gray-900 group-hover:text-primary transition-colors">{inv.id}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{inv.date}</p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-sm font-bold text-gray-700">{inv.customer}</p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-sm font-black text-gray-900">{formatCurrency(inv.amount)}</p>
                  </td>
                  <td className="px-6 py-5">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getBadgeStyle(inv.payment)}`}>
                      {inv.payment === 'PAID' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {inv.payment}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getBadgeStyle(inv.sync)}`}>
                      {inv.sync === 'SYNCED' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {inv.sync}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-300 transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-gray-50 flex items-center justify-between bg-gray-50/30">
          <span className="text-xs font-medium text-gray-400">Showing 6 of 1,248 invoices</span>
          <div className="flex items-center gap-2">
            <button className="p-2 border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 transition-all">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
               <button className="w-8 h-8 rounded-lg bg-primary text-white text-xs font-bold">1</button>
               <button className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 text-xs font-bold transition-all">2</button>
            </div>
            <button className="p-2 border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 transition-all">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}