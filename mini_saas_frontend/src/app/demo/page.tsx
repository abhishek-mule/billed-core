'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'

const products = [
  { name: 'Sample Product', price: 100, hsn: '850440' },
  { name: 'Labour Charge', price: 200, hsn: '999999' },
  { name: 'Installation', price: 150, hsn: '999999' },
  { name: 'Transport', price: 100, hsn: '999999' },
]

export default function DemoBillingPage() {
  const [step, setStep] = useState(1)
  const [customer, setCustomer] = useState('')
  const [items, setItems] = useState<{name: string; qty: number; price: number; hsn: string}[]>([])
  const [isSent, setIsSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const addItem = (name: string, price: number, hsn: string) => {
    const existing = items.find(i => i.name === name)
    if (existing) {
      setItems(items.map(i => i.name === name ? {...i, qty: i.qty + 1} : i))
    } else {
      setItems([...items, {name, qty: 1, price, hsn}])
    }
  }

  const removeItem = (name: string) => {
    setItems(items.filter(i => i.name !== name))
  }

  const updateQty = (name: string, delta: number) => {
    setItems(items.map(i => {
      if (i.name === name) {
        const newQty = Math.max(0, i.qty + delta)
        return {...i, qty: newQty}
      }
      return i
    }).filter(i => i.qty > 0))
  }

  const subtotal = items.reduce((sum, i) => sum + (i.price * i.qty), 0)
  const cgst = subtotal * 0.09
  const sgst = subtotal * 0.09
  const igst = 0
  const total = subtotal + cgst + sgst + igst

  const handleSend = async () => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/v2/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customer || 'Walk-in Customer',
          items: items.map(item => ({
            itemCode: item.name.toUpperCase().replace(/\s/g, '-'),
            itemName: item.name,
            qty: item.qty,
            rate: item.price,
            amount: item.price * item.qty,
            hsnCode: item.hsn,
          })),
          subtotal,
          cgst,
          sgst,
          igst,
          total,
          paymentMode: 'cash',
          placeOfSupply: 'Maharashtra',
        }),
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create invoice')
      }

      setIsSent(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amt: number) => `₹${amt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

  if (isSent) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6"
          >
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
          <h2 className="text-2xl font-bold mb-2">Demo Invoice Created!</h2>
          <p className="text-gray-400 mb-8">Invoice synced to ERPNext (mock mode)</p>
          
          <div className="bg-white/5 rounded-xl p-4 mb-8 text-left max-w-sm mx-auto">
            <p className="text-sm text-gray-300">🧾 Invoice to: {customer || 'Walk-in Customer'}</p>
            <p className="text-lg font-bold mt-2">{formatCurrency(total)}</p>
            <p className="text-xs text-green-400 mt-1">✓ Synced to ERP (Demo)</p>
          </div>

          <div className="space-y-3">
            <Link href="/start" className="block w-full py-3 bg-white text-black font-semibold rounded-lg">
              Start Real Account →
            </Link>
            <button onClick={() => { setIsSent(false); setItems([]); setCustomer(''); setStep(1) }} className="block w-full py-3 text-gray-400 font-medium">
              Try Again
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">Z</span>
            </div>
            <span className="font-semibold">BillZo Demo</span>
          </Link>
          <span className="text-xs text-blue-400">Mock Mode</span>
        </div>
      </header>

      <div className="pt-20 px-4 pb-32 max-w-md mx-auto space-y-4">
        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-blue-600' : 'bg-gray-800'}`} />
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {step === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-xl font-bold mb-4">Who is this for?</h2>
            <input
              type="text"
              value={customer}
              onChange={e => setCustomer(e.target.value)}
              placeholder="Customer name or phone"
              className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-xl text-lg outline-none focus:border-blue-500"
              onKeyDown={e => e.key === 'Enter' && setStep(2)}
            />
            <button
              onClick={() => setStep(2)}
              disabled={!customer.trim() && items.length === 0}
              className="w-full mt-4 py-4 bg-white text-black font-semibold rounded-xl disabled:opacity-50"
            >
              Continue
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-xl font-bold mb-4">Add items</h2>
            <div className="grid grid-cols-2 gap-3">
              {products.map(item => (
                <button
                  key={item.name}
                  onClick={() => addItem(item.name, item.price, item.hsn)}
                  className="p-4 bg-white/5 border border-white/10 rounded-xl text-left hover:border-blue-500 transition"
                >
                  <p className="font-medium">{item.name}</p>
                  <p className="text-blue-400 font-bold">₹{item.price}</p>
                </button>
              ))}
            </div>

            {items.length > 0 && (
              <div className="mt-4 space-y-2">
                {items.map(item => (
                  <div key={item.name} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">₹{item.price} each</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateQty(item.name, -1)} className="w-8 h-8 rounded bg-white/10">-</button>
                      <span className="w-6 text-center font-bold">{item.qty}</span>
                      <button onClick={() => updateQty(item.name, 1)} className="w-8 h-8 rounded bg-white/10">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={() => setStep(1)} className="flex-1 py-4 bg-white/5 text-white font-medium rounded-xl">
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={items.length === 0}
                className="flex-1 py-4 bg-white text-black font-semibold rounded-xl disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-xl font-bold mb-4">Review & Send</h2>
            
            <div className="bg-white/5 rounded-xl p-4 space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">CGST (9%)</span>
                <span>{formatCurrency(cgst)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">SGST (9%)</span>
                <span>{formatCurrency(sgst)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-3 border-t border-white/10">
                <span>Total</span>
                <span className="text-blue-400">{formatCurrency(total)}</span>
              </div>
            </div>

            <button
              onClick={handleSend}
              disabled={loading}
              className="w-full py-4 bg-green-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <span className="animate-pulse">Creating...</span>
              ) : (
                <>
                  <span>📱</span>
                  Create Invoice
                </>
              )}
            </button>

            <button onClick={() => setStep(2)} className="w-full mt-3 py-3 text-gray-400">
              ← Back
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}