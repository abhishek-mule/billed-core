'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Camera, Search, Plus, ArrowRight, Loader2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'

interface Purchase {
  id: string
  purchaseInvoiceNumber: string
  supplierName: string
  supplierGstin?: string
  grandTotal: number
  invoiceDate?: string
  dueDate?: string
  status: string
  createdAt: string
}

export default function PurchasesPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchPurchases()
  }, [searchQuery])

  const fetchPurchases = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      params.set('limit', '50')
      
      const res = await fetch(`/api/merchant/purchases?${params}`)
      const data = await res.json()
      
      if (data.success) {
        setPurchases(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch purchases:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddPurchase = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitting(true)
    
    const formData = new FormData(e.currentTarget)
    const lineItems = [] // Can be expanded for multi-item entry
    
    const payload = {
      purchaseInvoiceNumber: formData.get('purchaseInvoiceNumber'),
      supplierName: formData.get('supplierName'),
      supplierGstin: formData.get('supplierGstin'),
      invoiceDate: formData.get('invoiceDate'),
      dueDate: formData.get('dueDate'),
      lineItems,
      subtotal: parseFloat(formData.get('subtotal') as string) || 0,
      grandTotal: parseFloat(formData.get('grandTotal') as string) || 0,
      notes: formData.get('notes')
    }

    try {
      const res = await fetch('/api/merchant/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      
      if (data.success) {
        setShowAddModal(false)
        fetchPurchases()
      } else {
        alert(data.error)
      }
    } catch (error) {
      console.error('Failed to add purchase:', error)
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'bg-emerald-50 text-emerald-600 border-emerald-100'
      case 'PENDING':
        return 'bg-amber-50 text-amber-600 border-amber-100'
      case 'OVERDUE':
        return 'bg-rose-50 text-rose-600 border-rose-100'
      default:
        return 'bg-gray-50 text-gray-600 border-gray-100'
    }
  }

  return (
    <div className="space-y-8 pb-10 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Purchases</h1>
          <p className="text-gray-500 text-sm font-medium italic">Track purchase invoices and inventory.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/merchant/purchases/scan"
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2.5 rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-50 transition-all"
          >
            <Camera className="w-4 h-4" />
            Scan Purchase
          </Link>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add Purchase
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-300" />
        <input
          type="text"
          placeholder="Search by invoice number or supplier..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-gray-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:outline-none ring-2 ring-primary/5"
        />
      </div>

      {/* Purchase List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : purchases.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-3xl">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-black text-gray-900 mb-2">No purchases yet</h3>
          <p className="text-gray-500 mb-6">Start tracking your purchase invoices</p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/merchant/purchases/scan"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold text-sm"
            >
              <Camera className="w-4 h-4" />
              Scan
            </Link>
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold text-sm"
            >
              <Plus className="w-4 h-4" />
              Manual Entry
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {purchases.map((purchase) => (
            <div
              key={purchase.id}
              className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:shadow-md transition-shadow"
            >
              <div>
                <p className="font-black text-gray-900">{purchase.purchaseInvoiceNumber}</p>
                <p className="text-sm text-gray-500">{purchase.supplierName}</p>
              </div>
              <div className="text-right">
                <p className="font-black text-gray-900">{formatCurrency(purchase.grandTotal)}</p>
                <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${getStatusColor(purchase.status)}`}>
                  {purchase.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Purchase Modal */}
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
                <h2 className="text-xl font-black text-gray-900">Add Purchase Invoice</h2>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleAddPurchase} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Invoice No. *</label>
                    <input name="purchaseInvoiceNumber" required placeholder="PO-001" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Invoice Date</label>
                    <input name="invoiceDate" type="date" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Supplier Name *</label>
                  <input name="supplierName" required placeholder="Supplier business name" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Supplier GSTIN</label>
                  <input name="supplierGstin" placeholder="27ABCDE1234F1Z5" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5 uppercase" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Total Amount (₹)</label>
                    <input name="grandTotal" type="number" step="0.01" placeholder="0.00" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Due Date</label>
                    <input name="dueDate" type="date" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Notes</label>
                  <textarea name="notes" rows={2} placeholder="Any additional notes..." className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5 resize-none" />
                </div>

                <button 
                  type="submit" 
                  disabled={submitting}
                  className="w-full bg-primary text-white py-4 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Add Purchase'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}