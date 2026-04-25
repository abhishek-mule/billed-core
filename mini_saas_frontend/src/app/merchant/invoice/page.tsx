'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '../sheets/Base'

const mockInvoices = [
  { name: 'Anjali Sharma', id: 'INV-842', time: 'Today, 09:15 AM', amount: 4200, status: 'FAILED' },
  { name: 'Rahul Verma', id: 'INV-841', time: 'Today, 10:30 AM', amount: 1850, status: 'UNPAID' },
  { name: 'Sneha Patil', id: 'INV-840', time: 'Today, 11:45 AM', amount: 950, status: 'UNPAID' },
  { name: 'Amit Kumar', id: 'INV-839', time: 'Today, 12:10 PM', amount: 3400, status: 'PAID' },
  { name: 'Vikram Singh', id: 'INV-838', time: 'Today, 01:20 PM', amount: 5600, status: 'PAID' },
  { name: 'Priya Gupta', id: 'INV-837', time: 'Today, 02:05 PM', amount: 1200, status: 'PAID' },
  { name: 'Mohammad Ali', id: 'INV-836', time: 'Today, 03:30 PM', amount: 2100, status: 'UNPAID' },
]

const formatCurrency = (n: number) => '₹' + n.toLocaleString('en-IN')

export default function InvoiceListPage() {
  const [filter, setFilter] = useState('Today')
  const [search, setSearch] = useState('')

  const filters = ['All', 'Today', 'Unpaid']
  const failedSyncCount = 1

  const filtered = mockInvoices.filter(inv => {
    const matchesSearch = inv.name.toLowerCase().includes(search.toLowerCase()) || 
                      inv.id.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'All' || 
                     (filter === 'Today' && inv.time.startsWith('Today')) ||
                     (filter === 'Unpaid' && inv.status === 'UNPAID')
    return matchesSearch && matchesFilter
  })

  const total = filtered.reduce((sum, inv) => sum + inv.amount, 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5">
        <div className="flex justify-between items-center mb-4">
          <span className="text-2xl font-black">BillZo</span>
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg">
            👤
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 bg-gray-100 rounded-xl px-4 py-3 mb-3">
          <span className="text-gray-400">🔍</span>
          <span className="text-gray-400 flex-1 text-base">Search name or amount...</span>
          <span className="text-gray-400">🎙️</span>
          <span className="text-gray-400">📷</span>
        </div>
      </div>

      {/* Today banner */}
      <div className="bg-blue-50 px-5 py-2 flex items-center gap-2">
        <span>📈</span>
        <span className="text-blue-600 font-semibold text-sm">Today: {formatCurrency(28450)}</span>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 flex gap-2">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-2 rounded-full text-sm font-semibold"
            style={{
              background: filter === f ? '#111' : '#F0F2F7',
              color: filter === f ? '#fff' : '#555',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Failed sync banner */}
      {failedSyncCount > 0 && (
        <div className="bg-amber-50 px-5 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span>📡</span>
            <span className="font-semibold text-sm">{failedSyncCount} Failed Sync</span>
          </div>
          <button className="text-blue-600 font-bold text-sm">RETRY ALL</button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5">
        {filtered.map((inv, i) => (
          <Link
            key={i}
            href={`/merchant/invoice/${inv.id}`}
            className="flex justify-between items-center py-4 border-b border-gray-100"
          >
            <div>
              <div className="font-bold text-base">{inv.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {inv.id} &nbsp;•&nbsp; {inv.time}
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              <span className="font-extrabold text-base">{formatCurrency(inv.amount)}</span>
              <Badge status={inv.status} />
            </div>
          </Link>
        ))}
      </div>

      {/* FAB */}
      <Link
        href="/merchant/invoice/new"
        className="fixed bottom-20 right-5 w-14 h-14 rounded-full bg-blue-600 text-white text-3xl flex items-center justify-center shadow-lg"
        style={{ boxShadow: '0 4px 20px rgba(27,107,245,.4)' }}
      >
        +
      </Link>
    </div>
  )
}