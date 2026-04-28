'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, Phone, Mail, MapPin, Loader2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Customer {
  id: string
  name: string
  phone?: string
  email?: string
  gstin?: string
  billingAddress?: string
  shippingAddress?: string
  totalSales: number
}

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.length >= 2) {
        fetchCustomers(search)
      } else if (search.length === 0) {
        fetchCustomers('')
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    fetchCustomers('')
  }, [])

  const fetchCustomers = async (query: string) => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      params.set('limit', '50')
      
      const res = await fetch(`/api/merchant/customers?${params}`)
      const data = await res.json()
      
      if (data.success) {
        setCustomers(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitting(true)
    
    const formData = new FormData(e.currentTarget)
    const payload = {
      customerName: formData.get('customerName'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      gstin: formData.get('gstin'),
      billingAddress: formData.get('billingAddress'),
      shippingAddress: formData.get('shippingAddress')
    }

    try {
      const res = await fetch('/api/merchant/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      
      if (data.success) {
        setShowAddModal(false)
        fetchCustomers(search)
      } else {
        alert(data.error)
      }
    } catch (error) {
      console.error('Failed to add customer:', error)
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
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Customers</h1>
          <p className="text-gray-500 text-sm font-medium italic">Manage your customer database.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-300" />
        <input
          type="text"
          placeholder="Search by name, phone, or GSTIN..."
          className="w-full bg-white border border-gray-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:outline-none ring-2 ring-primary/5"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Customer List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 font-medium">No customers found</p>
            <button 
              onClick={() => setShowAddModal(true)}
              className="mt-2 text-primary font-bold text-sm"
            >
              Add your first customer
            </button>
          </div>
        ) : (
          customers.map((customer) => (
            <div 
              key={customer.id}
              className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                  <span className="text-lg font-black text-indigo-600">
                    {customer.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-black text-gray-900">{customer.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {customer.phone && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Phone className="w-3 h-3" />
                        {customer.phone}
                      </span>
                    )}
                    {customer.gstin && (
                      <span className="text-xs text-gray-400 font-mono">{customer.gstin}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="font-black text-gray-900">{formatCurrency(customer.totalSales)}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">Total Sales</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Customer Modal */}
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
                <h2 className="text-xl font-black text-gray-900">Add New Customer</h2>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleAddCustomer} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Customer Name *</label>
                  <input name="customerName" required placeholder="Business or Individual name" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Phone *</label>
                    <input name="phone" required placeholder="10-digit mobile" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Email</label>
                    <input name="email" type="email" placeholder="email@example.com" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">GSTIN</label>
                  <input name="gstin" placeholder="27ABCDE1234F1Z5" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5 uppercase" />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Billing Address</label>
                  <textarea name="billingAddress" rows={3} placeholder="Full billing address" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5 resize-none" />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Shipping Address</label>
                  <textarea name="shippingAddress" rows={3} placeholder="Full shipping address" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none ring-2 ring-primary/5 resize-none" />
                </div>

                <button 
                  type="submit" 
                  disabled={submitting}
                  className="w-full bg-primary text-white py-4 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Add Customer'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}