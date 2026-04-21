'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'

interface LineItem {
  id: string
  item_code: string
  item_name: string
  hsn_code?: string
  qty: number
  rate: number
  amount: number
  discount?: number
}

interface Customer {
  name: string
  customer_name: string
  phone: string
  gstin?: string
  address?: string
}

const mockProducts = [
  { item_code: 'FAN-001', item_name: 'Bajaj 48" Fan', hsn_code: '8414', rate: 2500 },
  { item_code: 'LED-001', item_name: 'Philips LED Bulb 9W', hsn_code: '8539', rate: 300 },
  { item_code: 'WIRE-001', item_name: 'Havells Wire 2.5mm (90m)', hsn_code: '8544', rate: 1500 },
  { item_code: 'SWITCH-001', item_name: 'Polycab Switch Board', hsn_code: '8536', rate: 750 },
  { item_code: 'CABLE-001', item_name: 'HDMI Cable 1.5m', hsn_code: '8544', rate: 450 },
]

const mockCustomers = [
  { customer_name: 'Mehta Textiles', phone: '9876543210', gstin: '27AABCU9603R1ZX' },
  { customer_name: 'Rajesh Kumar', phone: '9876543211' },
  { customer_name: 'Priya Kreations', phone: '9876543212', gstin: '29AAFPU4567M1ZT' },
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
  const [gstRate, setGstRate] = useState(18)
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'card' | 'credit'>('cash')
  const [enableReminder, setEnableReminder] = useState(true)

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
      sendWhatsApp: 'Send Invoice',
      sending: 'Sending...',
      invoiceSent: 'Invoice Sent!',
      newInvoice: 'New Invoice',
      gst: `GST (${gstRate}%)`,
      subtotal: 'Subtotal',
      cgst: 'CGST',
      sgst: 'SGST',
      items: 'Items',
      noItems: 'No items added',
      saveDraft: 'Save Draft',
      preview: 'Preview',
      payment: 'Payment',
      cash: 'Cash',
      upi: 'UPI',
      card: 'Card',
      credit: 'Credit',
      reminder: 'Auto-reminder',
      discount: 'Discount',
      hsn: 'HSN',
    },
    hi: {
      customerPhone: 'ग्राहक फोन',
      selectCustomer: 'ग्राहक चुनें',
      addCustomer: '+ नया ग्राहक',
      addItem: '+ आइटम जोड़ें',
      searchProduct: 'सामान खोजें...',
      total: 'कुल',
      sendWhatsApp: 'बिल भेजें',
      sending: 'भेज रहे हैं...',
      invoiceSent: 'बिल भेज दिया!',
      newInvoice: 'नया बिल',
      gst: `GST (${gstRate}%)`,
      subtotal: 'उप-योग',
      cgst: 'CGST',
      sgst: 'SGST',
      items: 'आइटम',
      noItems: 'कोई आइटम नहीं',
      saveDraft: 'ड्राफ्ट सेव',
      preview: 'देखें',
      payment: 'भुगतान',
      cash: 'कैश',
      upi: 'UPI',
      card: 'कार्ड',
      credit: 'उधार',
      reminder: 'ऑटो-रिमाइंडर',
      discount: 'छूट',
      hsn: 'HSN',
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
      hsn_code: product.hsn_code,
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

  const updateItemRate = (id: string, rate: number) => {
    setItems(items.map(item => 
      item.id === id 
        ? { ...item, rate, amount: item.rate * item.qty }
        : item
    ))
  }

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id))
  }

  const addDiscount = (id: string, discount: number) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const discountedAmount = item.rate * item.qty * (1 - discount / 100)
        return { ...item, discount, amount: discountedAmount }
      }
      return item
    }))
  }

  const totals = items.reduce((acc, item) => {
    const subtotal = item.rate * item.qty
    const discount = subtotal * ((item.discount || 0) / 100)
    const afterDiscount = subtotal - discount
    const gst = afterDiscount * (gstRate / 100)
    const cgst = gst / 2
    const sgst = gst / 2
    return {
      subtotal: acc.subtotal + afterDiscount,
      cgst: acc.cgst + cgst,
      sgst: acc.sgst + sgst,
      gst: acc.gst + gst,
      discount: acc.discount + discount,
      total: acc.total + afterDiscount + gst
    }
  }, { subtotal: 0, cgst: 0, sgst: 0, gst: 0, discount: 0, total: 0 })

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
          totals,
          paymentMode,
          enableReminder
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

  const filteredCustomers = customerPhone
    ? mockCustomers.filter(c => 
        c.phone.includes(customerPhone) ||
        c.customer_name.toLowerCase().includes(customerPhone.toLowerCase())
      )
    : mockCustomers

  return (
    <div className="min-h-screen bg-[#faf9f7] text-[#0e0e10] font-sans pb-48">
      <AnimatePresence>
        {isSent && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-[#faf9f7]/98 backdrop-blur-2xl flex flex-col items-center justify-center text-center p-8"
          >
            <motion.div 
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-emerald-500/20"
            >
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
            <h2 className="text-3xl font-bold text-[#0e0e10] mb-2">
              {t[lang].invoiceSent}
            </h2>
            <p className="text-[#7a7a8c] font-medium mb-2">
              {customer?.customer_name}
            </p>
            <p className="text-[#4338ca] font-semibold mb-8">
              {formatCurrency(totals.total)} via {paymentMode === 'upi' ? 'UPI' : paymentMode === 'card' ? 'Card' : paymentMode === 'credit' ? 'Credit' : 'Cash'}
            </p>
            <button 
              onClick={() => { 
                setIsSent(false) 
                setItems([])
                setCustomer(null)
                setCustomerPhone('')
              }}
              className="px-8 py-3 bg-[#4338ca] text-white rounded-full font-semibold text-sm hover:bg-[#3730a3] transition"
            >
              {t[lang].newInvoice}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-xl border-b border-black/5 px-4 py-3">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <Link href="/merchant" className="flex items-center gap-2">
            <div className="relative w-8 h-8">
              <Image src="/logo.svg" alt="BillZo" fill className="object-contain" />
            </div>
          </Link>
          <h1 className="text-lg font-bold text-[#0e0e10]">{t[lang].newInvoice}</h1>
          <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="text-xs font-bold bg-[#f2f0ec] px-2 py-1 rounded">
            {lang === 'en' ? 'हिं' : 'EN'}
          </button>
        </div>
      </header>

      <div className="pt-20 px-4 pb-8 space-y-4 max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e4dc] p-4">
          <label className="text-xs font-bold uppercase tracking-wider text-[#7a7a8c] mb-3 block">
            {t[lang].customerPhone}
          </label>
          
          {customer ? (
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#0e0e10] truncate">{customer.customer_name}</p>
                <p className="text-sm text-[#7a7a8c]">{customer.phone} {customer.gstin && `· ${customer.gstin}`}</p>
              </div>
              <button 
                onClick={() => { setCustomer(null); setCustomerPhone('') }}
                className="text-xs text-[#dc2626] font-semibold"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                ref={phoneInputRef}
                type="tel"
                placeholder="Enter phone or name"
                className="w-full bg-[#faf9f7] border border-[#e8e4dc] rounded-xl px-4 py-3 text-lg font-semibold outline-none focus:border-[#4338ca] focus:ring-2 focus:ring-[#4338ca]/10"
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value)
                  setShowCustomerSearch(true)
                }}
                onFocus={() => setShowCustomerSearch(true)}
              />
              {showCustomerSearch && customerPhone.length >= 1 && (
                <div className="space-y-1 bg-white rounded-xl border border-[#e8e4dc] overflow-hidden">
                  {filteredCustomers.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setCustomer(c as Customer)
                        setShowCustomerSearch(false)
                        setCustomerPhone(c.phone)
                      }}
                      className="w-full text-left p-3 hover:bg-[#faf9f7] flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold text-sm">{c.customer_name}</p>
                        <p className="text-xs text-[#7a7a8c]">{c.phone}</p>
                      </div>
                      {c.gstin && <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-medium">GST</span>}
                    </button>
                  ))}
                  <button className="w-full text-left p-3 border-t border-[#e8e4dc] hover:bg-[#faf9f7] text-[#4338ca] font-semibold text-sm">
                    + {t[lang].addCustomer}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#7a7a8c]">
            {t[lang].items} ({items.length})
          </h2>
          
          {items.length === 0 ? (
            <button
              onClick={() => setShowProductSearch(true)}
              className="w-full p-10 border-2 border-dashed border-[#e8e4dc] rounded-2xl text-[#7a7a8c] font-semibold hover:border-[#4338ca] hover:bg-[#4338ca]/5 transition"
            >
              + {t[lang].addItem}
            </button>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div 
                  key={item.id}
                  className="bg-white rounded-xl shadow-sm border border-[#e8e4dc] p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="font-semibold text-sm truncate">{item.item_name}</p>
                      <p className="text-xs text-[#7a7a8c]">{item.hsn_code && `HSN: ${item.hsn_code} · `}₹{item.rate} each</p>
                    </div>
                    <button 
                      onClick={() => removeItem(item.id)}
                      className="w-8 h-8 flex items-center justify-center text-[#dc2626] bg-red-50 rounded-lg"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 bg-[#faf9f7] rounded-lg">
                      <button 
                        onClick={() => updateItemQty(item.id, item.qty - 1)}
                        className="w-10 h-10 flex items-center justify-center text-lg font-bold text-[#4338ca]"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-bold">{item.qty}</span>
                      <button 
                        onClick={() => updateItemQty(item.id, item.qty + 1)}
                        className="w-10 h-10 flex items-center justify-center text-lg font-bold text-[#4338ca]"
                      >
                        +
                      </button>
                    </div>
                    <p className="font-bold text-lg">{formatCurrency(item.amount)}</p>
                  </div>
                </div>
              ))}
              
              <button
                onClick={() => setShowProductSearch(true)}
                className="w-full p-4 border-2 border-dashed border-[#e8e4dc] rounded-xl text-[#7a7a8c] font-semibold hover:border-[#4338ca] transition"
              >
                + {t[lang].addItem}
              </button>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#e8e4dc] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#7a7a8c]">{t[lang].subtotal}</span>
              <span className="font-semibold">{formatCurrency(totals.subtotal + totals.discount)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex items-center justify-between text-emerald-600">
                <span className="text-sm font-medium">{t[lang].discount}</span>
                <span className="font-semibold">-{formatCurrency(totals.discount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#7a7a8c]">{t[lang].cgst} ({gstRate/2}%)</span>
              <span className="font-semibold">{formatCurrency(totals.cgst)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#7a7a8c]">{t[lang].sgst} ({gstRate/2}%)</span>
              <span className="font-semibold">{formatCurrency(totals.sgst)}</span>
            </div>
            <div className="h-px bg-[#e8e4dc]" />
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">{t[lang].total}</span>
              <span className="text-2xl font-bold text-[#4338ca]">{formatCurrency(totals.total)}</span>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#e8e4dc] p-4 space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#7a7a8c] mb-3 block">
                {t[lang].payment}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['cash', 'upi', 'card', 'credit'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setPaymentMode(mode)}
                    className={`py-3 rounded-xl text-sm font-semibold transition-all ${
                      paymentMode === mode 
                        ? 'bg-[#4338ca] text-white shadow-lg shadow-[#4338ca]/20' 
                        : 'bg-[#faf9f7] text-[#7a7a8c] hover:bg-[#f2f0ec]'
                    }`}
                  >
                    {t[lang][mode as keyof typeof t.en]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#0e0e10]">{t[lang].reminder}</span>
              <button 
                onClick={() => setEnableReminder(!enableReminder)}
                className={`w-12 h-6 rounded-full transition-all ${
                  enableReminder ? 'bg-[#4338ca]' : 'bg-[#e8e4dc]'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  enableReminder ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showProductSearch && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-white/95 backdrop-blur-xl flex flex-col"
          >
            <div className="p-4 border-b border-[#e8e4dc]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">{t[lang].searchProduct}</h2>
                <button onClick={() => setShowProductSearch(false)} className="w-10 h-10 flex items-center justify-center bg-[#faf9f7] rounded-xl">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <input
                ref={productInputRef}
                type="text"
                placeholder={t[lang].searchProduct}
                className="w-full bg-[#faf9f7] border border-[#e8e4dc] rounded-xl px-4 py-3 text-lg font-semibold outline-none focus:border-[#4338ca] focus:ring-2 focus:ring-[#4338ca]/10"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 max-w-md mx-auto w-full">
              {filteredProducts.map((product) => (
                <button
                  key={product.item_code}
                  onClick={() => addItem(product)}
                  className="w-full flex items-center justify-between p-4 bg-white border border-[#e8e4dc] rounded-xl text-left hover:border-[#4338ca] hover:shadow-md transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{product.item_name}</p>
                    <p className="text-xs text-[#7a7a8c]">{product.item_code} · HSN: {product.hsn_code}</p>
                  </div>
                  <p className="font-bold text-[#4338ca] text-lg">₹{product.rate}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-xl border-t border-[#e8e4dc]">
          <div className="max-w-md mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#7a7a8c]">{t[lang].total}</span>
              <span className="text-2xl font-bold text-[#4338ca]">{formatCurrency(totals.total)}</span>
            </div>
            <button
              onClick={handleSend}
              disabled={isSending || !customer}
              className="w-full py-4 bg-[#4338ca] text-white font-bold text-lg rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-[#4338ca]/20 flex items-center justify-center gap-2"
            >
              {isSending ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t[lang].sending}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  {t[lang].sendWhatsApp}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}