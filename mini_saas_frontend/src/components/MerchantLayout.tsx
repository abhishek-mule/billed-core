'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'

interface NavItem {
  id: string
  label: string
  labelHi: string
  href: string
  icon: string
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', labelHi: 'डैशबोर्ड', href: '/merchant', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'invoice', label: 'Invoices', labelHi: 'बिल', href: '/merchant/invoice/new', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'customers', label: 'Customers', labelHi: 'ग्राहक', href: '/merchant/customers', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'products', label: 'Products', labelHi: 'सामान', href: '/merchant/products', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'reports', label: 'Reports', labelHi: 'रिपोर्ट', href: '/merchant/reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'settings', label: 'Settings', labelHi: 'सेटिंग्स', href: '/merchant/settings', icon: 'M10.325 4.317c.426-1.256 1.623-1.317 2.649-.313 1.263-.395 2.002.45 2.646.91-.313 1.025-1.262 1.649-2.395M6.313 4.683c.426 1.256 1.622 1.317 2.65.313 1.262.395 2.001-.45 2.645-.91.313-1.025 1.262-1.649 2.395m-.002 9.317c-1.256-.426-1.622-1.317-2.65-.313-1.262-.395-2.001.45-2.645.91.313 1.025 1.262 1.649 2.395' },
]

const quickActions = [
  { id: 'new-invoice', label: 'New Invoice', labelHi: 'नया बिल', icon: 'M12 4v16m8-8H4', color: 'indigo' },
  { id: 'scan-barcode', label: 'Scan Item', labelHi: 'स्कैन करें', icon: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z', color: 'emerald' },
  { id: 'add-customer', label: 'Add Customer', labelHi: 'ग्राहक जोड़ें', icon: 'M18 9v3m0 0v3m0-3h-3m-3 0h3m-3-3a3 3 0 100-6 3M7 9a3 3 0 100-6 3M7 9v3m0 0v3m0-3h3m-3 0h-3', color: 'purple' },
]

const statCards = [
  { id: 'today-sales', label: "Today's Sales", value: '₹24,580', change: '+12.5%', positive: true },
  { id: 'pending', label: 'Pending', value: '₹12,400', count: '3 due', positive: false },
  { id: 'customers', label: 'Customers', value: '156', change: '+8 this week', positive: true },
  { id: 'low-stock', label: 'Low Stock', value: '5', change: 'items', positive: false },
]

const recentInvoices = [
  { id: 'INV-001', customer: 'Sharma Electronics', amount: '₹15,200', date: 'Today', status: 'Paid' },
  { id: 'INV-002', customer: 'Gupta Hardware', amount: '₹8,450', date: 'Today', status: 'Pending' },
  { id: 'INV-003', customer: 'Patel Mobile', amount: '₹32,000', date: 'Yesterday', status: 'Paid' },
]

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    Paid: 'bg-emerald-500/10 text-emerald-400',
    Pending: 'bg-amber-500/10 text-amber-400',
    Overdue: 'bg-rose-500/10 text-rose-400',
  }
  return <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${styles[status] || styles.Pending}`}>{status}</span>
}

export default function MerchantLayout() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [lang, setLang] = useState<'en' | 'hi'>('en')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="min-h-screen bg-[#0f0f12] text-white flex">
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex flex-col w-60 bg-[#16161a] border-r border-white/5 transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-white/5">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold">Z</div>
            <div>
              <span className="font-semibold text-sm">BillZo</span>
              <p className="text-[10px] text-gray-500">Merchant Panel</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.id}
              href={item.href || '/'}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                activeTab === item.id
                  ? 'bg-indigo-500/10 text-indigo-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              <span className="text-sm font-medium">{lang === 'en' ? item.label : item.labelHi}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-white/5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-semibold">RS</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Rajesh Sharma</p>
              <p className="text-[10px] text-gray-500">Starter Plan</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-[#0f0f12]/80 backdrop-blur-xl border-b border-white/5 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-2 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 className="text-base font-semibold text-white">Sharma Electronics</h1>
                <p className="text-xs text-gray-500">Dashboard Overview</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="px-2 py-1 text-xs bg-white/10 rounded text-gray-400">
                {lang === 'en' ? 'हिं' : 'EN'}
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statCards.map((stat) => (
              <motion.div
                key={stat.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#16161a] border border-white/5 rounded-xl p-4"
              >
                <p className="text-xs font-medium text-gray-500 mb-1">{stat.label}</p>
                <p className="text-xl font-semibold text-white">{stat.value}</p>
                <p className={`text-xs mt-1 ${stat.positive ? 'text-emerald-400' : 'text-rose-400'}`}>{stat.change}</p>
              </motion.div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-3 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.id}
                href={action.id === 'new-invoice' ? '/merchant/invoice/new' : '#'}
                className="flex flex-col items-center gap-2 p-4 bg-[#16161a] border border-white/5 rounded-xl hover:border-white/20 transition"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${action.color}-500/10 text-${action.color}-400`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={action.icon} />
                  </svg>
                </div>
                <span className="text-xs font-medium">{action.label}</span>
              </Link>
            ))}
          </div>

          {/* Recent Invoices */}
          <div className="bg-[#16161a] border border-white/5 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Recent Invoices</h2>
              <Link href="/merchant/invoice/new" className="text-xs text-indigo-400">View All</Link>
            </div>
            <div className="divide-y divide-white/5">
              {recentInvoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-4 hover:bg-white/[0.02]">
                  <div>
                    <p className="text-sm font-medium text-white">{invoice.id}</p>
                    <p className="text-xs text-gray-500">{invoice.customer}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">{invoice.amount}</p>
                    <StatusBadge status={invoice.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#16161a] border-t border-white/5 px-2 py-2 flex items-center justify-around">
          {navItems.slice(0, 5).map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg ${
                activeTab === item.id ? 'text-indigo-400' : 'text-gray-500'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              <span className="text-[10px]">{item.label.slice(0, 4)}</span>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  )
}