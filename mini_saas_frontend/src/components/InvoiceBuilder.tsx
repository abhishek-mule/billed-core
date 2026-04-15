'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import MagicScan from '@/components/MagicScan'

interface LineItem {
  id: string
  name: string
  hsn: string
  price: number
  quantity: number
  gstRate: number
}

export default function InvoiceBuilder() {
  const [items, setItems] = useState<LineItem[]>([])
  const [customer, setCustomer] = useState({ name: '', gstin: '', phone: '' })
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)

  const addItemFromScan = (scanResult: any) => {
    const newItem: LineItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: `${scanResult.brand} ${scanResult.tech_attr}`,
      hsn: '8501',
      price: 4500,
      quantity: 1,
      gstRate: 18
    }
    setItems([...items, newItem])
  }

  const handleSend = async () => {
    if (!customer.phone) {
      alert('Enter Customer Phone for WhatsApp delivery')
      return
    }
    setIsSending(true)
    try {
      const res = await fetch('/api/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer, items, totals })
      })
      if (res.ok) setIsSent(true)
    } finally { setIsSending(false) }
  }

  const totals = items.reduce((acc, item) => {
    const amount = item.price * item.quantity
    const gst = (amount * item.gstRate) / 100
    return {
      subtotal: acc.subtotal + amount,
      gst: acc.gst + gst,
      total: acc.total + amount + gst
    }
  }, { subtotal: 0, gst: 0, total: 0 })

  return (
    <div className="space-y-8 bg-black/40 border border-white/5 p-8 rounded-3xl backdrop-blur-md relative overflow-hidden">
      <AnimatePresence>
        {isSent && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center text-center p-8"
          >
            <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-emerald-500/20">
              <svg className="w-12 h-12 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-4xl font-black italic tracking-tighter uppercase mb-2">Invoice Sent</h2>
            <p className="text-gray-400 font-medium mb-8 uppercase tracking-widest text-[10px]">Delivered via WhatsApp to {customer.phone}</p>
            <button 
              onClick={() => { setIsSent(false); setItems([]); setCustomer({ name: '', gstin: '', phone: '' }) }}
              className="px-10 py-4 bg-white/5 border border-white/10 rounded-full font-black text-xs tracking-widest hover:bg-white/10 transition uppercase"
            >
              New Transaction
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black italic tracking-tighter">TAX INVOICE</h2>
          <p className="text-sm text-gray-500 font-bold uppercase tracking-widest mt-1">Billed Core v1.2</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-gray-500">INV-2024-001</p>
          <p className="text-sm font-medium">{new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {/* Merchant / Customer Split */}
      <div className="grid md:grid-cols-2 gap-12 border-t border-white/5 pt-8">
        <div className="space-y-4">
          <label className="text-[10px] font-black uppercase tracking-widest text-indigo-500">From (Merchant)</label>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <p className="font-bold">Sharma Electronics</p>
            <p className="text-sm text-gray-400">29ABCDE1234F1Z5</p>
            <p className="text-sm text-gray-400">+91 98765 43210</p>
          </div>
        </div>
        <div className="space-y-4">
          <label className="text-[10px] font-black uppercase tracking-widest text-purple-500">Bill To (Customer)</label>
          <div className="grid gap-3">
             <input 
              type="text" 
              placeholder="Customer Name" 
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-purple-500 outline-none transition"
              value={customer.name}
              onChange={(e) => setCustomer({...customer, name: e.target.value})}
             />
             <div className="grid grid-cols-2 gap-3">
               <input 
                type="tel" 
                placeholder="Phone (WhatsApp)" 
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-purple-500 outline-none transition"
                value={customer.phone}
                onChange={(e) => setCustomer({...customer, phone: e.target.value})}
               />
               <input 
                type="text" 
                placeholder="GSTIN (Optional)" 
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-purple-500 outline-none transition"
                value={customer.gstin}
                onChange={(e) => setCustomer({...customer, gstin: e.target.value.toUpperCase()})}
               />
             </div>
          </div>
        </div>
      </div>

      {/* MAGIC LINE ITEMS TABLE */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-500">Items & Services</h3>
          <div className="flex gap-3">
             {/* MAGIC SCAN TRIGGER */}
             <MagicScan onScanSuccess={addItemFromScan} variant="minimal" />
             
             <button 
              onClick={() => setItems([...items, { id: Math.random().toString(), name: '', hsn: '', price: 0, quantity: 1, gstRate: 18 }])}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full transition text-xs font-bold"
             >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Manual Add
             </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-gray-600 border-b border-white/5">
                <th className="pb-4 pr-4">Description</th>
                <th className="pb-4 px-4 w-24">HSN</th>
                <th className="pb-4 px-4 w-24 text-right">Price</th>
                <th className="pb-4 px-4 w-20 text-center">Qty</th>
                <th className="pb-4 px-4 w-24 text-right">GST %</th>
                <th className="pb-4 pl-4 text-right w-32">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence>
                {items.map((item) => (
                  <motion.tr 
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="group"
                  >
                    <td className="py-4 pr-4">
                      <input 
                        className="bg-transparent font-bold outline-none w-full" 
                        value={item.name} 
                        onChange={(e) => {
                          const newItems = [...items]
                          newItems.find(i => i.id === item.id)!.name = e.target.value
                          setItems(newItems)
                        }}
                      />
                    </td>
                    <td className="py-4 px-4">
                      <input className="bg-transparent text-sm text-gray-400 outline-none w-full" value={item.hsn} readOnly />
                    </td>
                    <td className="py-4 px-4 text-right">
                       <input 
                        className="bg-transparent font-bold outline-none w-full text-right" 
                        type="number"
                        value={item.price} 
                        onChange={(e) => {
                          const newItems = [...items]
                          newItems.find(i => i.id === item.id)!.price = Number(e.target.value)
                          setItems(newItems)
                        }}
                      />
                    </td>
                    <td className="py-4 px-4 text-center">
                       <input 
                        className="bg-transparent font-bold outline-none w-full text-center" 
                        type="number"
                        value={item.quantity} 
                        onChange={(e) => {
                          const newItems = [...items]
                          newItems.find(i => i.id === item.id)!.quantity = Number(e.target.value)
                          setItems(newItems)
                        }}
                      />
                    </td>
                    <td className="py-4 px-4 text-right text-sm text-gray-500">
                      {item.gstRate}%
                    </td>
                    <td className="py-4 pl-4 text-right font-black">
                      ₹{(item.price * item.quantity * (1 + item.gstRate/100)).toLocaleString()}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="py-12 text-center bg-white/[0.02] border-2 border-dashed border-white/5 rounded-2xl mt-4">
               <p className="text-gray-500 text-sm font-medium italic">Your invoice is empty. Tap Magic Scan to add your first item.</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary Section */}
      <div className="flex flex-col md:flex-row items-end justify-between border-t border-white/10 pt-8 gap-8">
        <div className="flex-1 w-full">
           <p className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-2">Terms & Notes</p>
           <textarea 
            className="w-full h-24 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-indigo-500 transition"
            placeholder="Add payment terms or notes here..."
           />
        </div>
        <div className="w-full md:w-80 space-y-3">
           <div className="flex justify-between text-sm text-gray-500">
             <span>Subtotal</span>
             <span>₹{totals.subtotal.toLocaleString()}</span>
           </div>
           <div className="flex justify-between text-sm text-gray-500">
             <span>GST (Combined)</span>
             <span>₹{totals.gst.toLocaleString()}</span>
           </div>
           <div className="flex justify-between items-center pt-4 border-t border-white/10">
             <span className="text-lg font-black tracking-tighter uppercase">Grand Total</span>
             <span className="text-2xl font-black text-indigo-400">₹{totals.total.toLocaleString()}</span>
           </div>
           
           <button 
              onClick={handleSend}
              disabled={isSending || items.length === 0}
              className="w-full py-6 bg-white text-black hover:bg-white/90 rounded-[2rem] font-black text-xl tracking-tighter transition-all disabled:opacity-30 uppercase shadow-2xl shadow-indigo-500/20"
           >
              {isSending ? 'Sending Link...' : 'Send Invoice via WhatsApp'}
           </button>
        </div>
      </div>
    </div>
  )
}
