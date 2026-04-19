'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'

interface Stats {
  todaySales: number
  todayInvoices: number
  pendingPayments: number
  lowStockCount: number
}

interface RecentInvoice {
  name: string
  customer_name: string
  total: number
  outstanding_amount: number
  docstatus: number
  creation: string
}

const mockStats: Stats = {
  todaySales: 15680,
  todayInvoices: 12,
  pendingPayments: 3,
  lowStockCount: 5
}

const mockRecentInvoices: RecentInvoice[] = [
  { name: 'INV-2024-001', customer_name: 'Rajesh Kumar', total: 4500, outstanding_amount: 0, docstatus: 1, creation: '2024-01-15T10:30:00' },
  { name: 'INV-2024-002', customer_name: 'Amit Sharma', total: 2800, outstanding_amount: 2800, docstatus: 1, creation: '2024-01-15T11:45:00' },
  { name: 'INV-2024-003', customer_name: 'Suresh Gupta', total: 7200, outstanding_amount: 0, docstatus: 1, creation: '2024-01-14T16:20:00' },
]

export default function MerchantDashboard() {
  const [stats, setStats] = useState<Stats>(mockStats)
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>(mockRecentInvoices)
  const [lang, setLang] = useState<'en' | 'hi'>('en')

  const t = {
    en: {
      todaySales: "Today's Sales",
      invoices: 'Invoices',
      pending: 'Pending',
      lowStock: 'Low Stock',
      quickActions: 'Quick Actions',
      newInvoice: 'New Invoice',
      scanBill: 'Scan Bill',
      customers: 'Customers',
      recentSales: 'Recent Sales',
      viewAll: 'View All',
      paid: 'Paid',
      due: 'Due',
      createFirstInvoice: 'Create your first invoice',
      goToInvoice: 'Create Invoice →',
    },
    hi: {
      todaySales: 'आज की बिक्री',
      invoices: 'बिल',
      pending: 'बकाया',
      lowStock: 'कम स्टॉक',
      quickActions: 'त्वरित कार्य',
      newInvoice: 'नया बिल',
      scanBill: 'बिल स्कैन करें',
      customers: 'ग्राहक',
      recentSales: 'हाल की बिक्री',
      viewAll: 'सभी देखें',
      paid: 'भुगतान',
      due: 'देय',
      createFirstInvoice: 'अपना पहला बिल बनाएं',
      goToInvoice: 'बिल बनाएं →',
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR',
      maximumFractionDigits: 0 
    }).format(amount)
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return date.toLocaleDateString('en-IN')
  }

  return (
    <div className="p-4 space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="col-span-2 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 rounded-2xl p-5"
        >
          <p className="text-xs font-medium text-emerald-400/80 uppercase tracking-wider">
            {t[lang].todaySales}
          </p>
          <p className="text-3xl font-black mt-1 tracking-tight">
            {formatCurrency(stats.todaySales)}
          </p>
          <p className="text-xs text-emerald-400/60 mt-1">
            {stats.todayInvoices} {t[lang].invoices} today
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/5 border border-white/5 rounded-2xl p-4"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center mb-3">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-xl font-bold">{stats.pendingPayments}</p>
          <p className="text-[10px] text-gray-500 font-medium uppercase">{t[lang].pending}</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white/5 border border-white/5 rounded-2xl p-4"
        >
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center mb-3">
            <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-xl font-bold">{stats.lowStockCount}</p>
          <p className="text-[10px] text-gray-500 font-medium uppercase">{t[lang].lowStock}</p>
        </motion.div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
            {t[lang].quickActions}
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Link href="/merchant/invoice/new" className="flex flex-col items-center gap-2 p-4 bg-indigo-600 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-xs font-bold text-white">{t[lang].newInvoice}</span>
          </Link>

          <button className="flex flex-col items-center gap-2 p-4 bg-white/5 border border-white/5 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-gray-400">{t[lang].scanBill}</span>
          </button>

          <Link href="/merchant/customers" className="flex flex-col items-center gap-2 p-4 bg-white/5 border border-white/5 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-gray-400">{t[lang].customers}</span>
          </Link>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
            {t[lang].recentSales}
          </h2>
          <button className="text-xs font-bold text-indigo-400">{t[lang].viewAll}</button>
        </div>
        
        {recentInvoices.length === 0 ? (
          <div className="text-center py-12 bg-white/[0.02] border-2 border-dashed border-white/5 rounded-2xl">
            <p className="text-gray-500 font-medium">{t[lang].createFirstInvoice}</p>
            <Link href="/merchant/invoice/new" className="text-indigo-400 text-sm font-bold mt-2 inline-block">
              {t[lang].goToInvoice}
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentInvoices.map((invoice, i) => (
              <motion.div 
                key={invoice.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{invoice.customer_name}</p>
                  <p className="text-xs text-gray-500">{formatTime(invoice.creation)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{formatCurrency(invoice.total)}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    invoice.outstanding_amount === 0 
                      ? 'bg-emerald-500/10 text-emerald-400' 
                      : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {invoice.outstanding_amount === 0 ? t[lang].paid : t[lang].due}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}