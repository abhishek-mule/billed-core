'use client'

import { useState, useEffect } from 'react'
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
  BoxSelect,
  X,
  Loader2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Product {
  id: string
  itemCode: string
  itemName: string
  hsnCode?: string
  gstRate: number
  rate: number
  mrp: number
  stock: number
  reserved: number
  available: number
  category: string
  unit: string
}

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [stats, setStats] = useState({ total: 0, lowStock: 0, value: 0 })

  useEffect(() => {
    fetchProducts()
  }, [search])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('limit', '100')
      
      const res = await fetch(`/api/merchant/products?${params}`)
      const data = await res.json()
      
      if (data.success) {
        setProducts(data.data)
        
        const total = data.data.length
        const lowStock = data.data.filter((p: Product) => p.available < 10).length
        const value = data.data.reduce((acc: number, p: Product) => acc + (p.rate * p.stock), 0)
        setStats({ total, lowStock, value })
      }
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitting(true)
    
    const formData = new FormData(e.currentTarget)
    const payload = {
      itemCode: formData.get('itemCode'),
      itemName: formData.get('itemName'),
      hsnCode: formData.get('hsnCode'),
      gstRate: parseFloat(formData.get('gstRate') as string) || 18,
      rate: parseFloat(formData.get('rate') as string) || 0,
      mrp: parseFloat(formData.get('mrp') as string) || 0,
      stock: parseFloat(formData.get('stock') as string) || 0,
      category: formData.get('category'),
      unit: formData.get('unit') || 'pcs'
    }

    try {
      const res = await fetch('/api/merchant/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      
      if (data.success) {
        setShowAddModal(false)
        fetchProducts()
      } else {
        alert(data.error)
      }
    } catch (error) {
      console.error('Failed to add product:', error)
    } finally {
      setSubmitting(false)
    }
  }

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
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform active:scale-95"
          >
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
              <span className="text-xl font-black text-gray-900">{stats.total.toLocaleString()}</span>
            </div>
         </div>
         <div className="bg-rose-50 border border-rose-100 rounded-3xl p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/20">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest block">Low Stock Alerts</span>
              <span className="text-xl font-black text-rose-700">{stats.lowStock} Items</span>
            </div>
         </div>
         <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Stock Value</span>
              <span className="text-xl font-black text-gray-900">{formatCurrency(stats.value)}</span>
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
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                  </td>
                </tr>
              ) : products.filter(p => 
                p.itemName.toLowerCase().includes(search.toLowerCase()) ||
                p.itemCode.toLowerCase().includes(search.toLowerCase())
              ).map((product) => (
                <tr key={product.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 border border-gray-100">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-gray-900 leading-tight mb-0.5">{product.itemName}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{product.itemCode}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="px-3 py-1 rounded-lg bg-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-widest">{product.category || 'General'}</span>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${
                      product.available < 10 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    }`}>
                      {product.available < 10 ? <AlertCircle className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {product.available < 10 ? 'LOW STOCK' : 'HEALTHY'}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right font-black text-gray-900">
                    <span className={product.available < 10 ? 'text-rose-600' : 'text-gray-900'}>{product.available}</span>
                    <span className="text-gray-400 text-[10px] ml-1 uppercase">/ {product.stock}</span>
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
          <span className="text-xs font-medium text-gray-400 italic">Total Inventory Valuation: {formatCurrency(stats.value)}</span>
          <button className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
            View Analytics
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Add Product Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowAddModal(false)}
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-gray-900">Add New Product</h2>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleAddProduct} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Item Code *</label>
                    <input name="itemCode" required placeholder="e.g., FAN-001" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Category</label>
                    <input name="category" placeholder="e.g., Electronics" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Item Name *</label>
                  <input name="itemName" required placeholder="Product name" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Sales Rate (₹)</label>
                    <input name="rate" type="number" step="0.01" placeholder="0.00" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">MRP (₹)</label>
                    <input name="mrp" type="number" step="0.01" placeholder="0.00" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">GST Rate (%)</label>
                    <input name="gstRate" type="number" defaultValue={18} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Initial Stock</label>
                    <input name="stock" type="number" defaultValue={0} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Unit</label>
                    <input name="unit" defaultValue="pcs" placeholder="pcs" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">HSN Code</label>
                  <input name="hsnCode" placeholder="e.g., 8415" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                </div>

                <button 
                  type="submit" 
                  disabled={submitting}
                  className="w-full bg-primary text-white py-4 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Add Product'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}