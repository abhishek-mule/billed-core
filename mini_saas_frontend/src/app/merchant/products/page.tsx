'use client'

import { useState } from 'react'
import { 
  Package, 
  Search, 
  Plus, 
  Filter, 
  ArrowUpRight, 
  AlertCircle, 
  ChevronRight,
  MoreHorizontal,
  History,
  TrendingUp,
  BoxSelect
} from 'lucide-react'
import { motion } from 'framer-motion'

export default function ProductsPage() {
  const [search, setSearch] = useState('')

  const mockProducts = [
    { item_code: 'FAN-001', item_name: 'Bajaj 48" Fan', stock: 25, rate: 2500, category: 'Electronics', trend: 'up' },
    { item_code: 'LED-001', item_name: 'Philips LED Bulb 9W', stock: 120, rate: 300, category: 'Lighting', trend: 'up' },
    { item_code: 'WIRE-001', item_name: 'Havells Wire 2.5mm (90m)', stock: 3, rate: 1500, category: 'Electrical', trend: 'down' },
    { item_code: 'SWITCH-001', item_name: 'Polycab Switch Board', stock: 45, rate: 750, category: 'Electrical', trend: 'up' },
    { item_code: 'CABLE-001', item_name: 'HDMI Cable 1.5m', stock: 60, rate: 450, category: 'Electronics', trend: 'up' },
  ]

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  return (
    <div className="space-y-8 pb-10 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Inventory Management</h1>
          <p className="text-gray-500 text-sm font-medium italic">Monitor stock levels and warehouse performance.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2.5 rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-50 transition-all">
            <History className="w-4 h-4" />
            Stock History
          </button>
          <button className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform active:scale-95">
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>
      </div>

      {/* Mini Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
              <BoxSelect className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Total SKUs</span>
              <span className="text-xl font-black text-gray-900">2,148</span>
            </div>
         </div>
         <div className="bg-rose-50 border border-rose-100 rounded-3xl p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/20">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest block">Low Stock Alerts</span>
              <span className="text-xl font-black text-rose-700">14 Items</span>
            </div>
         </div>
         <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Stock Value</span>
              <span className="text-xl font-black text-gray-900">₹8,45,200</span>
            </div>
         </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative group">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-300 group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search by product name, code or category..." 
            className="w-full bg-white border border-gray-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:outline-none ring-2 ring-primary/5 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="flex items-center justify-center gap-2 bg-white border border-gray-200 px-6 py-3.5 rounded-2xl font-bold text-sm text-gray-600 hover:bg-gray-50 transition-all">
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Product Details</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Current Stock</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Sales Rate</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mockProducts.filter(p => 
                p.item_name.toLowerCase().includes(search.toLowerCase()) ||
                p.item_code.toLowerCase().includes(search.toLowerCase())
              ).map((product) => (
                <tr key={product.item_code} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 border border-gray-100">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-gray-900 leading-tight mb-0.5">{product.item_name}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{product.item_code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="px-3 py-1 rounded-lg bg-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-widest">{product.category}</span>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${
                      product.stock < 10 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    }`}>
                      {product.stock < 10 ? <AlertCircle className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {product.stock < 10 ? 'LOW STOCK' : 'HEALTHY'}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right font-black text-gray-900">
                    <span className={product.stock < 10 ? 'text-rose-600' : 'text-gray-900'}>{product.stock}</span>
                    <span className="text-gray-400 text-[10px] ml-1 uppercase">Units</span>
                  </td>
                  <td className="px-6 py-5 text-right font-black text-gray-900">
                    {formatCurrency(product.rate)}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-300 hover:text-gray-600 transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-gray-50 flex items-center justify-between bg-gray-50/30">
          <span className="text-xs font-medium text-gray-400 italic">Total Inventory Valuation: ₹1,42,500</span>
          <button className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
            View Analytics
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}