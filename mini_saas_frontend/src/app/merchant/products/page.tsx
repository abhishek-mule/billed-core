'use client'

import { useState } from 'react'
import { 
  Package, 
  Search, 
  Plus, 
  Filter, 
  ArrowUpRight, 
  AlertCircle, 
  MoreHorizontal,
  History,
  TrendingUp,
  BoxSelect,
  X,
  Loader2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useProducts } from '@/hooks/useApi'
import { formatINR } from '@/lib/api-client'
import { TableSkeleton } from '@/components/ui/Skeleton'

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  const { data, isLoading, refetch } = useProducts(search, 1, 100)
  const products = data?.data || []
  
  const stats = {
    total: products.length,
    lowStock: products.filter(p => p.available < 10).length,
    value: products.reduce((acc, p) => acc + (p.rate * p.stock), 0)
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
        refetch()
      } else {
        alert(data.error || 'Failed to add product')
      }
    } catch (error) {
      console.error('Failed to add product:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 pb-10 animate-in slide-in-from-right-2 max-w-7xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Inventory Management</h1>
          <p className="text-muted-foreground text-sm">Monitor stock levels and warehouse performance.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-card border border-border px-4 py-2.5 rounded-xl font-medium text-sm text-foreground hover:bg-muted transition-all shadow-sm">
            <History className="w-4 h-4" />
            Stock History
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-medium text-sm shadow-glow hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>
      </div>

      {/* Mini Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-card rounded-2xl p-6 border border-border shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <BoxSelect className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Total SKUs</span>
              <span className="text-2xl font-bold text-foreground">{stats.total.toLocaleString()}</span>
            </div>
         </div>
         <div className="bg-destructive/5 border border-destructive/10 rounded-2xl p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-destructive uppercase tracking-widest block mb-1">Low Stock Alerts</span>
              <span className="text-2xl font-bold text-destructive">{stats.lowStock} <span className="text-sm font-semibold">Items</span></span>
            </div>
         </div>
         <div className="bg-card rounded-2xl p-6 border border-border shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-success-soft text-success flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Stock Value</span>
              <span className="text-2xl font-bold text-foreground">{formatINR(stats.value)}</span>
            </div>
         </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative group">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search by product name, code or category..." 
            className="w-full bg-card border border-border rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="flex items-center justify-center gap-2 bg-card border border-border px-6 py-3.5 rounded-2xl font-medium text-sm text-foreground hover:bg-muted transition-all shadow-sm">
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Inventory Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Product Details</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Category</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Current Stock</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Sales Rate</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                 <TableSkeleton rows={5} cols={6} />
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground text-sm">
                    {search ? 'No products match your search.' : 'No products found.'}
                  </td>
                </tr>
              ) : products.map((product: any) => (
                <tr key={product.id} className="hover:bg-muted/40 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground leading-tight mb-0.5">{product.itemName}</p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">{product.itemCode}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-[10px] font-semibold uppercase tracking-widest">{product.category || 'General'}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${
                      product.available < 10 ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-success-soft text-success border-success/20'
                    }`}>
                      {product.available < 10 ? <AlertCircle className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {product.available < 10 ? 'LOW STOCK' : 'HEALTHY'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-foreground">
                    <span className={product.available < 10 ? 'text-destructive' : 'text-foreground'}>{product.available}</span>
                    <span className="text-muted-foreground text-[10px] ml-1 uppercase">/ {product.stock}</span>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-foreground">
                    {formatINR(product.rate)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setShowAddModal(false)}
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full md:max-w-lg bg-card rounded-t-3xl md:rounded-2xl p-6 shadow-elegant max-h-[90vh] overflow-y-auto border border-border"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">Add New Product</h2>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-muted rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <form onSubmit={handleAddProduct} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Item Code *</label>
                    <input name="itemCode" required placeholder="e.g., FAN-001" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Category</label>
                    <input name="category" placeholder="e.g., Electronics" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Item Name *</label>
                  <input name="itemName" required placeholder="Product name" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Sales Rate (₹)</label>
                    <input name="rate" type="number" step="0.01" placeholder="0.00" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">MRP (₹)</label>
                    <input name="mrp" type="number" step="0.01" placeholder="0.00" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">GST Rate (%)</label>
                    <input name="gstRate" type="number" defaultValue={18} className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Initial Stock</label>
                    <input name="stock" type="number" defaultValue={0} className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Unit</label>
                    <input name="unit" defaultValue="pcs" placeholder="pcs" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">HSN Code</label>
                  <input name="hsnCode" placeholder="e.g., 8415" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>

                <button 
                  type="submit" 
                  disabled={submitting}
                  className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-semibold text-sm shadow-glow hover:opacity-90 transition-opacity disabled:opacity-50 mt-4"
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