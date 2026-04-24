'use client'

import { useState } from 'react'
import Link from 'next/link'

const mockInvoices = [
  { id: 'INV-2024-001', customer: 'Sharma Electronics', amount: 15200, date: '2024-01-15', status: 'Paid', items: 3 },
  { id: 'INV-2024-002', customer: 'Gupta Hardware', amount: 8450, date: '2024-01-15', status: 'Pending', items: 2 },
  { id: 'INV-2024-003', customer: 'Patel Mobile', amount: 32000, date: '2024-01-14', status: 'Paid', items: 5 },
  { id: 'INV-2024-004', customer: 'Singh Electricals', amount: 5780, date: '2024-01-14', status: 'Overdue', items: 1 },
  { id: 'INV-2024-005', customer: 'Jain Sanitation', amount: 18900, date: '2024-01-13', status: 'Paid', items: 4 },
  { id: 'INV-2024-006', customer: 'Agarwal Traders', amount: 12400, date: '2024-01-13', status: 'Pending', items: 2 },
]

export default function InvoiceListPage() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = mockInvoices.filter(inv => {
    const matchesSearch = inv.customer.toLowerCase().includes(search.toLowerCase()) || inv.id.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || inv.status.toLowerCase() === filter
    return matchesSearch && matchesFilter
  })

  const total = filtered.reduce((sum, inv) => sum + inv.amount, 0)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Invoices</h1>
        <Link href="/merchant/invoice/new" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg">
          + New Invoice
        </Link>
      </div>

      <input
        type="text"
        placeholder="Search invoices..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm outline-none focus:border-indigo-500"
      />

      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', 'paid', 'pending', 'overdue'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-white/5 text-gray-400'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((invoice) => (
          <Link
            key={invoice.id}
            href={`/merchant/invoice/${invoice.id}`}
            className="block p-4 bg-white/5 border border-white/10 rounded-xl hover:border-white/20 transition"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-white">{invoice.id}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                invoice.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400' :
                invoice.status === 'Pending' ? 'bg-amber-500/10 text-amber-400' :
                'bg-rose-500/10 text-rose-400'
              }`}>
                {invoice.status}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">{invoice.customer}</span>
              <span className="font-semibold text-white">₹{invoice.amount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
              <span>{invoice.items} items</span>
              <span>{invoice.date}</span>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length > 0 && (
        <div className="p-4 bg-indigo-600/10 border border-indigo-500/30 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Total ({filtered.length} invoices)</span>
            <span className="text-lg font-semibold text-white">₹{total.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}