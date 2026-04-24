'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'

interface DashboardStats {
  todaySales: number
  todayInvoices: number
  pendingPayments: number
  pendingCount: number
  customerCount: number
  lowStockCount: number
}

interface RecentInvoice {
  name: string
  customer_name: string
  grand_total: number
  posting_date: string
  outstanding_amount: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [invoices, setInvoices] = useState<RecentInvoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const [statsRes, invoicesRes] = await Promise.all([
          fetch('/api/merchant/stats'),
          fetch('/api/merchant/invoices?limit=5'),
        ])

        if (statsRes.ok) {
          const statsData = await statsRes.json()
          setStats(statsData)
        }

        if (invoicesRes.ok) {
          const invoicesData = await invoicesRes.json()
          setInvoices(invoicesData.invoices || [])
        }
      } catch (error) {
        console.error('Failed to load dashboard:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  const getStatus = (invoice: RecentInvoice) => {
    if (invoice.outstanding_amount <= 0) return 'Paid'
    return 'Pending'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 gap-3"
      >
        <div className="bg-[#16161a] rounded-xl p-4 border border-white/5">
          <p className="text-xs text-gray-500 mb-1">Today Revenue</p>
          <p className="text-xl font-semibold text-white">
            {stats ? formatCurrency(stats.todaySales) : '₹0'}
          </p>
        </div>
        <div className="bg-[#16161a] rounded-xl p-4 border border-white/5">
          <p className="text-xs text-gray-500 mb-1">Invoices</p>
          <p className="text-xl font-semibold text-white">
            {stats?.todayInvoices || 0}
          </p>
        </div>
        <div className="bg-[#16161a] rounded-xl p-4 border border-white/5">
          <p className="text-xs text-gray-500 mb-1">Customers</p>
          <p className="text-xl font-semibold text-white">
            {stats?.customerCount || 0}
          </p>
        </div>
        <div className="bg-[#16161a] rounded-xl p-4 border border-white/5">
          <p className="text-xs text-gray-500 mb-1">Pending</p>
          <p className="text-xl font-semibold text-amber-400">
            {stats ? formatCurrency(stats.pendingPayments) : '₹0'}
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/merchant/invoice/new"
          className="bg-indigo-600 hover:bg-indigo-500 rounded-xl p-4 text-center transition-colors"
        >
          <p className="font-semibold">+ New Invoice</p>
        </Link>
        <Link
          href="/merchant/customers"
          className="bg-[#16161a] border border-white/10 rounded-xl p-4 text-center hover:bg-white/5 transition-colors"
        >
          <p className="font-semibold text-gray-300">Customers</p>
        </Link>
      </div>

      <div className="bg-[#16161a] rounded-xl border border-white/5 overflow-hidden">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="font-semibold">Recent Invoices</h2>
          <Link href="/merchant/invoice" className="text-xs text-indigo-400">View All</Link>
        </div>
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-sm">No invoices yet</p>
            <Link href="/merchant/invoice/new" className="text-indigo-400 text-sm mt-2 block">
              Create your first invoice →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {invoices.map((inv) => (
              <div key={inv.name} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{inv.customer_name || 'Customer'}</p>
                  <p className="text-xs text-gray-500">{formatDate(inv.posting_date)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(inv.grand_total)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    getStatus(inv) === 'Paid' 
                      ? 'bg-emerald-500/10 text-emerald-400' 
                      : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {getStatus(inv)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}