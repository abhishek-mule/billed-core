'use client'

import { useState } from 'react'

export default function CustomersPage() {
  const [search, setSearch] = useState('')

  const mockCustomers = [
    { name: 'CUST-001', customer_name: 'Rajesh Kumar', phone: '9876543210', total_sales: 45000 },
    { name: 'CUST-002', customer_name: 'Amit Sharma', phone: '9876543211', total_sales: 28000 },
    { name: 'CUST-003', customer_name: 'Suresh Gupta', phone: '9876543212', total_sales: 72000 },
    { name: 'CUST-004', customer_name: 'Pankaj Electronics', phone: '9876543213', total_sales: 15000 },
    { name: 'CUST-005', customer_name: 'Vijay Hardware', phone: '9876543214', total_sales: 8900 },
  ]

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-black italic tracking-tighter">Customers</h1>
      
      <input
        type="text"
        placeholder="Search customers..."
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="space-y-2">
        {mockCustomers.filter(c => 
          c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
          c.phone.includes(search)
        ).map((customer) => (
          <div 
            key={customer.name}
            className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl"
          >
            <div>
              <p className="font-bold">{customer.customer_name}</p>
              <p className="text-xs text-gray-500">{customer.phone}</p>
            </div>
            <p className="font-bold text-indigo-400">₹{customer.total_sales.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  )
}