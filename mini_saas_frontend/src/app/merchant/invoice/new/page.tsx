'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

interface LineItem {
  id: string
  item_code: string
  item_name: string
  qty: number
  rate: number
  amount: number
}

interface Customer {
  name: string
  customer_name: string
  phone: string
  gstin?: string
}

const mockProducts = [
  { item_code: 'FAN-001', item_name: 'Bajaj 48" Fan', rate: 2500 },
  { item_code: 'LED-001', item_name: 'Philips LED Bulb 9W', rate: 300 },
  { item_code: 'WIRE-001', item_name: 'Havells Wire 2.5mm (90m)', rate: 1500 },
  { item_code: 'SWITCH-001', item_name: 'Polycab Switch Board', rate: 750 },
  { item_code: 'CABLE-001', item_name: ' HDMI Cable 1.5m', rate: 450 },
]

export default function NewInvoicePage() {
  const router = useRouter()
  const [items, setItems] = useState<LineItem[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerPhone, setCustomerPhone] = useState('')
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [showProductSearch, setShowProductSearch] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [lang, setLang] = useState<'en' | 'hi'>('en')

  const phoneInputRef = useRef<HTMLInputElement>(null)
  const productInputRef = useRef<HTMLInputElement>(null)

  const t = {
    en: {
      customerPhone: 'Customer Phone',
      selectCustomer: 'Select or add customer',
      addCustomer: '+ Add New Customer',
      addItem: '+ Add Item',
      searchProduct: 'Search items...',
      total: 'Total',
      sendWhatsApp: 'Send via WhatsApp',
      sending: 'Sending...',
      invoiceSent: 'Invoice Sent!',
      newInvoice: 'New Invoice',
      gst: 'GST (18%)',
      subtotal: 'Subtotal',
    },
    hi: {
      customerPhone: 'ग्राहक फोन',
      selectCustomer: 'ग्राहक चुनें',
      addCustomer: '+ नया ग्राहक',
      addItem: '+ आइटम जोड़ें',
      searchProduct: 'सामान खोजें...',
      total: 'कुल',
      sendWhatsApp: 'WhatsApp पर भेजें',
      sending: 'भेज रहे हैं...',
      invoiceSent: 'बिल भेज दिया!',
      newInvoice: 'नया बिल',
      gst: 'GST (18%)',
      subtotal: 'उप-योग',
    }
  }

  useEffect(() => {
    if (showCustomerSearch && phoneInputRef.current) {
      phoneInputRef.current.focus()
    }
  }, [showCustomerSearch])

  useEffect(() => {
    if (showProductSearch && productInputRef.current) {
      productInputRef.current.focus()
    }
  }, [showProductSearch])

  const addItem = (product: any) => {
    const newItem: LineItem = {
      id: Math.random().toString(36).substr(2, 9),
      item_code: product.item_code,
      item_name: product.item_name,
      qty: 1,
      rate: product.rate,
      amount: product.rate
    }
    setItems([...items, newItem])
    setShowProductSearch(false)
    setProductQuery('')
  }

  const updateItemQty = (id: string, qty: number) => {
    if (qty < 1) return
    setItems(items.map(item => 
      item.id === id 
        ? { ...item, qty, amount: item.rate * qty }
        : item
    ))
  }

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id))
  }

  const totals = items.reduce((acc, item) => {
    const amount = item.rate * item.qty
    const gst = amount * 0.18
    return {
      subtotal: acc.subtotal + amount,
      gst: acc.gst + gst,
      total: acc.total + amount + gst
    }
  }, { subtotal: 0, gst: 0, total: 0 })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR',
      maximumFractionDigits: 0 
    }).format(amount)
  }

  const handleSend = async () => {
    if (!customer) {
      alert(t[lang].selectCustomer)
      return
    }
    if (items.length === 0) {
      alert(t[lang].addItem)
      return
    }
    setIsSending(true)
    try {
      const res = await fetch('/api/merchant/invoice/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          customer, 
          items,
          totals
        })
      })
      if (res.ok) setIsSent(true)
    } finally { 
      setIsSending(false) 
    }
  }

  const filteredProducts = productQuery 
    ? mockProducts.filter(p => 
        p.item_name.toLowerCase().includes(productQuery.toLowerCase()) ||
        p.item_code.toLowerCase().includes(productQuery.toLowerCase())
      )
    : mockProducts

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <AnimatePresence>
        {isSent && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-[#0a0a0a]/98 backdrop-blur-2xl flex flex-col items-center justify-center text-center p-8"
          >
            <motion.div 
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-emerald-500/20"
            >
              <svg className="w-10 h-10 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
            <h2 className="text-3xl font-black italic tracking-tighter uppercase mb-2">
              {t[lang].invoiceSent}
            </h2>
            <p className="text-gray-400 font-medium mb-8">
              WhatsApp: {customer?.phone}
            </p>
            <button 
              onClick={() => { 
                setIsSent(false) 
                setItems([])
                setCustomer(null)
                setCustomerPhone('')
              }}
              className="px-8 py-3 bg-white/5 border border-white/10 rounded-full font-bold text-sm hover:bg-white/10 transition"
            >
              {t[lang].newInvoice}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4 pb-36 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-black italic tracking-tighter">{t[lang].newInvoice}</h1>
          <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="text-xs font-bold text-gray-500">
            {lang === 'en' ? 'हिं' : 'EN'}
          </button>
        </div>

        <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 block">
            {t[lang].customerPhone}
          </label>
          
          {customer ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">{customer.customer_name}</p>
                <p className="text-sm text-gray-400">{customer.phone}</p>
              </div>
              <button 
                onClick={() => { setCustomer(null); setCustomerPhone('') }}
                className="text-xs text-rose-400 font-bold"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                ref={phoneInputRef}
                type="tel"
                placeholder={t[lang].customerPhone}
                className="w-full bg-transparent text-2xl font-bold outline-none"
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value)
                  setShowCustomerSearch(true)
                }}
                onFocus={() => setShowCustomerSearch(true)}
              />
              {customerPhone.length >= 3 && (
                <div className="space-y-1">
                  <button className="w-full text-left p-3 bg-white/5 rounded-xl text-sm hover:bg-white/10">
                    + {t[lang].addNewCustomer}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Items ({items.length})
          </h2>
          
          {items.length === 0 ? (
            <button
              onClick={() => setShowProductSearch(true)}
              className="w-full p-8 border-2 border-dashed border-white/10 rounded-2xl text-gray-500 font-medium hover:border-indigo-500/30 hover:bg-indigo-500/5 transition"
            >
              + {t[lang].addItem}
            </button>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div 
                  key={item.id}
                  className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{item.item_name}</p>
                    <p className="text-xs text-gray-500">₹{item.rate} each</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-white/5 rounded-lg">
                      <button 
                        onClick={() => updateItemQty(item.id, item.qty - 1)}
                        className="w-8 h-8 flex items-center justify-center text-lg font-bold"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-bold">{item.qty}</span>
                      <button 
                        onClick={() => updateItemQty(item.id, item.qty + 1)}
                        className="w-8 h-8 flex items-center justify-center text-lg font-bold"
                      >
                        +
                      </button>
                    </div>
                    <p className="font-bold w-20 text-right">{formatCurrency(item.amount)}</p>
                    <button 
                      onClick={() => removeItem(item.id)}
                      className="w-6 h-6 flex items-center justify-center text-rose-500"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              
              <button
                onClick={() => setShowProductSearch(true)}
                className="w-full p-4 border-2 border-dashed border-white/10 rounded-xl text-gray-500 font-bold hover:border-indigo-500/30 transition"
              >
                + {t[lang].addItem}
              </button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showProductSearch && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-[#0a0a0a]/98 backdrop-blur-xl flex flex-col"
          >
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">{t[lang].searchProduct}</h2>
                <button onClick={() => setShowProductSearch(false)}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <input
                ref={productInputRef}
                type="text"
                placeholder={t[lang].searchProduct}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:border-indigo-500"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredProducts.map((product) => (
                <button
                  key={product.item_code}
                  onClick={() => addItem(product)}
                  className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl text-left hover:bg-white/10"
                >
                  <div>
                    <p className="font-bold">{product.item_name}</p>
                    <p className="text-xs text-gray-500">{product.item_code}</p>
                  </div>
                  <p className="font-bold text-indigo-400">₹{product.rate}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {items.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 p-4 bg-[#0a0a0a]/95 backdrop-blur-md border-t border-white/5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">{t[lang].subtotal}</span>
            <span className="font-bold">{formatCurrency(totals.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">{t[lang].gst}</span>
            <span className="font-bold">{formatCurrency(totals.gst)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold">{t[lang].total}</span>
            <span className="text-xl font-black">{formatCurrency(totals.total)}</span>
          </div>
          <button
            onClick={handleSend}
            disabled={isSending || !customer}
            className="w-full mt-4 py-4 bg-emerald-500 text-black font-black text-lg rounded-xl transition-all disabled:opacity-30 shadow-lg shadow-emerald-500/20"
          >
            {isSending ? t[lang].sending : t[lang].sendWhatsApp}
          </button>
        </div>
      )}
    </div>
  )
}