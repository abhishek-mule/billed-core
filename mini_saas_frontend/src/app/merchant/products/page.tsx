'use client'

import { useState } from 'react'

export default function ProductsPage() {
  const [search, setSearch] = useState('')

  const mockProducts = [
    { item_code: 'FAN-001', item_name: 'Bajaj 48" Fan', stock: 25, rate: 2500 },
    { item_code: 'LED-001', item_name: 'Philips LED Bulb 9W', stock: 120, rate: 300 },
    { item_code: 'WIRE-001', item_name: 'Havells Wire 2.5mm (90m)', stock: 8, rate: 1500 },
    { item_code: 'SWITCH-001', item_name: 'Polycab Switch Board', stock: 45, rate: 750 },
    { item_code: 'CABLE-001', item_name: 'HDMI Cable 1.5m', stock: 60, rate: 450 },
  ]

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-black italic tracking-tighter">Products</h1>
      
      <input
        type="text"
        placeholder="Search products..."
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="space-y-2">
        {mockProducts.filter(p => 
          p.item_name.toLowerCase().includes(search.toLowerCase()) ||
          p.item_code.toLowerCase().includes(search.toLowerCase())
        ).map((product) => (
          <div 
            key={product.item_code}
            className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl"
          >
            <div>
              <p className="font-bold">{product.item_name}</p>
              <p className="text-xs text-gray-500">{product.item_code}</p>
            </div>
            <div className="text-right">
              <p className="font-bold">₹{product.rate}</p>
              <p className={`text-xs ${product.stock < 10 ? 'text-rose-400' : 'text-gray-500'}`}>
                {product.stock} in stock
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}