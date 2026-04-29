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
  CheckCircle2,
  RefreshCw,
  Package
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useProducts, useCreateInvoice } from '@/hooks/useApi'
import { formatINR } from '@/lib/api-client'
import { ProductCardSkeleton } from '@/components/ui/Skeleton'

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
  
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)

  // Fetch quick access products (Top Selling / Favorites placeholder)
  const { data: topProductsData, isLoading: topProductsLoading } = useProducts('', 1, 8)
  const topProducts = topProductsData?.data || []

  const createInvoice = useCreateInvoice()

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
        const res = await fetch(`/api/merchant/products?search=${encodeURIComponent(searchQuery)}&limit=8`)
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
        const res = await fetch(`/api/merchant/customers?q=${encodeURIComponent(customerQuery)}&limit=5`)
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
    if (cart.length === 0) return
    
    const idempotencyKey = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`

    createInvoice.mutate({
      customerName: selectedCustomer?.name || 'Walk-in Customer',
      customerPhone: selectedCustomer?.phone || '0000000000',
      items: cart.map(item => ({
        itemCode: item.id, // Ensure we send the actual ID or item_code
        itemName: item.name,
        quantity: item.quantity,
        rate: item.price
      }))
    }, {
      onSuccess: (data) => {
        if (data.success) {
          setCart([])
          setSelectedCustomer(null)
          if (data.whatsappLink) {
             window.open(data.whatsappLink, '_blank')
          }
        } else {
          alert(data.error || 'Checkout failed')
        }
      },
      onError: (error) => {
        alert(error.message || 'Checkout failed')
      }
    })
  }

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0)
  const taxTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity * item.gst / 100), 0)
  const total = subtotal + taxTotal

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col lg:flex-row gap-6 animate-in slide-in-from-right-2 px-4 lg:px-8 max-w-[1600px] mx-auto py-4 w-full">
      
      {/* Left Column: Product Selection */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden min-w-[50%]">
        
        {/* Top Search Bar */}
        <div className="bg-card p-4 rounded-2xl border border-border shadow-sm space-y-4 relative z-50">
          <div className="relative group w-full">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input 
              ref={searchRef}
              type="text" 
              placeholder="Search Products or Scan Barcode..." 
              className="w-full bg-background border border-input rounded-xl pl-12 pr-4 py-3.5 text-sm font-semibold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {isSearching && (
              <RefreshCw className="absolute right-4 top-3.5 w-5 h-5 text-primary animate-spin" />
            )}
          </div>
          
          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-[80px] left-4 right-4 bg-card rounded-xl shadow-elegant border border-border overflow-hidden divide-y divide-border z-[100]">
               {searchResults.map((prd) => (
                 <button 
                  key={prd.id} 
                  onClick={() => addToCart(prd)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                 >
                    <div className="text-left">
                       <p className="text-sm font-semibold text-foreground">{prd.itemName}</p>
                       <p className="text-[10px] text-muted-foreground font-bold uppercase">Stock: {prd.stock} units</p>
                    </div>
                    <div className="text-right">
                       <p className="text-sm font-bold text-primary">{formatINR(prd.rate)}</p>
                       <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest">Add to Cart</p>
                    </div>
                 </button>
               ))}
            </div>
          )}
        </div>

        {/* Categories / Quick Actions */}
        <div className="flex-1 bg-card rounded-2xl border border-border shadow-sm p-6 overflow-y-auto custom-scrollbar relative z-10">
           <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground tracking-tight">Quick Add</h3>
              <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                 <Zap className="w-4 h-4 text-warning fill-warning" />
                 Recent / Top
              </div>
           </div>
           
           <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {topProductsLoading ? (
                <>
                  <ProductCardSkeleton />
                  <ProductCardSkeleton />
                  <ProductCardSkeleton />
                  <ProductCardSkeleton />
                </>
              ) : topProducts.length === 0 ? (
                <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                  No products added yet. Add products to see them here.
                </div>
              ) : topProducts.map((prd: any) => (
                <button 
                  key={prd.id}
                  onClick={() => addToCart({ id: prd.id, itemName: prd.itemName, rate: prd.rate, gstRate: prd.gstRate, stock: prd.stock })}
                  className="bg-background border border-border p-5 rounded-xl flex flex-col items-center text-center gap-3 hover:border-primary/50 hover:shadow-md transition-all group"
                >
                  <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground line-clamp-1">{prd.itemName}</p>
                    <p className="text-[10px] font-bold text-muted-foreground mt-1">{formatINR(prd.rate)}</p>
                  </div>
                </button>
              ))}
           </div>
        </div>
      </div>

      {/* Right Column: Checkout */}
      <div className="w-full lg:w-[420px] bg-sidebar rounded-2xl shadow-elegant flex flex-col overflow-hidden text-sidebar-foreground border border-sidebar-border z-20">
        
        {/* Customer Info */}
        <div className="p-6 border-b border-sidebar-border relative">
           <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-sidebar-foreground/70 uppercase tracking-widest">Customer Focus</span>
              {selectedCustomer && (
                <button onClick={() => setSelectedCustomer(null)} className="text-[10px] text-destructive font-bold uppercase hover:underline">Clear</button>
              )}
           </div>
           <div className="relative group">
              <User className={`absolute left-4 top-3.5 w-4 h-4 transition-colors ${selectedCustomer ? 'text-success' : 'text-sidebar-foreground/50 group-focus-within:text-sidebar-foreground'}`} />
              <input 
                type="text" 
                placeholder={selectedCustomer ? selectedCustomer.name : "Search Name or Phone..."} 
                className={`w-full bg-sidebar-accent border border-sidebar-border rounded-xl pl-11 pr-4 py-3 text-sm font-semibold text-sidebar-foreground focus:outline-none focus:border-sidebar-ring transition-all ${selectedCustomer ? 'border-success' : ''}`}
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                disabled={!!selectedCustomer}
              />
           </div>

           {/* Customer Results */}
           {customerResults.length > 0 && (
             <div className="absolute z-[100] left-6 right-6 top-[100px] bg-sidebar rounded-xl border border-sidebar-border shadow-elegant overflow-hidden divide-y divide-sidebar-border">
                {customerResults.map((cust) => (
                  <button 
                    key={cust.id} 
                    onClick={() => { setSelectedCustomer(cust); setCustomerResults([]); setCustomerQuery('') }}
                    className="w-full px-4 py-3 text-left hover:bg-sidebar-accent transition-colors"
                  >
                     <p className="text-xs font-bold text-sidebar-foreground">{cust.name}</p>
                     <p className="text-[9px] text-sidebar-foreground/70 font-semibold mt-0.5">{cust.phone}</p>
                  </button>
                ))}
             </div>
           )}
        </div>

        {/* Cart List */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-4">
           <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                 <ShoppingCart className="w-5 h-5 text-sidebar-foreground/70" />
                 <h4 className="font-semibold tracking-tight">Current Cart</h4>
              </div>
              <span className="bg-sidebar-accent text-sidebar-foreground px-3 py-1 rounded-full text-[10px] font-bold">{cart.length} ITEMS</span>
           </div>

           {cart.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-sidebar-foreground/40 gap-4 py-10">
                <ShoppingCart className="w-12 h-12" />
                <p className="text-xs font-medium text-center">Empty Cart.<br/>Scan or search items to begin.</p>
             </div>
           ) : (
             <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-sidebar-accent/50 border border-sidebar-border">
                     <div className="flex-1 pr-2">
                        <p className="text-sm font-semibold text-sidebar-foreground line-clamp-1">{item.name}</p>
                        <p className="text-[10px] text-sidebar-foreground/70 font-medium mt-1">{formatINR(item.price)} x {item.quantity}</p>
                     </div>
                     <div className="flex items-center gap-3">
                        <div className="flex items-center bg-sidebar rounded-lg border border-sidebar-border p-0.5">
                           <button onClick={() => updateQty(item.id, -1)} className="p-1 hover:bg-sidebar-accent rounded-md"><Minus className="w-3 h-3" /></button>
                           <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                           <button onClick={() => updateQty(item.id, 1)} className="p-1 hover:bg-sidebar-accent rounded-md"><Plus className="w-3 h-3" /></button>
                        </div>
                        <button 
                          onClick={() => setCart(cart.filter(i => i.id !== item.id))}
                          className="p-1.5 text-sidebar-foreground/50 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
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
        <div className="p-6 bg-sidebar-accent border-t border-sidebar-border space-y-6">
           <div className="space-y-3">
              <div className="flex justify-between items-end">
                 <span className="text-xs font-bold uppercase tracking-widest text-sidebar-foreground/70">Total</span>
                 <span className="text-3xl font-bold tracking-tight text-sidebar-foreground">{formatINR(total)}</span>
              </div>
           </div>

           <div className="grid grid-cols-3 gap-2">
              {['Cash', 'UPI', 'Card'].map((mode) => (
                <button 
                  key={mode}
                  onClick={() => setPaymentMode(mode as any)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all border ${
                    paymentMode === mode 
                    ? 'bg-primary text-primary-foreground border-primary shadow-glow' 
                    : 'bg-sidebar text-sidebar-foreground border-sidebar-border hover:bg-sidebar/80'
                  }`}
                >
                   {mode === 'Cash' ? <Banknote className="w-4 h-4" /> : mode === 'UPI' ? <Wallet className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                   <span className="text-[10px] font-bold uppercase tracking-widest">{mode}</span>
                </button>
              ))}
           </div>

           <button 
            disabled={createInvoice.isPending || cart.length === 0}
            onClick={handleCheckout}
            className="w-full bg-success text-success-foreground py-4 rounded-xl font-bold text-sm uppercase tracking-widest shadow-success hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
           >
              {createInvoice.isPending ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Complete Bill
           </button>
        </div>

      </div>
    </div>
  )
}
