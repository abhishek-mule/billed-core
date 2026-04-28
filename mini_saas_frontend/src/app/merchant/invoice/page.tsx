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
import { InvoiceDetailsModal } from '@/components/invoice/InvoiceDetailsModal'

const mockInvoices = [
  { 
    id: 'INV-0034', 
    date: '4:12 PM', 
    customerName: 'Anjali Sharma', 
    customerPhone: '919876543210',
    amount: 4671, 
    paymentStatus: 'UNPAID' as const, 
    syncStatus: 'LOCAL' as const,
    items: [
      { name: 'Surf Excel 1kg', qty: 4, rate: 245, gst: 18, hsn: '3402' },
      { name: 'Aashirvaad Atta 5kg', qty: 8, rate: 285, gst: 5, hsn: '1101' },
      { name: 'Colgate Toothpaste', qty: 10, rate: 95, gst: 18, hsn: '3306' },
    ]
  },
  { 
    id: 'INV-23-0145', 
    date: '2 mins ago', 
    customerName: 'Arjun Kumar', 
    customerPhone: '918888888888',
    amount: 18306, 
    paymentStatus: 'PAID' as const, 
    syncStatus: 'SYNCED' as const,
    items: [{ name: 'Monitor X', qty: 1, rate: 18306, gst: 18, hsn: '8471' }]
  },
  { 
    id: 'INV-23-0144', 
    date: '15 mins ago', 
    customerName: 'TechCorp Solutions', 
    customerPhone: '917777777777',
    amount: 45200, 
    paymentStatus: 'PENDING' as const, 
    syncStatus: 'SYNCED' as const,
    items: [{ name: 'Laptop Pro', qty: 2, rate: 22600, gst: 18, hsn: '8471' }]
  },
]

export default function InvoiceListPage() {
  const [search, setSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleRowClick = (inv: any) => {
    setSelectedInvoice(inv)
    setIsModalOpen(true)
  }

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
      case 'LOCAL': return 'bg-amber-50 text-amber-600 border-amber-100'
      case 'UNPAID':
      case 'FAILED': return 'bg-rose-50 text-rose-600 border-rose-100'
      default: return 'bg-gray-50 text-gray-600 border-gray-100'
    }
  }

  return (
    <div className="space-y-8 animate-in">
      <InvoiceDetailsModal 
        invoice={selectedInvoice} 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Sales Invoices</h1>
          <p className="text-gray-500 text-sm font-medium italic">Manage and track your customer billing history.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.open('/api/export?type=invoices&format=csv')}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2.5 rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-50 transition-all"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button 
            onClick={() => window.open('/api/export?type=products&format=csv')}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2.5 rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-50 transition-all"
          >
            <Download className="w-4 h-4" />
            Products
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
                <tr 
                  key={inv.id} 
                  onClick={() => handleRowClick(inv)}
                  className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-5">
                    <p className="text-sm font-black text-gray-900 group-hover:text-primary transition-colors">{inv.id}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{inv.date}</p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-sm font-bold text-gray-700">{inv.customerName}</p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-sm font-black text-gray-900">{formatCurrency(inv.amount)}</p>
                  </td>
                  <td className="px-6 py-5">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getBadgeStyle(inv.paymentStatus)}`}>
                      {inv.paymentStatus === 'PAID' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {inv.paymentStatus}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getBadgeStyle(inv.syncStatus)}`}>
                      {inv.syncStatus === 'SYNCED' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {inv.syncStatus}
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
          <span className="text-xs font-medium text-gray-400">Showing {mockInvoices.length} of 1,248 invoices</span>
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