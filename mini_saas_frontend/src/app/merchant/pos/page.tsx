'use client'

import { type ReactNode, useMemo, useState } from 'react'
import { CheckCircle2, Minus, Plus, Printer, Search, Trash2, User, X, ScanBarcode, Zap } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { BarcodeScanner } from '@/components/scanner/BarcodeScanner'
import { OCRScanner } from '@/components/scanner/OCRScanner'
import { SmartSearch } from '@/components/search/SmartSearch'

type Product = {
  id: string
  name: string
  price: number
  stock: number
  unit: string
  hsn?: string
  gst: number
}

type CartItem = Product & { qty: number }

const mockProducts: Product[] = [
  { id: 'p1', name: 'Parle-G Biscuit 100g', price: 10, stock: 142, unit: 'pc', hsn: '1905', gst: 5 },
  { id: 'p2', name: 'Amul Milk 500ml', price: 32, stock: 56, unit: 'pc', hsn: '0401', gst: 0 },
  { id: 'p3', name: 'Tata Salt 1kg', price: 28, stock: 78, unit: 'pc', hsn: '2501', gst: 5 },
  { id: 'p4', name: 'Surf Excel 1kg', price: 245, stock: 22, unit: 'pc', hsn: '3402', gst: 18 },
  { id: 'p5', name: 'Maggi 70g', price: 14, stock: 220, unit: 'pc', hsn: '1902', gst: 12 },
  { id: 'p6', name: 'Coca Cola 750ml', price: 40, stock: 48, unit: 'pc', hsn: '2202', gst: 28 },
  { id: 'p7', name: 'Britannia Bread', price: 50, stock: 18, unit: 'pc', hsn: '1905', gst: 5 },
  { id: 'p8', name: 'Aashirvaad Atta 5kg', price: 285, stock: 12, unit: 'pc', hsn: '1101', gst: 5 },
  { id: 'p9', name: 'Colgate Toothpaste', price: 95, stock: 34, unit: 'pc', hsn: '3306', gst: 18 },
  { id: 'p10', name: 'Haldiram Bhujia 200g', price: 70, stock: 60, unit: 'pc', hsn: '2106', gst: 12 },
  { id: 'p11', name: 'Dettol Soap 75g', price: 38, stock: 88, unit: 'pc', hsn: '3401', gst: 18 },
  { id: 'p12', name: 'Tropicana Juice 1L', price: 110, stock: 26, unit: 'pc', hsn: '2009', gst: 12 },
]

const mockParties = [
  { id: 'c1', name: 'Anjali Sharma', phone: '9876543210', pending: 4200, type: 'customer' },
  { id: 'c2', name: 'Rahul Mehta', phone: '9812345678', pending: 0, type: 'customer' },
  { id: 'c3', name: 'Priya Stores', phone: '9988776655', pending: 12400, type: 'customer' },
  { id: 'c4', name: 'Mohan Traders', phone: '9765432109', pending: 6710, type: 'customer' },
  { id: 'c5', name: 'Walk-in Customer', phone: '', pending: 0, type: 'customer' },
]

const formatINR = (amount: number) => `Rs ${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'border-t border-border pt-1.5 text-base font-bold' : 'text-muted-foreground'}`}>
      <span>{label}</span>
      <span className="number-display text-foreground">{value}</span>
    </div>
  )
}

function Sheet({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-background/70 backdrop-blur animate-fade-in lg:items-center lg:justify-center" onClick={onClose}>
      <div className="w-full rounded-t-3xl border border-border bg-card p-6 shadow-elegant animate-slide-up lg:max-w-md lg:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function POSPage() {
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [customer, setCustomer] = useState('Walk-in Customer')
  const [, setCustomerPhone] = useState<string | undefined>(undefined)
  const [showCustomer, setShowCustomer] = useState(false)
  const [showPay, setShowPay] = useState(false)
  const [success, setSuccess] = useState<{ id: string; number: string; amount: number } | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [showOCR, setShowOCR] = useState(false)
  const [scannerError, setScannerError] = useState<string | null>(null)

  const filtered = useMemo(() => mockProducts.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())), [query])
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0)
  const tax = cart.reduce((sum, item) => sum + (item.price * item.qty * item.gst) / 100, 0)
  const total = subtotal + tax

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id)
      if (existing) return current.map((item) => (item.id === product.id ? { ...item, qty: item.qty + 1 } : item))
      return [...current, { ...product, qty: 1 }]
    })
  }

  const updateQty = (id: string, delta: number) => {
    setCart((current) => current.flatMap((item) => (item.id === id ? (item.qty + delta <= 0 ? [] : [{ ...item, qty: item.qty + delta }]) : [item])))
  }

  const handleBarcodeScanned = async (barcode: string) => {
    setScannerError(null)
    try {
      const res = await fetch(`/api/merchant/products/barcode/${barcode}`)
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          const product = data.data
          addToCart({ id: product.id, name: product.item_name, price: product.rate, stock: product.stock_quantity || 999, unit: product.unit || 'pc', hsn: product.hsn_code, gst: product.gst_rate })
          if (navigator.vibrate) navigator.vibrate(50)
        }
      } else {
        setScannerError('Product not found')
      }
    } catch (err) {
      console.error('Barcode lookup failed:', err)
      setScannerError('Scan failed')
    }
    setShowScanner(false)
  }

  const handlePay = (_method: 'upi' | 'cash' | 'udhar') => {
    setShowPay(false)
    if (navigator.vibrate) navigator.vibrate(80)
    setSuccess({ id: `live-${Date.now()}`, number: `INV-${Math.floor(1000 + Math.random() * 9000)}`, amount: Math.round(total) })
  }

  const closeSuccess = () => {
    setSuccess(null)
    setCart([])
    setCustomer('Walk-in Customer')
    setCustomerPhone(undefined)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 lg:px-8 lg:py-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div>
          <div className="relative">
            <SmartSearch
              onSelect={(product) => addToCart(product)}
              placeholder="Search products..."
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 z-10">
              <button type="button" onClick={() => setShowOCR(true)} className="p-2 rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500/20" title="Smart OCR">
                <Zap className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setShowScanner(true)} className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20" title="Scan Barcode">
                <ScanBarcode className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((product) => {
              const inCart = cart.find((item) => item.id === product.id)
              return (
                <button key={product.id} onClick={() => addToCart(product)} className={`rounded-2xl border bg-card p-4 text-left transition-spring active:scale-95 hover:border-primary/40 hover:shadow-md ${inCart ? 'border-primary shadow-glow' : 'border-border'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{product.name}</h3>
                    {inCart && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{inCart.qty}</span>}
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <div className="number-display text-lg font-bold">{formatINR(product.price)}</div>
                      <div className="text-[11px] text-muted-foreground">GST {product.gst}%</div>
                    </div>
                    <div className={`text-[11px] font-medium ${product.stock < 20 ? 'text-warning' : 'text-success'}`}>{product.stock} {product.unit}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        <div className="hidden lg:block">
          <div className="sticky top-24 flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="font-semibold">Cart</h2>
              {cart.length > 0 && <button onClick={() => setCart([])} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /> Clear</button>}
            </div>
            <button onClick={() => setShowCustomer(true)} className="m-3 mb-0 flex items-center gap-2.5 rounded-lg bg-secondary p-3 text-left transition-base hover:bg-secondary/80">
              <User className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">Customer</div>
                <div className="truncate text-sm font-medium">{customer}</div>
              </div>
              <span className="text-xs font-medium text-primary">Change</span>
            </button>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {cart.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">Tap a product to add it</div> : cart.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium leading-snug">{item.name}</div>
                    <div className="number-display whitespace-nowrap text-sm font-bold">{formatINR(item.price * item.qty)}</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-[11px] text-muted-foreground">{formatINR(item.price)} x {item.qty}</div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(item.id, -1)} className="grid h-7 w-7 place-items-center rounded-md bg-secondary hover:bg-secondary/70"><Minus className="h-3 w-3" /></button>
                      <span className="number-display w-7 text-center text-sm font-semibold">{item.qty}</span>
                      <button onClick={() => updateQty(item.id, 1)} className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"><Plus className="h-3 w-3" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="space-y-3 border-t border-border bg-secondary/30 p-4">
                <div className="space-y-1.5 text-sm">
                  <Row label="Subtotal" value={formatINR(subtotal)} />
                  <Row label="GST" value={formatINR(tax)} />
                  <Row label="Total" value={formatINR(total)} bold />
                </div>
                <button onClick={() => setShowPay(true)} className="w-full rounded-xl bg-gradient-primary py-4 text-base font-bold text-primary-foreground shadow-glow transition-base hover:opacity-90">Generate & Send</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {cart.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-30 px-4 animate-slide-up lg:hidden">
          <button onClick={() => setShowPay(true)} className="flex w-full items-center justify-between rounded-2xl bg-gradient-primary p-4 text-primary-foreground shadow-glow">
            <span className="text-sm font-medium">{cart.reduce((s, i) => s + i.qty, 0)} items</span>
            <span className="number-display text-lg font-bold">{formatINR(total)} -&gt;</span>
          </button>
        </div>
      )}
      {showPay && (
        <Sheet onClose={() => setShowPay(false)} title="Collect payment">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-secondary p-4">
              <div>
                <div className="text-xs text-muted-foreground">To collect</div>
                <div className="number-display mt-1 text-3xl font-bold">{formatINR(total)}</div>
              </div>
              <button onClick={() => setShowCustomer(true)} className="inline-flex items-center gap-1 text-xs font-medium text-primary"><User className="h-3 w-3" /> {customer}</button>
            </div>
            {[{ label: 'UPI', desc: 'QR / link to customer', method: 'upi' as const }, { label: 'Cash', desc: 'Mark as paid', method: 'cash' as const }, { label: 'Udhar (Credit)', desc: 'Add to ledger', method: 'udhar' as const }].map((option) => (
              <button key={option.method} onClick={() => handlePay(option.method)} className="flex w-full items-center justify-between rounded-xl border-2 border-input p-4 text-left transition-base hover:border-primary hover:bg-secondary/40">
                <div><div className="font-semibold">{option.label}</div><div className="text-xs text-muted-foreground">{option.desc}</div></div>
                <span className="text-sm font-medium text-primary">-&gt;</span>
              </button>
            ))}
            <label className="mt-2 flex cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-input p-3 hover:bg-secondary/40">
              <Printer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Auto-print receipt after billing</span>
            </label>
          </div>
        </Sheet>
      )}
      {showCustomer && (
        <Sheet onClose={() => setShowCustomer(false)} title="Select customer">
          <div className="space-y-1">
            <button onClick={() => { setCustomer('Walk-in Customer'); setCustomerPhone(undefined); setShowCustomer(false) }} className="w-full rounded-lg p-3 text-left hover:bg-secondary">
              <div className="text-sm font-medium">Walk-in Customer</div>
              <div className="text-xs text-muted-foreground">No details</div>
            </button>
            {mockParties.filter((p) => p.type === 'customer').map((party) => (
              <button key={party.id} onClick={() => { setCustomer(party.name); setCustomerPhone(party.phone.replace(/\s/g, '')); setShowCustomer(false) }} className="flex w-full items-center justify-between rounded-lg p-3 text-left hover:bg-secondary">
                <div><div className="text-sm font-medium">{party.name}</div><div className="text-xs text-muted-foreground">{party.phone}</div></div>
                {party.pending > 0 && <span className="text-xs font-semibold text-warning">{formatINR(party.pending)} due</span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {success && (
        <div className="fixed inset-0 z-50 flex items-end bg-background/80 backdrop-blur animate-fade-in lg:items-center lg:justify-center" onClick={closeSuccess}>
          <div className="w-full rounded-t-3xl border border-border bg-card p-6 shadow-elegant animate-slide-up lg:max-w-md lg:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success text-success-foreground shadow-success"><CheckCircle2 className="h-7 w-7" /></div>
              <h2 className="mt-3 text-xl font-bold">Invoice {success.number}</h2>
              <div className="number-display mt-1 text-3xl font-bold">{formatINR(success.amount)}</div>
              <div className="mt-2 text-sm text-success">Synced successfully</div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => window.open(`/api/invoice/${success.id}`)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-input py-3 text-sm font-medium transition-base hover:bg-secondary"><Printer className="h-4 w-4" /> Print</button>
              <button onClick={() => window.open(`/api/export?type=invoices&format=csv`)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-input py-3 text-sm font-medium transition-base hover:bg-secondary">Excel</button>
              <button onClick={() => window.location.href = `/api/invoice/${success.id}?format=json`} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-primary py-3 text-sm font-medium text-primary-foreground transition-base hover:opacity-90">Send via WhatsApp</button>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={closeSuccess} className="flex-1 rounded-xl border border-input py-3 text-sm font-medium transition-base hover:bg-secondary">New sale</button>
            </div>
          </div>
        </div>
      )}
      <AnimatePresence>
        {showScanner && <BarcodeScanner onScan={handleBarcodeScanned} onClose={() => setShowScanner(false)} onError={(msg) => setScannerError(msg)} />}
      </AnimatePresence>
      {showOCR && <OCRScanner onProductSelect={addToCart} onClose={() => setShowOCR(false)} />}
    </div>
  )
}