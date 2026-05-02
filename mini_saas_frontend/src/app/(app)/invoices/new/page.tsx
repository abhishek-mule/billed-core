'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Search, 
  Plus, 
  Trash2, 
  Send, 
  Save, 
  User, 
  Package, 
  IndianRupee,
  Check,
  ChevronDown,
  Zap,
  CreditCard,
  Banknote,
  Smartphone,
  Store
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { BarcodeScanner } from '@/components/scanner/BarcodeScanner'
import { toast } from 'sonner'

interface Item {
  id: string
  name: string
  qty: number
  price: number
  taxRate: number
}

export default function NewInvoicePage() {
  const router = useRouter()
  const { enqueue, isOnline } = useOfflineQueue()

  // Form State
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [items, setItems] = useState<Item[]>([{ id: '1', name: '', qty: 1, price: 0, taxRate: 18 }])
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'BANK'>('CASH')
  const [isCreating, setIsCreating] = useState(false)
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false)

  const [isScannerOpen, setIsScannerOpen] = useState(false)

  // Check if first-time setup needed
  useEffect(() => {
    const isFirstTime = localStorage.getItem('billzo_onboarded') === 'false'
    if (isFirstTime) {
      setNeedsProfileSetup(true)
    }
  }, [])

  // Handle Barcode Scan
  const handleBarcodeScan = async (code: string) => {
    setIsScannerOpen(false)
    toast.loading('Searching Product...', { id: 'barcode-scan' })
    
    try {
      const res = await fetch(`/api/merchant/products?search=${code}`)
      const json = await res.json()
      
      if (json.success && json.data.length > 0) {
        quickAddItem(json.data[0])
        toast.success(`Added ${json.data[0].itemName}`, { id: 'barcode-scan' })
      } else {
        toast.error('Product not found for this barcode', { id: 'barcode-scan' })
      }
    } catch (e) {
      toast.error('Scan failed', { id: 'barcode-scan' })
    }
  }

  // Suggestions (Real Data)
  const [customerSuggestions, setCustomerSuggestions] = useState<string[]>([])
  const [availableProducts, setAvailableProducts] = useState<any[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)

  // Fetch Products for Quick Add
  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoadingProducts(true)
      try {
        const res = await fetch('/api/merchant/products?limit=12')
        const json = await res.json()
        if (json.success) setAvailableProducts(json.data)
      } catch (e) {
        console.error('Failed to load products', e)
      } finally {
        setIsLoadingProducts(false)
      }
    }
    fetchProducts()
  }, [])

  // Quick Add Item
  const quickAddItem = (product: any) => {
    // Check if item already exists
    const existingIndex = items.findIndex(i => i.id === product.id || i.name === product.itemName)
    
    if (existingIndex > -1) {
      updateItem(items[existingIndex].id, { qty: items[existingIndex].qty + 1 })
    } else {
      // Add as new item, but if the first empty row exists, replace it
      if (items.length === 1 && !items[0].name) {
        updateItem(items[0].id, { 
          id: product.id, 
          name: product.itemName, 
          price: product.rate, 
          taxRate: product.gstRate || 18 
        })
      } else {
        setItems([...items, { 
          id: product.id, 
          name: product.itemName, 
          qty: 1, 
          price: product.rate, 
          taxRate: product.gstRate || 18 
        }])
      }
    }
  }

  // Calculations
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + (item.qty * item.price), 0), [items])
  const taxTotal = useMemo(() => items.reduce((sum, item) => sum + (item.qty * item.price * (item.taxRate / 100)), 0), [items])
  const grandTotal = subtotal + taxTotal

  // Actions
  const addItem = () => {
    setItems([...items, { id: Math.random().toString(36).slice(2, 9), name: '', qty: 1, price: 0, taxRate: 18 }])
  }

  const removeItem = (id: string) => {
    if (items.length === 1) return
    setItems(items.filter(item => item.id !== id))
  }

  const updateItem = (id: string, updates: Partial<Item>) => {
    setItems(items.map(item => item.id === id ? { ...item, ...updates } : item))
  }

  const handleCreate = async (sendNow = false) => {
    if (needsProfileSetup && !businessName) return toast.error('Please enter your Business Name')
    if (!customerName) return toast.error('Please enter customer name')
    if (items.some(i => !i.name || i.price <= 0)) return toast.error('Please fill all item details')

    setIsCreating(true)
    
    // Generate a unique idempotency key
    const idempotencyKey = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    const invoiceData = {
      customerName,
      customerPhone,
      businessName,
      items: items.map(item => ({
        itemCode: item.id.startsWith('ITEM') ? item.id : 'CUSTOM',
        itemName: item.name,
        quantity: item.qty,
        rate: item.price,
        taxRate: item.taxRate
      })),
      paymentMode,
      notes: ''
    }

    try {
      const res = await fetch('/api/merchant/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': idempotencyKey
        },
        body: JSON.stringify(invoiceData)
      })

      const json = await res.json()

      if (json.success) {
        toast.success(`Invoice ${json.invoiceNumber} Created!`)
        localStorage.setItem('billzo_onboarded', 'true')
        
        if (sendNow && json.whatsappLink) {
           window.open(json.whatsappLink, '_blank')
        }
        
        router.push(`/invoices/${json.invoiceId}`)
      } else {
        throw new Error(json.error || 'Failed to create invoice')
      }
    } catch (error: any) {
      console.error('Failed to create invoice:', error)
      toast.error(error.message || 'Failed to save invoice')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-32 animate-fade-in md:pl-20 lg:pl-64">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border h-16 flex items-center px-4 justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-all">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-base font-black tracking-tight text-foreground leading-none">CREATE INVOICE</h1>
            <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest">Auto-saving Draft</p>
          </div>
        </div>
        {!isOnline && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-warning/10 text-warning rounded-full border border-warning/20">
            <div className="w-1 h-1 rounded-full bg-warning animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-tighter">Offline</span>
          </div>
        )}
      </header>

      <div className="p-4 max-w-2xl mx-auto space-y-6">
        {/* 0. Progressive Setup: Business Name */}
        {needsProfileSetup && (
          <section className="space-y-3 animate-in fade-in slide-in-from-top duration-500">
            <div className="flex items-center gap-2 px-1">
              <Zap className="w-4 h-4 text-primary fill-primary" />
              <h2 className="text-xs font-bold text-primary uppercase tracking-widest">Complete Your Profile</h2>
            </div>
            <div className="card-base p-4 bg-primary/5 border-primary/20 space-y-4">
              <div className="relative group">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                <input 
                  type="text" 
                  placeholder="Your Business Name (e.g. Sharma Electronics)" 
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="input-base pl-10 bg-white/50 border-primary/20 focus-visible:ring-primary/30 text-base font-black placeholder:font-medium text-primary"
                  autoFocus
                />
              </div>
              <p className="text-[10px] font-bold text-primary/60 px-1 uppercase tracking-tight">Required only once for your first invoice.</p>
            </div>
          </section>
        )}

        {/* 1. Quick Add Products (Real Data) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Quick Add</h2>
            <div className="flex items-center gap-4">
               <button 
                 onClick={() => setIsScannerOpen(true)}
                 className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1.5"
               >
                 <Scan className="w-3 h-3" /> Barcode
               </button>
               <span className="text-[9px] font-bold text-success uppercase tracking-widest">In Stock</span>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x">
            {isLoadingProducts ? (
              [1, 2, 3].map(i => (
                <div key={i} className="flex-shrink-0 w-32 h-24 bg-muted animate-pulse rounded-2xl" />
              ))
            ) : availableProducts.length > 0 ? (
              availableProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => quickAddItem(p)}
                  className="flex-shrink-0 w-36 p-4 rounded-2xl bg-card border border-border/50 shadow-sm active:scale-95 transition-all snap-start hover:border-primary/30 text-left relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus className="w-3 h-3 text-primary" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-tight text-foreground line-clamp-1">{p.itemName}</p>
                  <p className="text-sm font-black tracking-tighter mt-1 text-primary">₹{p.rate}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <div className={cn("w-1 h-1 rounded-full", p.stock > 5 ? "bg-success" : "bg-warning")} />
                    <p className="text-[8px] font-bold text-muted-foreground uppercase">{p.stock} Left</p>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-[10px] font-bold text-muted-foreground italic px-1 uppercase tracking-widest py-4">No products found. Add them in Inventory.</p>
            )}
          </div>
        </section>

        {/* 2. Customer Details */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Customer Info</h2>
          <div className="card-base p-4 space-y-4 bg-card/50 backdrop-blur-sm border-border/50">
            <div className="relative group">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input 
                type="text" 
                placeholder="Customer Name (Auto-creates new)" 
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="input-base pl-10 bg-transparent border-none focus-visible:ring-0 text-base font-bold placeholder:font-medium"
              />
            </div>
            <div className="h-px bg-border/50" />
            <div className="relative group">
              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input 
                type="tel" 
                placeholder="Phone Number (for WhatsApp/SMS)" 
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="input-base pl-10 bg-transparent border-none focus-visible:ring-0 text-base font-bold placeholder:font-medium"
              />
            </div>
          </div>
        </section>

        {/* 2. Items List */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Items & Pricing</h2>
            <button 
              onClick={addItem}
              className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1 hover:underline"
            >
              <Plus className="w-3 h-3" /> Add Row
            </button>
          </div>
          
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.id} className="card-base p-4 bg-card/50 backdrop-blur-sm border-border/50 space-y-4 animate-in slide-in-from-right duration-300" style={{ animationDelay: `${index * 50}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <input 
                      type="text" 
                      placeholder="Item Name (Suggests products)" 
                      value={item.name}
                      onChange={(e) => updateItem(item.id, { name: e.target.value })}
                      className="w-full bg-transparent border-none focus-visible:ring-0 text-base font-black p-0 placeholder:font-medium placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <button onClick={() => removeItem(item.id)} className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter mb-1.5 block">Quantity</label>
                    <div className="flex items-center bg-muted/30 rounded-lg p-1">
                      <button onClick={() => updateItem(item.id, { qty: Math.max(1, item.qty - 1) })} className="w-8 h-8 flex items-center justify-center font-bold">-</button>
                      <input 
                        type="number" 
                        value={item.qty}
                        onChange={(e) => updateItem(item.id, { qty: parseInt(e.target.value) || 1 })}
                        className="w-full bg-transparent border-none focus-visible:ring-0 text-center font-black p-0"
                      />
                      <button onClick={() => updateItem(item.id, { qty: item.qty + 1 })} className="w-8 h-8 flex items-center justify-center font-bold">+</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter mb-1.5 block">Rate (₹)</label>
                    <input 
                      type="number" 
                      value={item.price}
                      onChange={(e) => updateItem(item.id, { price: parseFloat(e.target.value) || 0 })}
                      className="input-base bg-muted/30 border-none font-black text-center h-10"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter mb-1.5 block">GST (%)</label>
                    <select 
                      value={item.taxRate}
                      onChange={(e) => updateItem(item.id, { taxRate: parseInt(e.target.value) })}
                      className="input-base bg-muted/30 border-none font-black text-center h-10 appearance-none"
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Totals Summary */}
        <section className="card-base p-6 bg-primary/5 border-primary/20 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-muted-foreground uppercase tracking-widest">
              <span>Subtotal</span>
              <span className="text-foreground">₹{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-muted-foreground uppercase tracking-widest">
              <span>GST (Auto)</span>
              <span className="text-success">₹{taxTotal.toLocaleString()}</span>
            </div>
          </div>
          <div className="h-px bg-primary/10" />
          <div className="flex justify-between items-center">
            <span className="text-sm font-black text-primary uppercase tracking-tighter">Grand Total</span>
            <span className="text-3xl font-black tracking-tighter text-primary">₹{grandTotal.toLocaleString()}</span>
          </div>
        </section>

        {/* 4. Payment Options */}
        <section className="space-y-3 pb-12">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Collection Mode</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'CASH', label: 'Cash', icon: Banknote },
              { id: 'UPI', label: 'UPI / Scan', icon: Smartphone },
              { id: 'BANK', label: 'Bank', icon: CreditCard },
            ].map((mode) => {
              const Icon = mode.icon
              const isSelected = paymentMode === mode.id
              return (
                <button
                  key={mode.id}
                  onClick={() => setPaymentMode(mode.id as any)}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all active:scale-95",
                    isSelected 
                      ? "bg-primary text-primary-foreground border-primary shadow-glow" 
                      : "bg-card border-border/50 text-muted-foreground hover:border-primary/30"
                  )}
                >
                  <Icon className="w-5 h-5 mb-2" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{mode.label}</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      {/* Barcode Scanner Modal */}
      <BarcodeScanner 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScan={handleBarcodeScan} 
      />

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-20 lg:left-64 p-4 bg-background/80 backdrop-blur-xl border-t border-border z-50 pb-safe">
        <div className="max-w-2xl mx-auto flex gap-3">
          <button 
            disabled={isCreating}
            onClick={() => handleCreate(true)}
            className="flex-1 btn-base py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest shadow-glow active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {isCreating ? 'Processing...' : (
              <>
                <Zap className="w-5 h-5 fill-current" />
                Create & Send
              </>
            )}
          </button>
          <button 
            disabled={isCreating}
            onClick={() => handleCreate(false)}
            className="px-6 btn-base py-4 bg-secondary text-secondary-foreground font-black uppercase tracking-widest active:scale-[0.98] disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
