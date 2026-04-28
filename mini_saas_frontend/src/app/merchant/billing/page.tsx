'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  Search, 
  ShoppingCart, 
  User, 
  X, 
  Plus, 
  Minus, 
  Trash2, 
  Zap, 
  CreditCard, 
  Wallet, 
  Banknote,
  Printer,
  ChevronRight,
  Maximize2,
  Scan,
  Package,
  History,
  CheckCircle2,
  AlertCircle,
  RefreshCw
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

// --- Types ---
interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
  gst: number
}

interface Product {
  id: string
  itemName: string
  rate: number
  gstRate: number
  stock: number
}

interface Customer {
  id: string
  name: string
  phone: string
}

export default function BillingPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [isSearching, setIsSearching] = useState(false)
  
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Card'>('Cash')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)

  // Auto-focus search on load
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // Product Search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(`/api/merchant/products?search=${searchQuery}&limit=8`)
        const json = await res.json()
        if (json.success) setSearchResults(json.data)
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Customer Search
  useEffect(() => {
    if (customerQuery.length < 3) {
      setCustomerResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/merchant/customers?search=${customerQuery}&limit=5`)
        const json = await res.json()
        if (json.success) setCustomerResults(json.data)
      } catch (err) {}
    }, 300)
    return () => clearTimeout(timer)
  }, [customerQuery])

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id)
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
    } else {
      setCart([...cart, { 
        id: product.id, 
        name: product.itemName, 
        price: product.rate, 
        quantity: 1, 
        gst: product.gstRate 
      }])
    }
    setSearchQuery('')
    setSearchResults([])
    toast.success(`${product.itemName} added`)
  }

  const updateQty = (id: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta)
        return { ...item, quantity: newQty }
      }
      return item
    }))
  }

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty')
      return
    }
    
    setIsSubmitting(true)
    const idempotencyKey = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`

    try {
      const res = await fetch('/api/merchant/invoices', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-idempotency-key': idempotencyKey
        },
        body: JSON.stringify({
          customerName: selectedCustomer?.name || 'Walk-in Customer',
          customerPhone: selectedCustomer?.phone || '0000000000',
          items: cart.map(item => ({
            itemCode: item.id,
            itemName: item.name,
            quantity: item.quantity,
            rate: item.price
          }))
        })
      })

      const json = await res.json()
      if (json.success) {
        toast.success('Invoice Created Successfully!')
        setCart([])
        setSelectedCustomer(null)
        if (json.whatsappLink) {
           window.open(json.whatsappLink, '_blank')
        }
      } else {
        toast.error(json.error || 'Checkout failed')
      }
    } catch (err) {
      toast.error('Network error during checkout')
    } finally {
      setIsSubmitting(false)
    }
  }

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0)
  const taxTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity * item.gst / 100), 0)
  const total = subtotal + taxTotal

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col lg:flex-row gap-6 animate-in">
      
      {/* Left Column: Product Selection */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        
        {/* Top Search Bar */}
        <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
          <div className="relative group w-full">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              ref={searchRef}
              type="text" 
              placeholder="Search Products or Scan Barcode..." 
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:outline-none ring-4 ring-indigo-500/0 focus:ring-indigo-500/5 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {isSearching && (
              <RefreshCw className="absolute right-4 top-3.5 w-5 h-5 text-indigo-500 animate-spin" />
            )}
          </div>
          
          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute z-50 mt-1 w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
               {searchResults.map((prd) => (
                 <button 
                  key={prd.id} 
                  onClick={() => addToCart(prd)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                 >
                    <div className="text-left">
                       <p className="text-sm font-black text-slate-900">{prd.itemName}</p>
                       <p className="text-[10px] text-slate-400 font-bold uppercase">Stock: {prd.stock} units</p>
                    </div>
                    <div className="text-right">
                       <p className="text-sm font-black text-indigo-600">₹{prd.rate}</p>
                       <p className="text-[9px] text-slate-300 font-black uppercase tracking-widest">Add to Cart</p>
                    </div>
                 </button>
               ))}
            </div>
          )}
        </div>

        {/* Categories / Quick Actions */}
        <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 overflow-y-auto custom-scrollbar">
           <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">System Favorites</h3>
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                 <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                 Top Selling
              </div>
           </div>
           
           <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {[
                { id: '1', name: 'LG 32" Smart TV', price: 18500, gst: 18, icon: '📺' },
                { id: '2', name: 'Samsung S23', price: 95000, gst: 12, icon: '📱' },
                { id: '3', name: 'Syska LED Bulb', price: 99, gst: 12, icon: '💡' },
                { id: '4', name: 'Bajaj Fan', price: 2150, gst: 18, icon: '🌀' },
              ].map((prd) => (
                <button 
                  key={prd.id}
                  onClick={() => addToCart({ id: prd.id, itemName: prd.name, rate: prd.price, gstRate: prd.gst, stock: 10 } as any)}
                  className="bg-slate-50 border border-slate-100 p-5 rounded-3xl flex flex-col items-center text-center gap-3 hover:bg-indigo-50 hover:border-indigo-100 transition-all group"
                >
                  <span className="text-3xl group-hover:scale-125 transition-transform">{prd.icon}</span>
                  <div>
                    <p className="text-xs font-black text-slate-900 line-clamp-1">{prd.name}</p>
                    <p className="text-[10px] font-bold text-slate-400">₹{prd.price}</p>
                  </div>
                </button>
              ))}
           </div>
        </div>
      </div>

      {/* Right Column: Checkout */}
      <div className="w-full lg:w-[450px] bg-slate-900 rounded-[3rem] shadow-2xl flex flex-col overflow-hidden text-white">
        
        {/* Customer Info */}
        <div className="p-8 border-b border-white/5 bg-white/5 relative">
           <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Customer Focus</span>
              {selectedCustomer && (
                <button onClick={() => setSelectedCustomer(null)} className="text-[10px] text-rose-400 font-black uppercase">Clear</button>
              )}
           </div>
           <div className="relative group">
              <User className={`absolute left-4 top-3 w-4 h-4 transition-colors ${selectedCustomer ? 'text-emerald-400' : 'text-slate-500 group-focus-within:text-indigo-400'}`} />
              <input 
                type="text" 
                placeholder={selectedCustomer ? selectedCustomer.name : "Search Name or Phone..."} 
                className={`w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm font-bold text-white focus:outline-none focus:bg-white/10 transition-all ${selectedCustomer ? 'border-emerald-500/50' : ''}`}
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                disabled={!!selectedCustomer}
              />
           </div>

           {/* Customer Results */}
           {customerResults.length > 0 && (
             <div className="absolute z-50 left-8 right-8 mt-1 bg-slate-800 rounded-xl border border-white/10 shadow-2xl overflow-hidden divide-y divide-white/5">
                {customerResults.map((cust) => (
                  <button 
                    key={cust.id} 
                    onClick={() => { setSelectedCustomer(cust); setCustomerResults([]); setCustomerQuery('') }}
                    className="w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors"
                  >
                     <p className="text-xs font-black">{cust.name}</p>
                     <p className="text-[9px] text-slate-400 font-bold">{cust.phone}</p>
                  </button>
                ))}
             </div>
           )}
        </div>

        {/* Cart List */}
        <div className="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-6">
           <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                 <ShoppingCart className="w-5 h-5 text-indigo-400" />
                 <h4 className="font-black tracking-tight">Current Cart</h4>
              </div>
              <span className="bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full text-[10px] font-black">{cart.length} ITEMS</span>
           </div>

           {cart.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 py-10 opacity-50">
                <Package className="w-12 h-12" />
                <p className="text-xs font-bold italic text-center">Empty Cart.<br/>Add items to begin.</p>
             </div>
           ) : (
             <div className="space-y-4">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between group animate-in slide-in-from-right-2">
                     <div className="flex-1">
                        <p className="text-sm font-black text-white">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold">₹{item.price} x {item.quantity}</p>
                     </div>
                     <div className="flex items-center gap-4">
                        <div className="flex items-center bg-white/5 rounded-xl border border-white/10 p-1">
                           <button onClick={() => updateQty(item.id, -1)} className="p-1 hover:bg-white/10 rounded-lg"><Minus className="w-3 h-3" /></button>
                           <span className="w-8 text-center text-xs font-black">{item.quantity}</span>
                           <button onClick={() => updateQty(item.id, 1)} className="p-1 hover:bg-white/10 rounded-lg"><Plus className="w-3 h-3" /></button>
                        </div>
                        <button 
                          onClick={() => setCart(cart.filter(i => i.id !== item.id))}
                          className="p-2 text-slate-500 hover:text-rose-500 transition-colors"
                        >
                           <Trash2 className="w-4 h-4" />
                        </button>
                     </div>
                  </div>
                ))}
             </div>
           )}
        </div>

        {/* Summary & Checkout */}
        <div className="p-10 bg-indigo-600 rounded-t-[4rem] space-y-8 shadow-[0_-20px_40px_rgba(79,70,229,0.2)]">
           <div className="space-y-3">
              <div className="flex justify-between items-end pt-2">
                 <span className="text-lg font-black uppercase tracking-widest text-indigo-100">Payable Amount</span>
                 <span className="text-4xl font-black tracking-tighter">₹{total.toFixed(0)}</span>
              </div>
           </div>

           <div className="grid grid-cols-3 gap-3">
              {['Cash', 'UPI', 'Card'].map((mode) => (
                <button 
                  key={mode}
                  onClick={() => setPaymentMode(mode as any)}
                  className={`flex flex-col items-center gap-2 py-4 rounded-3xl transition-all border ${
                    paymentMode === mode 
                    ? 'bg-white text-indigo-600 border-white shadow-xl' 
                    : 'bg-indigo-500/30 text-white border-white/10 hover:bg-indigo-500/50'
                  }`}
                >
                   {mode === 'Cash' ? <Banknote className="w-5 h-5" /> : mode === 'UPI' ? <Wallet className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                   <span className="text-[10px] font-black uppercase tracking-widest">{mode}</span>
                </button>
              ))}
           </div>

           <button 
            disabled={isSubmitting || cart.length === 0}
            onClick={handleCheckout}
            className="w-full bg-white text-indigo-600 py-6 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50 disabled:scale-100"
           >
              {isSubmitting ? <RefreshCw className="w-6 h-6 animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
              Complete Bill
           </button>
        </div>

      </div>
    </div>
  )
}
