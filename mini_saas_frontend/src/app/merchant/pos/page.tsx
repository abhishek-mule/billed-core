'use client'

import { useState, useCallback, useEffect } from 'react'
import { 
  Search, Plus, Minus, Trash2, Send, 
  QrCode, User, CreditCard, Banknote,
  RefreshCw, Package, ArrowRight, WifiOff,
  CheckCircle, AlertCircle, Clock
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOfflinePOS } from '@/hooks/useOfflinePOS'

interface Product {
  id: string
  itemCode: string
  itemName: string
  rate: number
  gstRate: number
  stock: number
}

interface CartItem {
  productId: string
  productName: string
  productCode: string
  qty: number
  rate: number
  gstRate: number
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
  const [recentInvoices, setRecentInvoices] = useState<any[]>([])
  const [lastSale, setLastSale] = useState<{ amount: number; offline: boolean; time: Date } | null>(null)
  
  // Use offline-first hook
  const { 
    isOnline, 
    pendingCount, 
    isSyncing, 
    createInvoice,
    syncPendingInvoices,
  } = useOfflinePOS()

  // Load products on mount
  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/merchant/products?limit=50')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.data || [])
      }
    } catch (e) {
      console.error('Failed to load products:', e)
    }
  }

  // Calculate totals with GST
  const subtotal = cart.reduce((sum, item) => sum + item.amount, 0)
  const cgst = cart.reduce((sum, item) => sum + (item.amount * item.gstRate / 200), 0)
  const sgst = cart.reduce((sum, item) => sum + (item.amount * item.gstRate / 200), 0)
  const total = subtotal + cgst + sgst

  // Add to cart
  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id)
      if (existing) {
        return prev.map(item =>
          item.productId === product.id
            ? { ...item, qty: item.qty + 1, amount: (item.qty + 1) * item.rate }
            : item
        )
      }
      return [...prev, {
        productId: product.id,
        productName: product.itemName,
        productCode: product.itemCode,
        qty: 1,
        rate: product.rate,
        gstRate: product.gstRate || 18,
        amount: product.rate
      }]
    })
  }, [])

  // Update quantity
  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(0, item.qty + delta)
        return { ...item, qty: newQty, amount: newQty * item.rate }
      }
      return item
    }).filter(item => item.qty > 0))
  }

  // Remove from cart
  const removeItem = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId))
  }

  // Complete sale with offline-first safety
  const completeSale = async (paymentMode: 'cash' | 'upi' | 'card') => {
    if (cart.length === 0 || loading) return
    
    setLoading(true)
    
    try {
      const invoiceData = {
        customerName: customer?.name || 'Cash Customer',
        customerPhone: customer?.phone || '',
        items: cart.map(item => ({
          itemCode: item.productCode,
          itemName: item.productName,
          qty: item.qty,
          rate: item.rate,
          amount: item.amount,
        })),
        subtotal,
        cgst,
        sgst,
        total,
        paymentMode,
      }
      
      // Use offline-safe creation
      const result = await createInvoice(invoiceData)
      
      if (result.success) {
        // Clear cart
        setCart([])
        setCustomer(null)
        setShowPaymentModal(false)
        
        // Update recent invoices
        setRecentInvoices(prev => [{
          id: result.invoiceId,
          amount: total,
          offline: result.offline,
          time: new Date(),
          paymentMode,
        }, ...prev.slice(0, 9)])
        
        setLastSale({ amount: total, offline: result.offline, time: new Date() })
        
        // Auto-clear success message after 3s
        setTimeout(() => setLastSale(null), 3000)
        
        // If online and has WhatsApp, open it
        if (!result.offline && result.whatsappLink) {
          window.open(result.whatsappLink, '_blank')
        }
      }
    } catch (error) {
      console.error('Sale failed:', error)
      alert('Failed to create invoice. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Filtered products
  const filteredProducts = products.filter(p => 
    p.itemName?.toLowerCase().includes(search.toLowerCase()) ||
    p.itemCode?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-[calc(100vh-140px)] lg:h-[calc(100vh-80px)] flex flex-col lg:flex-row gap-4">
      {/* Products Panel */}
      <div className="flex-1 lg:flex-[2] flex flex-col bg-white rounded-2xl overflow-hidden">
        {/* Search Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {filteredProducts.slice(0, 24).map(product => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="p-3 bg-white border border-gray-200 rounded-xl hover:border-primary hover:shadow-md transition-all text-left"
              >
                <div className="flex items-start gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Package className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <p className="text-xs font-medium text-gray-900 truncate">{product.itemName}</p>
                <p className="text-[10px] text-gray-400">{product.itemCode}</p>
                <p className="text-sm font-bold text-primary mt-1">₹{product.rate}</p>
              </button>
            ))}
          </div>
          
          {filteredProducts.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No products found</p>
              <p className="text-xs">Add products to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* Cart Panel */}
      <div className="lg:w-96 flex flex-col bg-white rounded-2xl overflow-hidden">
        {/* Status Bar */}
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <div className="flex items-center gap-1.5 text-green-600">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs font-medium">Online</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-600">
                <WifiOff className="w-3 h-3" />
                <span className="text-xs font-medium">Offline</span>
              </div>
            )}
          </div>
          
          {pendingCount > 0 && (
            <button 
              onClick={syncPendingInvoices}
              disabled={!isOnline || isSyncing}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Clock className="w-3 h-3" />
              {pendingCount} pending
              {isSyncing && <RefreshCw className="w-3 h-3 animate-spin" />}
            </button>
          )}
        </div>

        {/* Customer */}
        <div className="p-4 border-b border-gray-100">
          <button
            onClick={() => setShowCustomerModal(true)}
            className="w-full flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl hover:bg-gray-100 transition"
          >
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-gray-900">
                {customer?.name || 'Select Customer'}
              </p>
              <p className="text-xs text-gray-400">
                {customer?.phone || 'Tap to add'}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Success Message */}
        {lastSale && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`px-4 py-2 flex items-center gap-2 ${
              lastSale.offline ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
            }`}
          >
            {lastSale.offline ? (
              <Clock className="w-4 h-4" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">
              ₹{lastSale.amount} • {lastSale.offline ? 'Saved offline' : 'Invoice created'}
            </span>
          </motion.div>
        )}

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Cart is empty</p>
                <p className="text-xs">Tap products to add</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              <AnimatePresence>
                {cart.map(item => (
                  <motion.div
                    key={item.productId}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 p-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <p className="text-xs text-gray-400">₹{item.rate} × {item.qty}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQty(item.productId, -1)}
                        className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{item.qty}</span>
                      <button
                        onClick={() => updateQty(item.productId, 1)}
                        className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="w-16 text-right">
                      <p className="text-sm font-semibold">₹{item.amount}</p>
                    </div>
                    <button
                      onClick={() => removeItem(item.productId)}
                      className="p-1.5 text-gray-300 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="p-4 border-t border-gray-100 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-medium">₹{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">CGST (9%)</span>
            <span className="font-medium">₹{cgst.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">SGST (9%)</span>
            <span className="font-medium">₹{sgst.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold pt-2 border-t">
            <span>Total</span>
            <span className="text-primary">₹{total.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment Button */}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={() => setShowPaymentModal(true)}
            disabled={cart.length === 0 || loading}
            className="w-full py-3 bg-primary text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
                Complete Sale
              </>
            )}
          </button>
        </div>
      </div>

      {/* Customer Modal */}
      <AnimatePresence>
        {showCustomerModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCustomerModal(false)}
              className="fixed inset-0 bg-black/50 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl p-6 z-50"
            >
              <h3 className="text-lg font-semibold mb-4">Select Customer</h3>
              <input
                type="text"
                placeholder="Search by name or phone..."
                className="w-full p-3 bg-gray-50 rounded-xl mb-4"
                autoFocus
              />
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <button
                  onClick={() => { setCustomer({ name: 'Cash Customer', phone: '' }); setShowCustomerModal(false); }}
                  className="w-full p-3 text-left bg-gray-50 rounded-xl hover:bg-gray-100"
                >
                  <p className="font-medium">Cash Customer</p>
                  <p className="text-xs text-gray-400">Walk-in</p>
                </button>
              </div>
              <button
                onClick={() => setShowCustomerModal(false)}
                className="w-full mt-4 py-3 border border-gray-200 rounded-xl"
              >
                Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPaymentModal(false)}
              className="fixed inset-0 bg-black/50 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl p-6 z-50"
            >
              <h3 className="text-lg font-semibold mb-4">Payment Mode</h3>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => completeSale('cash')}
                  disabled={loading}
                  className="flex flex-col items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100"
                >
                  <Banknote className="w-8 h-8 text-green-600" />
                  <span className="text-sm font-medium">Cash</span>
                </button>
                <button
                  onClick={() => completeSale('upi')}
                  disabled={loading}
                  className="flex flex-col items-center gap-2 p-4 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100"
                >
                  <QrCode className="w-8 h-8 text-purple-600" />
                  <span className="text-sm font-medium">UPI</span>
                </button>
                <button
                  onClick={() => completeSale('card')}
                  disabled={loading}
                  className="flex flex-col items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100"
                >
                  <CreditCard className="w-8 h-8 text-blue-600" />
                  <span className="text-sm font-medium">Card</span>
                </button>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-full mt-4 py-3 border border-gray-200 rounded-xl"
              >
                Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}