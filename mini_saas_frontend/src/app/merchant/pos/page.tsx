'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, Minus, Send, QrCode, User, CreditCard, Banknote, RefreshCw, Package, WifiOff, CheckCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOfflinePOS } from '@/hooks/useOfflinePOS'

interface Product {
  id: string
  itemCode: string
  itemName: string
  rate: number
  available: number
}

interface CartItem {
  productId: string
  productName: string
  productCode: string
  qty: number
  rate: number
  amount: number
}

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [customer, setCustomer] = useState<{name: string; phone: string} | null>(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [lastSale, setLastSale] = useState<{amount: number; offline: boolean} | null>(null)
  
  const { isOnline, pendingCount, createInvoice } = useOfflinePOS()

  useEffect(() => { fetchProducts() }, [])

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/merchant/products?limit=100')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.data || [])
      }
    } catch (e) { console.error(e) }
  }

  const subtotal = cart.reduce((s, i) => s + i.amount, 0)
  const cgst = Math.round(subtotal * 0.09)
  const sgst = Math.round(subtotal * 0.09)
  const total = subtotal + cgst + sgst

  const addToCart = (p: Product) => {
    setCart(prev => {
      const ex = prev.find(i => i.productId === p.id)
      if (ex && ex.qty < p.available) {
        return prev.map(i => i.productId === p.id ? {...i, qty: i.qty + 1, amount: (i.qty + 1) * i.rate} : i)
      }
      if (ex) return prev
      return [...prev, {productId: p.id, productName: p.itemName, productCode: p.itemCode, qty: 1, rate: p.rate, amount: p.rate}]
    })
  }

  const updateQty = (pid: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.productId === pid) {
        const n = Math.max(0, i.qty + delta)
        return {...i, qty: n, amount: n * i.rate}
      }
      return i
    }).filter(i => i.qty > 0))
  }

  const completeSale = async (pm: string) => {
    if (cart.length === 0 || loading) return
    setLoading(true)
    try {
      const r = await createInvoice({
        customerName: customer?.name || 'Cash Customer',
        customerPhone: customer?.phone || '',
        items: cart.map(i => ({itemCode: i.productCode, itemName: i.productName, qty: i.qty, rate: i.rate, amount: i.amount})),
        subtotal, cgst, sgst, total, paymentMode: pm
      })
      if (r.success) {
        setCart([])
        setCustomer(null)
        setShowPaymentModal(false)
        setLastSale({amount: total, offline: r.offline})
        setTimeout(() => setLastSale(null), 4000)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const filtered = products.filter(p => 
    p.itemName?.toLowerCase().includes(search.toLowerCase()) ||
    p.itemCode?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col lg:flex-row gap-3 h-full">
      {/* Products Panel */}
      <div className="flex-1 flex flex-col bg-white rounded-xl overflow-hidden shadow-sm">
        <div className="p-3 border-b flex items-center gap-3 bg-gray-50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {isOnline ? <div className="w-2 h-2 rounded-full bg-green-500" /> : <WifiOff className="w-3 h-3 text-amber-500" />}
            <span className="text-gray-500">{isOnline ? 'Online' : 'Offline'}</span>
            {pendingCount > 0 && <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">{pendingCount}</span>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {filtered.slice(0, 48).map(p => {
              const c = cart.find(i => i.productId === p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={!p.available}
                  className={`p-3 rounded-xl text-left transition-all ${!p.available ? 'bg-gray-50 border border-gray-100 opacity-50' : c ? 'bg-indigo-50 border-2 border-indigo-500' : 'bg-white border border-gray-200 hover:border-indigo-300'}`}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 mb-2">
                    <Package className="w-4 h-4 text-indigo-600" />
                  </div>
                  <p className="text-xs font-semibold text-gray-900 truncate">{p.itemName}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm font-bold text-indigo-600">₹{p.rate}</span>
                    {c && <span className="text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded">{c.qty}</span>}
                  </div>
                  {p.available < 5 && p.available > 0 && <p className="text-[10px] text-amber-600 mt-1">Only {p.available} left</p>}
                  {p.available === 0 && <p className="text-[10px] text-red-500 mt-1">Out of stock</p>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Cart Panel */}
      <div className="w-full lg:w-80 xl:w-96 flex flex-col bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Cart ({cart.length})</span>
          {lastSale && (
            <motion.div initial={{opacity: 0}} animate={{opacity: 1}} className="flex items-center gap-1.5 text-green-600 text-xs">
              <CheckCircle className="w-3 h-3" />₹{lastSale.amount}
            </motion.div>
          )}
        </div>
        <button onClick={() => setShowCustomerModal(true)} className="p-3 border-b flex items-center gap-3 hover:bg-gray-50">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <User className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-gray-900">{customer?.name || 'Cash Customer'}</p>
            <p className="text-xs text-gray-400">{customer?.phone || 'No phone'}</p>
          </div>
        </button>
        <div className="flex-1 overflow-y-auto min-h-0">
          {cart.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Cart empty</p>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              <AnimatePresence>
                {cart.map(i => (
                  <motion.div key={i.productId} initial={{opacity: 0, height: 0}} animate={{opacity: 1, height: 'auto'}} exit={{opacity: 0}} className="flex items-center gap-2 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{i.productName}</p>
                      <p className="text-xs text-gray-400">₹{i.rate} × {i.qty}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(i.productId, -1)} className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center">−</button>
                      <span className="w-6 text-center text-xs font-medium">{i.qty}</span>
                      <button onClick={() => updateQty(i.productId, 1)} className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center">+</button>
                    </div>
                    <span className="w-14 text-right text-sm font-semibold">₹{i.amount}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
        <div className="p-3 border-t space-y-1 bg-gray-50">
          <div className="flex justify-between text-xs text-gray-500"><span>Subtotal</span><span>₹{subtotal}</span></div>
          <div className="flex justify-between text-xs text-gray-500"><span>CGST (9%)</span><span>₹{cgst}</span></div>
          <div className="flex justify-between text-xs text-gray-500"><span>SGST (9%)</span><span>₹{sgst}</span></div>
          <div className="flex justify-between text-base font-bold pt-1 border-t"><span>Total</span><span className="text-indigo-600">₹{total}</span></div>
        </div>
        <button onClick={() => setShowPaymentModal(true)} disabled={cart.length === 0 || loading} className="m-3 mt-0 py-3 bg-indigo-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-indigo-700 flex items-center justify-center gap-2">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Complete Sale</>}
        </button>
      </div>

      {/* Customer Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowCustomerModal(false)}>
          <div className="bg-white rounded-t-2xl w-full p-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">Select Customer</h3>
            <button onClick={() => {setCustomer({name: 'Cash Customer', phone: ''}); setShowCustomerModal(false)}} className="w-full p-3 text-left bg-gray-50 rounded-lg mb-2">
              <p className="font-medium">Cash Customer</p>
              <p className="text-xs text-gray-400">Walk-in</p>
            </button>
            <button onClick={() => setShowCustomerModal(false)} className="w-full py-3 border rounded-lg mt-2">Cancel</button>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white rounded-t-2xl w-full p-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">Payment Mode</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <button onClick={() => completeSale('cash')} disabled={loading} className="p-4 rounded-xl flex flex-col items-center gap-2 bg-green-50 border border-green-200">
                <Banknote className="w-6 h-6 text-green-600" />
                <span className="text-sm font-medium">Cash</span>
              </button>
              <button onClick={() => completeSale('upi')} disabled={loading} className="p-4 rounded-xl flex flex-col items-center gap-2 bg-purple-50 border border-purple-200">
                <QrCode className="w-6 h-6 text-purple-600" />
                <span className="text-sm font-medium">UPI</span>
              </button>
              <button onClick={() => completeSale('card')} disabled={loading} className="p-4 rounded-xl flex flex-col items-center gap-2 bg-blue-50 border border-blue-200">
                <CreditCard className="w-6 h-6 text-blue-600" />
                <span className="text-sm font-medium">Card</span>
              </button>
            </div>
            <button onClick={() => setShowPaymentModal(false)} className="w-full py-3 border rounded-lg">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}