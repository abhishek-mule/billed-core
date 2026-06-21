"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Package, ArrowLeft, Save, Trash2, Barcode, Hash, Tag,
  DollarSign, Percent, Box, AlertTriangle, RefreshCw, Calendar,
  ShoppingCart, TrendingUp, TrendingDown, Plus, X,
} from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { db } from "@/lib/billzo/db"
import { formatINR } from "@/lib/utils"
import { getCookie } from "@/lib/cookies"
import { updateProduct, deleteProduct } from "@/lib/billzo/products-service"
import type { Product } from "@/lib/billzo/types"

const GST_RATES = [0, 5, 12, 18, 28]

type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

function getStockStatus(stock: number, lowStockAt: number): StockStatus {
  if (stock <= 0) return 'out_of_stock'
  if (stock <= lowStockAt) return 'low_stock'
  return 'in_stock'
}

const STATUS_CONFIG = {
  in_stock: { icon: TrendingUp, label: 'In Stock', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  low_stock: { icon: AlertTriangle, label: 'Low Stock', bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  out_of_stock: { icon: X, label: 'Out of Stock', bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
}

type MovementEntry = {
  date: string
  type: 'sale' | 'purchase' | 'adjustment'
  quantity: number
  reference: string
  balance: number
}

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [movements, setMovements] = useState<MovementEntry[]>([])
  const [form, setForm] = useState({
    name: '', barcode: '', hsn: '', gstRate: 18,
    salePrice: 0, purchasePrice: 0,
    stock: 0, lowStockAt: 5, unit: '',
  })

  useEffect(() => { loadProduct() }, [id])

  const loadProduct = async () => {
    try {
      setLoading(true)
      setError(null)
      const tenantId = getCookie('bz_tenant')
      if (!tenantId) { router.push('/auth'); return }

      const p = await db().products.get(id) as unknown as Product | undefined
      if (!p) { router.push('/products'); return }
      setProduct(p)
      setForm({
        name: p.name, barcode: p.barcode || '', hsn: p.hsn || '',
        gstRate: p.gstRate, salePrice: p.salePrice, purchasePrice: p.purchasePrice,
        stock: p.stock, lowStockAt: p.lowStockAt, unit: p.unit || '',
      })

      // Build movement timeline from invoice items
      const movements: MovementEntry[] = []
      const invoices = await db().invoices.where('tenantId').equals(tenantId).toArray() as any[]
      let runningBalance = p.stock

      // Find invoice items referencing this product
      for (const inv of invoices) {
        const items = (inv.items || []) as any[]
        for (const item of items) {
          if (item.productId === id || item.name === p.name) {
            const qty = item.quantity || item.qty || 0
            movements.push({
              date: inv.createdAt || inv.created_at,
              type: 'sale',
              quantity: -qty,
              reference: inv.invoiceNumber || `Invoice #${inv.id?.slice(-8)}`,
              balance: 0,
            })
          }
        }
      }

      // Sort by date descending and compute running balances
      movements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      let bal = 0
      for (let i = movements.length - 1; i >= 0; i--) {
        bal += Math.abs(movements[i].quantity)
        movements[i].balance = bal
      }

      setMovements(movements)
    } catch (err) {
      setError('Failed to load product')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!product) return
    const tenantId = getCookie('bz_tenant')
    if (!tenantId) return
    setSaving(true)
    try {
      await updateProduct(product.id, tenantId, form)
      setProduct({ ...product, ...form })
      setLoading(true); await loadProduct()
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!product) return
    const tenantId = getCookie('bz_tenant')
    if (!tenantId) return
    setDeleting(true)
    try {
      await deleteProduct(product.id, tenantId)
      router.push('/products')
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const status = product ? getStockStatus(form.stock, form.lowStockAt) : 'in_stock'
  const statusCfg = STATUS_CONFIG[status]
  const StatusIcon = statusCfg.icon

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-8">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-7 w-32 bg-slate-200 rounded animate-pulse" />
          <div className="h-48 bg-white border border-slate-200 rounded-lg animate-pulse" />
          <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-slate-50 pb-8">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
          <div className="bg-white border border-rose-200 rounded-lg p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
            <p className="text-sm text-rose-600 mb-4">{error || 'Product not found'}</p>
            <Button variant="outline" size="sm" onClick={() => router.push('/products')}>
              Back to Products
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const Section = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Icon className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-medium text-slate-900">{title}</h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )

  const Field = ({ label, value, onChange, type = 'text', placeholder, suffix }: {
    label: string; value: string | number; onChange: (v: string) => void
    type?: string; placeholder?: string; suffix?: string
  }) => (
    <div>
      <label className="text-xs font-medium text-slate-500 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">

        {/* Back + Actions */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/products')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" /> All Products
          </button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(true)} className="text-rose-600 border-rose-200 hover:bg-rose-50">
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Product Identity */}
        <Section title="Product Identity" icon={Tag}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Product Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. LED Bulb 9W" />
            <Field label="Barcode" value={form.barcode} onChange={v => setForm(f => ({ ...f, barcode: v }))} placeholder="Optional" />
            <Field label="HSN Code" value={form.hsn} onChange={v => setForm(f => ({ ...f, hsn: v }))} placeholder="e.g. 85395000" />
            <Field label="Unit" value={form.unit} onChange={v => setForm(f => ({ ...f, unit: v }))} placeholder="pcs / kg / L / m" />
          </div>
        </Section>

        {/* Selling Information */}
        <Section title="Selling Information" icon={DollarSign}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Sale Price" value={form.salePrice} type="number" onChange={v => setForm(f => ({ ...f, salePrice: parseFloat(v) || 0 }))} suffix="₹" />
            <Field label="Purchase Price" value={form.purchasePrice} type="number" onChange={v => setForm(f => ({ ...f, purchasePrice: parseFloat(v) || 0 }))} suffix="₹" />
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">GST Rate</label>
              <select
                value={form.gstRate}
                onChange={e => setForm(f => ({ ...f, gstRate: parseInt(e.target.value) }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-slate-400"
              >
                {GST_RATES.map(r => (
                  <option key={r} value={r}>{r}% GST</option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        {/* Stock Information */}
        <Section title="Stock Information" icon={Box}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Current Stock" value={form.stock} type="number" onChange={v => setForm(f => ({ ...f, stock: parseInt(v) || 0 }))} />
            <Field label="Low Stock Alert At" value={form.lowStockAt} type="number" onChange={v => setForm(f => ({ ...f, lowStockAt: parseInt(v) || 0 }))} />
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Status</label>
              <div className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium ${statusCfg.bg}`}>
                <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
                <StatusIcon className="w-3.5 h-3.5" />
                {statusCfg.label}
                {status !== 'out_of_stock' && <span className="text-slate-500 font-normal ml-1">({form.stock})</span>}
              </div>
            </div>
          </div>
        </Section>

        {/* Movement Timeline */}
        <Section title="Movement Timeline" icon={Calendar}>
          {movements.length === 0 ? (
            <div className="text-center py-6">
              <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No movement history yet</p>
              <p className="text-xs text-slate-300 mt-1">Sales and purchases will appear here</p>
            </div>
          ) : (
            <div className="space-y-0">
              <div className="grid grid-cols-[1fr_80px_100px] gap-2 px-1 py-1.5 text-[10px] text-slate-400 font-medium uppercase tracking-wider border-b border-slate-100">
                <span>Reference</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Balance</span>
              </div>
              <div className="divide-y divide-slate-50">
                {movements.map((m, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_100px] gap-2 px-1 py-2 items-center">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 truncate">{m.reference}</p>
                      <p className="text-[10px] text-slate-400">{new Date(m.date).toLocaleDateString()}</p>
                    </div>
                    <div className={`text-right text-sm font-medium tabular-nums ${m.quantity < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                    </div>
                    <div className="text-right text-sm text-slate-700 font-medium tabular-nums">{m.balance}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="w-full max-w-sm bg-white border border-slate-200 rounded-lg shadow-xl">
              <div className="px-4 py-3 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Delete Product</h3>
              </div>
              <div className="p-4">
                <p className="text-sm text-slate-600">
                  Are you sure you want to delete <strong>{product.name}</strong>? This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50 rounded-b-lg">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                <Button size="sm" className="flex-1 bg-rose-600 hover:bg-rose-700 text-white" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
