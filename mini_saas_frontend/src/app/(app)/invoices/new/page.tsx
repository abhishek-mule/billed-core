'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Search, 
  Plus, 
  Save, 
  Send,
  User,
  Package,
  Trash2,
  WifiOff
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function NewInvoicePage() {
  const router = useRouter()
  const [customer, setCustomer] = useState('')
  const [items, setItems] = useState<{ id: string, name: string, qty: number, rate: number, tax: number }[]>([])
  const [isOffline, setIsOffline] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Simulate network status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    if (!navigator.onLine) setIsOffline(true)
      
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Auto-save draft
  useEffect(() => {
    if (customer || items.length > 0) {
      const timer = setTimeout(() => {
        // Save to IndexedDB/LocalStorage
        console.log('Draft auto-saved')
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [customer, items])

  const addItem = () => {
    setItems([...items, { id: Math.random().toString(), name: '', qty: 1, rate: 0, tax: 18 }])
  }

  const updateItem = (id: string, field: string, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id))
  }

  const subtotal = items.reduce((acc, item) => acc + (item.qty * item.rate), 0)
  const taxTotal = items.reduce((acc, item) => acc + (item.qty * item.rate * (item.tax / 100)), 0)
  const grandTotal = subtotal + taxTotal

  const handleSave = () => {
    if (isOffline) {
      alert('You are offline. Invoice queued for sync.')
      router.push('/dashboard')
    } else {
      // API call to save
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pl-20 lg:pl-64 animate-fade-in">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-all">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">New Invoice</h1>
            {isOffline ? (
              <span className="text-xs font-medium text-warning flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Offline (Draft)
              </span>
            ) : (
              <span className="text-xs font-medium text-success flex items-center gap-1">
                <Save className="w-3 h-3" /> Auto-saved
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="p-4 max-w-3xl mx-auto space-y-6">
        {/* Customer Selection */}
        <section className="card-base p-4 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <User className="w-4 h-4" /> Customer Details
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search or add customer..." 
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="input-base pl-9"
            />
          </div>
        </section>

        {/* Items List */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Package className="w-4 h-4" /> Items
            </h2>
          </div>
          
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.id} className="card-base p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <input 
                    type="text" 
                    placeholder="Item name" 
                    value={item.name}
                    onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                    className="input-base border-none shadow-none px-0 text-base font-semibold focus-visible:ring-0 placeholder:text-muted-foreground/50"
                  />
                  <button onClick={() => removeItem(item.id)} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Qty</label>
                    <input 
                      type="number" 
                      value={item.qty}
                      onChange={(e) => updateItem(item.id, 'qty', Number(e.target.value))}
                      className="input-base"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Rate (₹)</label>
                    <input 
                      type="number" 
                      value={item.rate}
                      onChange={(e) => updateItem(item.id, 'rate', Number(e.target.value))}
                      className="input-base"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Tax (%)</label>
                    <select 
                      value={item.tax}
                      onChange={(e) => updateItem(item.id, 'tax', Number(e.target.value))}
                      className="input-base"
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

            <button 
              onClick={addItem}
              className="w-full py-4 border-2 border-dashed border-border rounded-xl text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Item
            </button>
          </div>
        </section>

        {/* Totals */}
        <section className="card-base p-4 space-y-3">
          <div className="flex justify-between text-sm font-medium text-muted-foreground">
            <span>Subtotal</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-medium text-muted-foreground">
            <span>Tax (Auto-calculated)</span>
            <span>₹{taxTotal.toFixed(2)}</span>
          </div>
          <div className="h-px bg-border my-2" />
          <div className="flex justify-between items-center text-lg font-bold text-foreground">
            <span>Total Amount</span>
            <span>₹{grandTotal.toFixed(2)}</span>
          </div>
        </section>
      </div>

      {/* Action Bar (Sticky Bottom) */}
      <div className="fixed bottom-0 left-0 right-0 md:left-20 lg:left-64 p-4 bg-background border-t border-border z-40 pb-safe">
        <div className="max-w-3xl mx-auto flex gap-3">
          <button 
            onClick={handleSave}
            className="flex-1 btn-base py-3.5 bg-primary text-primary-foreground shadow-elegant text-base"
          >
            {isOffline ? 'Queue for Sync' : 'Save & Generate'}
          </button>
          <button className="w-14 btn-base bg-secondary text-secondary-foreground">
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
