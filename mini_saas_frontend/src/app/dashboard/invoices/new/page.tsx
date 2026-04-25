'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  Plus, 
  Search, 
  Trash2, 
  ChevronDown, 
  Languages, 
  Send, 
  CheckCircle2, 
  AlertCircle,
  X,
  CreditCard,
  Wallet,
  Coins,
  History,
  Barcode,
  Sparkles
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function NewInvoicePage() {
  const [items, setItems] = useState<any[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [lang, setLang] = useState<'en' | 'hi'>('en')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'SYNCED' | 'RETRY' | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const totals = items.reduce((acc, item) => ({
    subtotal: acc.subtotal + (item.rate * item.qty),
    tax: acc.tax + (item.rate * item.qty * 0.18),
    total: acc.total + (item.rate * item.qty * 1.18)
  }), { subtotal: 0, tax: 0, total: 0 })

  const handleSubmit = async () => {
    if (items.length === 0) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/merchant/invoices/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerPhone,
          paymentMode,
          items: items.map(i => ({
            itemCode: i.name || 'ITEM-GENERIC',
            itemName: i.name,
            quantity: i.qty,
            rate: i.rate
          }))
        })
      })

      const data = await res.json()
      if (data.success) {
        setSyncStatus(data.syncStatus)
        setIsSuccess(true)
      } else {
        alert('Error: ' + data.error)
      }
    } catch (err) {
      alert('Network error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const addItem = () => {
    setItems([...items, { id: Math.random(), name: '', qty: 1, rate: 0 }])
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-40 lg:pb-0">
      {/* Success Animation Overlay */}
      <AnimatePresence>
        {isSuccess && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-xl ${
              syncStatus === 'SYNCED' ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-amber-500 shadow-amber-500/20'
            }`}>
              {syncStatus === 'SYNCED' ? <CheckCircle2 className="w-12 h-12 text-white" /> : <History className="w-12 h-12 text-white" />}
            </motion.div>
            
            <h2 className="text-3xl font-black text-gray-900 mb-2">
              {syncStatus === 'SYNCED' ? 'Invoice Sent!' : 'Saved Locally!'}
            </h2>
            
            <p className="text-gray-500 font-medium mb-8 max-w-sm">
              {syncStatus === 'SYNCED' 
                ? `Successfully delivered via WhatsApp to ${customerName || 'Customer'}.` 
                : `ERP sync is currently delayed. Your invoice is saved locally and will sync automatically when the connection is restored.`}
            </p>

            <button onClick={() => { setIsSuccess(false); setItems([]); }} className="px-10 py-4 bg-primary text-white rounded-2xl font-black shadow-lg">
              Create New Invoice
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-4 py-4 lg:py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
           <div className="flex items-center gap-4">
             <h1 className="text-xl lg:text-2xl font-black text-gray-900 tracking-tight">New Sales Invoice</h1>
             <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-500">
               <Languages className="w-3 h-3" />
               {lang === 'en' ? 'हिन्दी' : 'English'}
             </button>
           </div>
           <div className="flex items-center gap-3">
             <button className="hidden lg:flex items-center gap-2 text-gray-500 font-bold text-sm hover:text-gray-900 transition-colors">
               Save Draft
             </button>
             <button className="p-2 text-gray-400 hover:text-gray-900">
               <X className="w-6 h-6" />
             </button>
           </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Form */}
        <div className="lg:col-span-8 space-y-6">
          {/* Customer Selection */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 block">Customer Details</label>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative group">
                <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-300 group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  placeholder="Enter name or phone..." 
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:outline-none ring-2 ring-primary/5 focus:bg-white transition-all"
                  value={customerName}
                  onChange={(e) => {
                    const val = e.target.value
                    setCustomerName(val)
                    if (/^\d{10}$/.test(val)) setCustomerPhone(val)
                  }}
                />
              </div>
              <div className="flex-1 relative">
                 <input 
                  type="tel" 
                  placeholder="Phone number..." 
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:outline-none ring-2 ring-primary/5 focus:bg-white transition-all"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Line Items</h3>
              <button className="flex items-center gap-1.5 text-primary font-bold text-xs">
                <Barcode className="w-4 h-4" />
                Scan Barcode
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50">
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Item / Product</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-24">Qty</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-32">Rate (₹)</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-32 text-right">Amount</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item, i) => (
                    <tr key={item.id} className="group">
                      <td className="px-6 py-4">
                        <input 
                          type="text" 
                          placeholder="Enter item name..." 
                          className="w-full bg-transparent font-bold text-gray-900 focus:outline-none"
                          value={item.name}
                          onChange={(e) => {
                            const newItems = [...items]
                            newItems[i].name = e.target.value
                            setItems(newItems)
                          }}
                        />
                      </td>
                      <td className="px-6 py-4">
                         <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-1">
                           <button 
                             onClick={() => {
                               const newItems = [...items]
                               newItems[i].qty = Math.max(1, newItems[i].qty - 1)
                               setItems(newItems)
                             }}
                             className="w-7 h-7 flex items-center justify-center bg-white rounded-lg shadow-sm text-gray-400 hover:text-primary transition-colors"
                           >-</button>
                           <span className="text-xs font-black text-gray-900">{item.qty}</span>
                           <button 
                             onClick={() => {
                               const newItems = [...items]
                               newItems[i].qty += 1
                               setItems(newItems)
                             }}
                             className="w-7 h-7 flex items-center justify-center bg-white rounded-lg shadow-sm text-gray-400 hover:text-primary transition-colors"
                           >+</button>
                         </div>
                      </td>
                      <td className="px-6 py-4">
                         <input 
                          type="number" 
                          className="w-24 bg-transparent font-bold text-gray-900 focus:outline-none"
                          value={item.rate}
                          onChange={(e) => {
                            const newItems = [...items]
                            newItems[i].rate = parseFloat(e.target.value) || 0
                            setItems(newItems)
                          }}
                        />
                      </td>
                      <td className="px-6 py-4 text-right font-black text-gray-900">₹{(item.qty * item.rate).toFixed(2)}</td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                          className="p-2 text-gray-300 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-gray-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
               <button onClick={addItem} className="flex items-center gap-2 bg-white border border-gray-200 px-6 py-3 rounded-2xl font-black text-sm text-gray-600 hover:shadow-md transition-all">
                 <Plus className="w-4 h-4" />
                 Add Line Item
               </button>
               <div className="flex items-center gap-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    AI Auto-Suggest
                  </div>
                  <span>Ctrl+A to Quick Add</span>
               </div>
            </div>
          </div>
        </div>

        {/* Right Column: Totals & Payment */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-6 sticky top-32">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-gray-400">Subtotal</span>
                <span className="font-black text-gray-900">₹{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-gray-400">Tax (GST 18%)</span>
                <span className="font-black text-gray-900">₹{totals.tax.toFixed(2)}</span>
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                <span className="text-lg font-black text-gray-900">Grand Total</span>
                <span className="text-3xl font-black text-primary tracking-tighter">₹{totals.total.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Payment Mode</label>
              <div className="grid grid-cols-2 gap-3">
                 {[
                   { id: 'cash', label: 'Cash', icon: Coins },
                   { id: 'upi', label: 'UPI', icon: Wallet },
                   { id: 'card', label: 'Card', icon: CreditCard },
                   { id: 'credit', label: 'Credit', icon: History },
                 ].map((mode) => (
                   <button 
                    key={mode.id}
                    onClick={() => setPaymentMode(mode.id)}
                    className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                      paymentMode === mode.id 
                        ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105' 
                        : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                    }`}
                   >
                     <mode.icon className="w-5 h-5" />
                     <span className="text-xs font-bold">{mode.label}</span>
                   </button>
                 ))}
              </div>
            </div>

            <button 
              onClick={handleSubmit}
              disabled={isSubmitting || items.length === 0}
              className="w-full flex items-center justify-center gap-3 bg-primary text-white py-5 rounded-3xl font-black text-lg shadow-xl shadow-primary/30 hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-50 disabled:grayscale disabled:scale-100"
            >
              {isSubmitting ? (
                <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="w-6 h-6" />
                  Send & Print
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* Mobile Action Bar */}
      <div className="lg:hidden fixed bottom-24 left-4 right-4 z-50 bg-white border border-gray-100 rounded-3xl p-4 shadow-2xl flex items-center justify-between gap-4">
         <div className="flex flex-col">
           <span className="text-[10px] font-black text-gray-400 uppercase">Total Amount</span>
           <span className="text-xl font-black text-gray-900">₹{totals.total.toFixed(2)}</span>
         </div>
         <button 
          onClick={handleSubmit}
          disabled={isSubmitting || items.length === 0}
          className="flex-1 bg-primary text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
         >
           {isSubmitting ? (
             <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
           ) : (
             <>
               <Send className="w-4 h-4" />
               Send Invoice
             </>
           )}
         </button>
      </div>
    </div>
  )
}
