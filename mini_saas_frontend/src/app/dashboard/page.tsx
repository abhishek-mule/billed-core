'use client'

import { useState } from 'react'

const mockData = {
  stats: [
    { label: 'Total Revenue', value: '₹2,45,680', change: '+12.5%', positive: true },
    { label: 'Invoices', value: '156', change: '+8 this week', positive: true },
    { label: 'Customers', value: '89', change: '+5 this month', positive: true },
    { label: 'Low Stock Items', value: '12', change: '-3 from last week', positive: false },
  ],
  recentInvoices: [
    { id: 'INV-001', customer: 'Sharma Electronics', amount: '₹15,200', date: 'Today', status: 'Paid' },
    { id: 'INV-002', customer: 'Gupta Hardware', amount: '₹8,450', date: 'Today', status: 'Pending' },
    { id: 'INV-003', customer: 'Patel Mobile Store', amount: '₹32,000', date: 'Yesterday', status: 'Paid' },
    { id: 'INV-004', customer: 'Singh Electricals', amount: '₹5,780', date: 'Yesterday', status: 'Overdue' },
    { id: 'INV-005', customer: 'Jain Sanitation', amount: '₹18,900', date: '2 days ago', status: 'Paid' },
  ],
  topItems: [
    { name: 'Bajaj 48" Fan', sold: 45, revenue: '₹1,12,500' },
    { name: 'Philips LED Bulb 9W', sold: 120, revenue: '₹36,000' },
    { name: 'Havells Wire 2.5mm', sold: 30, revenue: '₹45,000' },
    { name: 'Polycab Switch Board', sold: 25, revenue: '₹18,750' },
  ],
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 z-40 h-screen w-64 bg-card border-r border-border flex flex-col transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-5 border-b border-border">
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
            Billed
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Sharma Electronics</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <a href="#" className="sidebar-link sidebar-link-active">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Dashboard
          </a>
          <a href="#" className="sidebar-link">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Invoices
          </a>
          <a href="#" className="sidebar-link">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            Inventory
          </a>
          <a href="#" className="sidebar-link">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Customers
          </a>
          <a href="#" className="sidebar-link">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Reports
          </a>
        </nav>

        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-sm font-medium">
              RS
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Rajesh Sharma</p>
              <p className="text-xs text-muted-foreground">Starter Plan</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-64">
        {/* Navbar */}
        <header className="navbar px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="btn-ghost p-2 lg:hidden">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-semibold">Dashboard</h2>
              <p className="text-xs text-muted-foreground">Welcome back, Rajesh</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-ghost p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            <button className="btn-primary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Invoice
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6 space-y-6">
          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {mockData.stats.map((stat, i) => (
              <div key={i} className="stat-card">
                <p className="stat-label">{stat.label}</p>
                <p className="stat-value mt-2">{stat.value}</p>
                <p className={stat.positive ? 'stat-change-positive mt-1' : 'stat-change-negative mt-1'}>
                  {stat.change}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Recent Invoices */}
            <div className="lg:col-span-2 card">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold">Recent Invoices</h3>
                <button className="text-sm text-primary hover:underline">View All</button>
              </div>
              <div className="table-container border-0 rounded-none">
                <table className="table">
                  <thead className="table-header">
                    <tr>
                      <th className="table-head">Invoice</th>
                      <th className="table-head">Customer</th>
                      <th className="table-head">Amount</th>
                      <th className="table-head">Date</th>
                      <th className="table-head">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockData.recentInvoices.map((invoice) => (
                      <tr key={invoice.id} className="table-row">
                        <td className="table-cell font-medium">{invoice.id}</td>
                        <td className="table-cell text-muted-foreground">{invoice.customer}</td>
                        <td className="table-cell font-medium">{invoice.amount}</td>
                        <td className="table-cell text-muted-foreground">{invoice.date}</td>
                        <td className="table-cell">
                          <span className={`badge ${
                            invoice.status === 'Paid' ? 'badge-success' :
                            invoice.status === 'Pending' ? 'badge-warning' : 'badge-danger'
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

            {/* Top Selling Items */}
            <div className="card">
              <div className="p-5 border-b border-border">
                <h3 className="font-semibold">Top Selling Items</h3>
              </div>
              <div className="p-5 space-y-4">
                {mockData.topItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-sm font-medium">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.sold} sold</p>
                    </div>
                    <p className="text-sm font-medium">{item.revenue}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid gap-4 md:grid-cols-3">
            <button className="card card-hover p-5 text-left">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="font-medium mb-1">Create Invoice</h4>
              <p className="text-sm text-muted-foreground">Generate GST invoice for your customer</p>
            </button>

            <button className="card card-hover p-5 text-left">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h4 className="font-medium mb-1">Update Stock</h4>
              <p className="text-sm text-muted-foreground">Add new inventory items</p>
            </button>

            <button className="card card-hover p-5 text-left">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="font-medium mb-1">View Reports</h4>
              <p className="text-sm text-muted-foreground">Sales analytics and insights</p>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
