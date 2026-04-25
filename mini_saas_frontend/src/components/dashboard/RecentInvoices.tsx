'use client'

import { useEffect, useState } from 'react'
import { FileText, ChevronLeft, ChevronRight, MoreHorizontal, CheckCircle2, Clock, AlertCircle, RotateCw } from 'lucide-react'
import Link from 'next/link'

interface Invoice {
  id: string
  created_at: string
  customer_name: string
  amount: number
  payment_status: 'PAID' | 'PENDING' | 'UNPAID'
  sync_status: 'SYNCED' | 'RETRYING' | 'FAILED'
}

export function RecentInvoices() {
  const [invoices] = useState<Invoice[]>([
    { id: 'INV-23-0145', created_at: '2 mins ago', customer_name: 'Arjun Kumar', amount: 18306, payment_status: 'PAID', sync_status: 'SYNCED' },
    { id: 'INV-23-0144', created_at: '15 mins ago', customer_name: 'TechCorp Solutions', amount: 45200, payment_status: 'PENDING', sync_status: 'SYNCED' },
    { id: 'INV-23-0143', created_at: '1 hour ago', customer_name: 'Meera Sharma', amount: 2150, payment_status: 'PAID', sync_status: 'RETRYING' },
    { id: 'INV-23-0142', created_at: '3 hours ago', customer_name: 'Walk-in Customer', amount: 850, payment_status: 'PAID', sync_status: 'FAILED' },
    { id: 'INV-23-0141', created_at: '4 hours ago', customer_name: 'Ramesh Hardware', amount: 12400, payment_status: 'UNPAID', sync_status: 'SYNCED' },
  ])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const getPaymentBadge = (status: string) => {
    switch (status) {
      case 'PAID': return 'bg-emerald-50 text-emerald-600 border-emerald-100'
      case 'PENDING': return 'bg-amber-50 text-amber-600 border-amber-100'
      case 'UNPAID': return 'bg-rose-50 text-rose-600 border-rose-100'
      default: return 'bg-gray-50 text-gray-600 border-gray-100'
    }
  }

  const getSyncBadge = (status: string) => {
    switch (status) {
      case 'SYNCED': return 'bg-emerald-50 text-emerald-600 border-emerald-100'
      case 'RETRYING': return 'bg-amber-50 text-amber-600 border-amber-100'
      case 'FAILED': return 'bg-rose-50 text-rose-600 border-rose-100'
      default: return 'bg-gray-50 text-gray-600 border-gray-100'
    }
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
        <h2 className="text-xl font-black text-gray-900 tracking-tight">Recent Invoices & Sync Status</h2>
        <button className="text-xs font-bold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          View All
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Invoice</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Created</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">ERP Ledger Sync</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors group">
                <td className="px-6 py-4">
                  <span className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors cursor-pointer">{inv.id}</span>
                </td>
                <td className="px-6 py-4 text-xs font-medium text-gray-500">{inv.created_at}</td>
                <td className="px-6 py-4 text-sm font-bold text-gray-700">{inv.customer_name}</td>
                <td className="px-6 py-4">
                  <span className="text-sm font-black text-gray-900">{formatCurrency(inv.amount)}</span>
                </td>
                <td className="px-6 py-4">
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getPaymentBadge(inv.payment_status)}`}>
                    {inv.payment_status === 'PAID' && <CheckCircle2 className="w-3 h-3" />}
                    {inv.payment_status === 'PENDING' && <Clock className="w-3 h-3" />}
                    {inv.payment_status === 'UNPAID' && <AlertCircle className="w-3 h-3" />}
                    {inv.payment_status}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getSyncBadge(inv.sync_status)}`}>
                    {inv.sync_status === 'SYNCED' && <CheckCircle2 className="w-3 h-3" />}
                    {inv.sync_status === 'RETRYING' && <RotateCw className="w-3 h-3 animate-spin" />}
                    {inv.sync_status === 'FAILED' && <AlertCircle className="w-3 h-3" />}
                    {inv.sync_status}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-gray-50 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">Showing 1 to 5 of 142 entries</span>
        <div className="flex items-center gap-2">
          <button className="p-2 border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 transition-all active:scale-95">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1">
             <button className="w-8 h-8 rounded-lg bg-primary text-white text-xs font-bold shadow-sm shadow-primary/20">1</button>
             <button className="w-8 h-8 rounded-lg hover:bg-gray-50 text-gray-500 text-xs font-bold transition-all">2</button>
             <button className="w-8 h-8 rounded-lg hover:bg-gray-50 text-gray-500 text-xs font-bold transition-all">3</button>
          </div>
          <button className="p-2 border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 transition-all active:scale-95">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}