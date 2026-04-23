'use client'

import { useState } from 'react'
import Link from 'next/link'

const mockData = {
  stats: [
    { label: 'Today Revenue', value: '₹24,580', change: '+12.5%', positive: true },
    { label: 'Invoices Today', value: '12', change: '+3', positive: true },
    { label: 'Active Merchants', value: '89', change: '+5', positive: true },
    { label: 'WhatsApp Sent', value: '156', change: '+18', positive: true },
  ],
  recentInvoices: [
    { id: 'INV-001', customer: 'Sharma Electronics', amount: '₹15,200', date: 'Today', status: 'Paid' },
    { id: 'INV-002', customer: 'Gupta Hardware', amount: '₹8,450', date: 'Today', status: 'Pending' },
    { id: 'INV-003', customer: 'Patel Mobile Store', amount: '₹32,000', date: 'Yesterday', status: 'Paid' },
    { id: 'INV-004', customer: 'Singh Electricals', amount: '₹5,780', date: 'Yesterday', status: 'Overdue' },
  ],
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const navItems = [
    { icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', label: 'Overview', href: '/dashboard' },
    { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', label: 'Invoices', href: '/dashboard/invoices/new' },
    { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', label: 'Merchants', href: '#' },
    { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', label: 'Analytics', href: '#' },
  ]

  return (
    <div className="min-h-screen bg-[#0f0f12] text-white">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 z-40 h-screen w-60 bg-[#16161a] border-r border-white/5 flex flex-col transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-5 border-b border-white/5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">Z</span>
            </div>
            <div>
              <span className="font-semibold text-sm text-white">BillZo</span>
              <p className="text-[10px] text-gray-500">Admin</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item, i) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                i === 0
                  ? 'bg-indigo-500/10 text-indigo-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-white/5">
          <Link href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <span className="text-sm font-medium">Logout</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-60 min-h-screen">
        <header className="sticky top-0 z-30 bg-[#0f0f12]/80 backdrop-blur-xl border-b border-white/5 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-2 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 className="text-base font-semibold text-white">Dashboard Overview</h1>
                <p className="text-xs text-gray-500">Platform metrics</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Last updated: Just now</span>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {mockData.stats.map((stat, i) => (
              <div key={stat.label} className="bg-[#16161a] border border-white/5 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-500 mb-1">{stat.label}</p>
                <div className="flex items-end justify-between">
                  <p className="text-2xl font-semibold text-white">{stat.value}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    stat.positive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                  }`}>
                    {stat.change}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Recent Activity */}
          <div className="bg-[#16161a] border border-white/5 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-white/5">
              <h2 className="text-sm font-semibold text-white">Recent Invoices</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-white/5">
                    <th className="px-4 py-3 font-medium">Invoice</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {mockData.recentInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-sm font-medium text-white">{invoice.id}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{invoice.customer}</td>
                      <td className="px-4 py-3 text-sm font-medium text-white">{invoice.amount}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                          invoice.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400' :
                          invoice.status === 'Pending' ? 'bg-amber-500/10 text-amber-400' :
                          'bg-rose-500/10 text-rose-400'
                        }`}>
                          {invoice.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}