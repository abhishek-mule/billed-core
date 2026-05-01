'use client'

import { useState } from 'react'
import Link from 'next/link'
import { 
  Plus, 
  FileText, 
  Users, 
  TrendingUp, 
  IndianRupee, 
  Clock,
  CheckCircle2,
  ArrowRight,
  Search,
  Filter
} from 'lucide-react'
import { formatINR } from '@/lib/api-client'

export default function SalesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Mock data - replace with real API calls
  const recentInvoices = [
    { id: 'INV-001', customer: 'Rajesh Kumar', amount: 4500, status: 'paid', date: '2024-01-15' },
    { id: 'INV-002', customer: 'Priya Enterprises', amount: 12300, status: 'pending', date: '2024-01-14' },
    { id: 'INV-003', customer: 'Mehta Textiles', amount: 8750, status: 'partial', date: '2024-01-13' },
  ]

  const salesStats = {
    totalRevenue: 456000,
    pendingAmount: 28500,
    paidInvoices: 142,
    pendingInvoices: 14
  }

  const topCustomers = [
    { name: 'Mehta Textiles', totalSpent: 125000, orders: 45 },
    { name: 'Priya Enterprises', totalSpent: 89000, orders: 32 },
    { name: 'Rajesh Kumar', totalSpent: 67000, orders: 28 }
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800'
      case 'pending': return 'bg-amber-100 text-amber-800'
      case 'partial': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Sales</h1>
          <p className="text-muted-foreground text-sm">Manage invoices, customers, and revenue</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/merchant/invoice"
            className="flex items-center gap-2 bg-card border border-border px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-muted transition-all"
          >
            <FileText className="w-4 h-4" />
            All Invoices
          </Link>
          <Link
            href="/merchant/pos"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Invoice
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
              <IndianRupee className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">+12%</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatINR(salesStats.totalRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Revenue</p>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Due</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatINR(salesStats.pendingAmount)}</p>
          <p className="text-xs text-muted-foreground mt-1">Pending Collections</p>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Paid</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{salesStats.paidInvoices}</p>
          <p className="text-xs text-muted-foreground mt-1">Paid Invoices</p>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">Active</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{salesStats.pendingInvoices}</p>
          <p className="text-xs text-muted-foreground mt-1">Pending Invoices</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/merchant/pos"
          className="bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-xl p-6 hover:opacity-90 transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <Plus className="w-6 h-6" />
            </div>
            <ArrowRight className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold mb-1">Create Invoice</h3>
          <p className="text-sm opacity-80">Generate new sales invoice quickly</p>
        </Link>

        <Link
          href="/merchant/parties"
          className="bg-card border border-border rounded-xl p-6 hover:border-primary/30 transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
              <Users className="w-6 h-6" />
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold mb-1">Manage Customers</h3>
          <p className="text-sm text-muted-foreground">Add and manage customer details</p>
        </Link>

        <Link
          href="/merchant/reports"
          className="bg-card border border-border rounded-xl p-6 hover:border-primary/30 transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
              <TrendingUp className="w-6 h-6" />
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold mb-1">View Reports</h3>
          <p className="text-sm text-muted-foreground">Analyze sales performance</p>
        </Link>
      </div>

      {/* Recent Invoices */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Recent Invoices</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search invoices..."
                className="pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-border">
          {recentInvoices.map((invoice) => (
            <div key={invoice.id} className="p-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary font-semibold">
                    {invoice.customer.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{invoice.customer}</p>
                    <p className="text-sm text-muted-foreground">{invoice.id} • {new Date(invoice.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-bold text-foreground">{formatINR(invoice.amount)}</p>
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                      {invoice.status}
                    </span>
                  </div>
                  <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground">
                    <Filter className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-border">
          <Link
            href="/merchant/invoice"
            className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80"
          >
            View All Invoices
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Top Customers */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Top Customers</h2>
        </div>

        <div className="divide-y divide-border">
          {topCustomers.map((customer, index) => (
            <div key={index} className="p-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary font-semibold">
                    {customer.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{customer.name}</p>
                    <p className="text-sm text-muted-foreground">{customer.orders} orders</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-foreground">{formatINR(customer.totalSpent)}</p>
                  <p className="text-xs text-muted-foreground">total spent</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}