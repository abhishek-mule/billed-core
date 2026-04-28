'use client'

import { useState, useEffect } from 'react'
import { 
  Search, 
  Plus, 
  Download, 
  MoreHorizontal, 
  Package, 
  AlertTriangle, 
  ArrowUpRight, 
  ChevronLeft, 
  ChevronRight,
  Barcode,
  History,
  Tag,
  Layers,
  Edit2,
  Trash2,
  RefreshCw
} from 'lucide-react'
import { toast } from 'sonner'

// --- Types ---
interface Product {
  id: string
  itemName: string
  category: string
  hsnCode: string
  stock: number
  rate: number
  gstRate: number
  status?: 'In Stock' | 'Low Stock' | 'Out of Stock'
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 })

  const categories = ['All', 'Electronics', 'Mobile', 'Appliances', 'Electrical']

  const fetchProducts = async (page = 1, query = '') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/merchant/products?page=${page}&limit=10&search=${query}`)
      const json = await res.json()
      if (json.success) {
        setProducts(json.data)
        setPagination(json.pagination)
      } else {
        toast.error('Failed to load inventory')
      }
    } catch (err) {
      toast.error('Connection error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts(pagination.page, search)
  }, [pagination.page, search])

  const getStatus = (p: Product) => {
    if (p.stock <= 0) return 'Out of Stock'
    if (p.stock < 5) return 'Low Stock'
    return 'In Stock'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'In Stock': return 'bg-emerald-50 text-emerald-600 border-emerald-100'
      case 'Low Stock': return 'bg-amber-50 text-amber-600 border-amber-100'
      case 'Out of Stock': return 'bg-rose-50 text-rose-600 border-rose-100'
      default: return 'bg-slate-50 text-slate-600 border-slate-100'
    }
  }

  const formatCurrency = (val: number) => `₹${(val || 0).toLocaleString('en-IN')}`

  return (
    <div className="space-y-8 pb-10 animate-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Inventory Master</h1>
          <p className="text-slate-500 text-sm font-medium italic">Manage your stock, HSN codes, and pricing.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => fetchProducts()} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-indigo-200 hover:scale-[1.02] transition-all active:scale-95">
            <Plus className="w-4 h-4" />
            Add New Product
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
               <Layers className="w-7 h-7" />
            </div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total SKUs</p>
               <h3 className="text-2xl font-black text-slate-900 tracking-tight">{pagination.totalPages * 10}+</h3>
            </div>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
               <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Low Stock Alerts</p>
               <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  {products.filter(p => getStatus(p) === 'Low Stock').length}
               </h3>
            </div>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
               <Tag className="w-7 h-7" />
            </div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Stock Valuation</p>
               <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  {formatCurrency(products.reduce((acc, p) => acc + (p.rate * p.stock), 0))}
               </h3>
            </div>
         </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col lg:flex-row gap-4 items-center">
        <div className="w-full lg:flex-1 relative group">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Search by Product name, ID or HSN code..." 
            className="w-full bg-white border border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:outline-none ring-4 ring-indigo-500/0 focus:ring-indigo-500/5 transition-all shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm flex items-center w-full lg:w-auto overflow-x-auto no-scrollbar">
           {categories.map((cat) => (
             <button 
               key={cat}
               onClick={() => setActiveCategory(cat)}
               className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${activeCategory === cat ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
             >
               {cat}
             </button>
           ))}
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[400px] relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
             <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        )}

        <div className="overflow-x-auto">
           <table className="w-full text-left border-collapse">
              <thead>
                 <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Info</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">HSN</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Price / Tax</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16"></th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                 {products.map((prd) => {
                    const status = getStatus(prd)
                    return (
                      <tr key={prd.id} className="hover:bg-slate-50/50 transition-all group cursor-pointer">
                         <td className="px-8 py-5">
                            <div className="flex items-center gap-4">
                               <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-all">
                                  <Package className="w-6 h-6" />
                               </div>
                               <div>
                                  <p className="text-sm font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{prd.itemName}</p>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{prd.category || 'N/A'} · {prd.id}</p>
                               </div>
                            </div>
                         </td>
                         <td className="px-8 py-5 text-center">
                            <span className="text-xs font-black text-slate-400 tracking-widest">{prd.hsnCode || '—'}</span>
                         </td>
                         <td className="px-8 py-5 text-center">
                            <p className="text-sm font-black text-slate-900">{prd.stock}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Units</p>
                         </td>
                         <td className="px-8 py-5">
                            <p className="text-sm font-black text-slate-900">{formatCurrency(prd.rate)}</p>
                            <p className="text-[10px] text-emerald-500 font-bold uppercase">GST {prd.gstRate}% Inc.</p>
                         </td>
                         <td className="px-8 py-5">
                            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${getStatusColor(status)}`}>
                               <div className={`w-1.5 h-1.5 rounded-full ${status === 'In Stock' ? 'bg-emerald-500' : status === 'Low Stock' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                               {status}
                            </div>
                         </td>
                         <td className="px-8 py-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                               <button className="p-2 hover:bg-white hover:shadow-sm rounded-xl text-slate-300 hover:text-indigo-600 transition-all">
                                  <Edit2 className="w-4 h-4" />
                               </button>
                               <button className="p-2 hover:bg-white hover:shadow-sm rounded-xl text-slate-300 hover:text-slate-600 transition-all">
                                  <MoreHorizontal className="w-4 h-4" />
                               </button>
                            </div>
                         </td>
                      </tr>
                    )
                 })}
              </tbody>
           </table>
        </div>

        <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-50 flex flex-col md:flex-row items-center justify-between gap-4">
           <div className="flex items-center gap-6 text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
              Showing page {pagination.page} of {pagination.totalPages}
           </div>

           <div className="flex items-center gap-2">
              <button 
                onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                disabled={pagination.page === 1}
                className="p-2.5 border border-slate-200 rounded-xl text-slate-400 hover:bg-white transition-all disabled:opacity-20"
              >
                 <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setPagination(p => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                disabled={pagination.page === pagination.totalPages}
                className="p-2.5 border border-slate-200 rounded-xl text-slate-400 hover:bg-white transition-all disabled:opacity-20"
              >
                 <ChevronRight className="w-4 h-4" />
              </button>
           </div>
        </div>
      </div>
    </div>
  )
}
