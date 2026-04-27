'use client'

import { useState, useEffect } from 'react'
import { 
  Search, Plus, Minus, Trash2, Send, 
  QrCode, User, CreditCard, Banknote,
  RefreshCw, Package, WifiOff, CheckCircle
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOfflinePOS } from '@/hooks/useOfflinePOS'

interface Product {
  id: string
  itemCode: string
  itemName: string
  rate: number
  stock: number
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
  const [customer, setCustomer] = useState<{ name: string; phone: string } | null>(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [lastSale, setLastSale] = useState<{ amount: number; offline: boolean; id: string } | null>(null)
  
  const { isOnline, pendingCount, isSyncing, createInvoice, syncPendingInvoices } = useOfflinePOS()

  useEffect(() => { fetchProducts() }, [])

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/merchant/products?limit=100')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.data || [])
      }
    } catch (e) { console.error('Failed to load products:', e) }
  }

  const subtotal = cart.reduce((sum, item) => sum + item.amount, 0)
  const cgst = Math.round(subtotal * 0.09)
  const sgst = Math.round(subtotal * 0.09)
  const total = subtotal + cgst + sgst

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id)
      if (existing) {
        if (existing.qty >= product.available) return prev
        return prev.map(item =>
          item.productId === product.id
            ? { ...item, qty: item.qty + 1, amount: (item.qty + 1) * item.rate }
            : item
        )
      }
      return [...prev, { productId: product.id, productName: product.itemName, productCode: product.itemCode, qty: 1, rate: product.rate, amount: product.rate }]
    })
  }

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(0, item.qty + delta)
        return { ...item, qty: newQty, amount: newQty * item.rate }
      }
      return item
    }).filter(item => item.qty > 0))
  }

  const completeSale = async (paymentMode: string) => {
    if (cart.length === 0 || loading) return
    setLoading(true)
    try {
      const result = await createInvoice({
        customerName: customer?.name || 'Cash Customer',
        customerPhone: customer?.phone || '',
        items: cart.map(i => ({ itemCode: i.productCode, itemName: i.productName, qty: i.qty, rate: i.rate, amount: i.amount })),
        subtotal, cgst, sgst, total, paymentMode
      })
      if (result.success) {
        setCart([])
        setCustomer(null)
        setShowPaymentModal(false)
        setLastSale({ amount: total, offline: result.offline, id: result.invoiceId! })
        setTimeout(() => setLastSale(null), 4000)
      }
    } catch (e) { console.error('Sale failed:', e) }
    finally { setLoading(false) }
  }

  const filteredProducts = products.filter(p => 
    p.itemName?.toLowerCase().includes(search.toLowerCase()) ||
    p.itemCode?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col lg:flex-row gap-3 h-full">
      {/* Products Panel */}
      <div className="flex-1 flex flex-col bg-white rounded-xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="p-3 border-b flex items-center gap-3 bg-gray-50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {isOnline ? <div className="w-2 h-2 rounded-full bg-green-500" /> : <WifiOff className="w-3 h-3 text-amber-500" />}
            <span className="text-gray-500">{isOnline ? 'Online' : 'Offline'}</span>
            {pendingCount > 0 && <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">{pendingCount}</span>}
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {filteredProducts.slice(0, 48).map(product => {
              const inCart = cart.find(c => c.productId === product.id)
              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={!product.available}
                  className={`p-3 rounded-xl text-left transition-all ${
                    !product.available 
                      ? 'bg-gray-50 border border-gray-100 opacity-50 cursor-not-allowed'
                      : inCart 
                        ? 'bg-indigo-50 border-2 border-indigo-500 shadow-md' 
                        : 'bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 mb-2">
                    <Package className="w-4 h-4 text-indigo-600" />
                  </div>
                  <p className="text-xs font-semibold text-gray-900 truncate">{product.itemName}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm font-bold text-indigo-600">₹{product.rate}</span>
                    {inCart && <span className="text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded">{inCart.qty}</span>}
                  </div>
                  {product.available < 5 && product.available > 0 && (
                    <p className="text-[10px] text-amber-600 mt-1">Only {product.available} left</p>
                  )}
                  {product.available === 0 && (
                    <p className="text-[10px] text-red-500 mt-1">Out of stock</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Cart Panel */}
      <div className="w-full lg:w-80 xl:w-96 flex flex-col bg-white rounded-xl shadow-sm overflow-hidden">
        {/* Status */}
        <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Cart ({cart.length})</span>
          {lastSale && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-green-600 text-xs">
              <CheckCircle className="w-3 h-3" /> ���{lastSale.amount}
            </motion.div>
          )}
        </div>

        {/* Customer */}
        <button onClick={() => setShowCustomerModal(true)} className="p-3 border-b flex items-center gap-3 hover:bg-gray-50">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <User className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-gray-900">{customer?.name || 'Cash Customer'}</p>
            <p className="text-xs text-gray-400">{customer?.phone || 'No phone'}</p>
          </div>
        </button>

        {/* Items */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {cart.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Cart empty</p>
                <p className="text-xs">Tap products to add</p>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              <AnimatePresence>
                {cart.map(item => (
                  <motion.div key={item.productId} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0 }} className="flex items-center gap-2 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <p className="text-xs text-gray-400">₹{item.rate} × {item.qty}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(item.productId, -1)} className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center hover:bg-gray-200">−</button>
                      <span className="w-6 text-center text-xs font-medium">{item.qty}</span>
                      <button onClick={() => updateQty(item.productId, 1)} className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center hover:bg-gray-200">+</button>
                    </div>
                    <span className="w-14 text-right text-sm font-semibold">₹{item.amount}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="p-3 border-t space-y-1 bg-gray-50">
          <div className="flex justify-between text-xs text-gray-500"><span>Subtotal</span><span>₹{subtotal}</span></div>
          <div className="flex justify-between text-xs text-gray-500"><span>CGST (9%)</span><span>₹{cgst}</span></div>
          <div className="flex justify-between text-xs text-gray-500"><span>SGST (9%)</span><span>₹{sgst}</span></div>
          <div className="flex justify-between text-base font-bold pt-1 border-t"><span>Total</span><span className="text-indigo-600">₹{total}</span></div>
        </div>

        {/* Pay Button */}
        <button
          onClick={() => setShowPaymentModal(true)}
          disabled={cart.length === 0 || loading}
          className="m-3 mt-0 py-3 bg-indigo-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 flex items-center justify-center gap-2"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Complete Sale</>}
        </button>
      </div>

      {/* Customer Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowCustomerModal(false)}>
          <div className="bg-white rounded-t-2xl w-full p-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">Select Customer</h3>
            <button onClick={() => { setCustomer({ name: 'Cash Customer', phone: '' }); setShowCustomerModal(false)); }} className="w-full p-3 text-left bg-gray-50 rounded-lg mb-2">
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
              {[
                { id: 'cash', label: 'Cash', icon: Banknote, color: 'green' },
                { id: 'upi', label: 'UPI', icon: QrCode, color: 'purple' },
                { id: 'card', label: 'Card', icon: CreditCard, color: 'blue' }
              ].map(m => (
                <button key={m.id} onClick={() => completeSale(m.id)} disabled={loading} className={`p-4 rounded-xl flex flex-col items-center gap-2 bg-${m.color}-50 border border-${m.color}-200 hover:bg-${m.color}-100`}>
                  <m.icon className={`w-6 h-6 text-${m.color}-600`} />
                  <span className="text-sm font-medium">{m.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowPaymentModal(false)} className="w-full py-3 border rounded-lg">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}