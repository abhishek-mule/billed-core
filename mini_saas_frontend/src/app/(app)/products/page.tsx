"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Package, Plus, Search, AlertTriangle, Download, Upload,
  MoreHorizontal, ChevronDown, ShoppingCart, TrendingUp,
  SlidersHorizontal, X,
} from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { EmptyState } from "@/components/billzo/EmptyState"
import { db } from "@/lib/billzo/db"
import { formatINR } from "@/lib/utils"
import { getCookie } from "@/lib/cookies"

type Product = {
  id: string
  tenantId: string
  name: string
  barcode?: string
  hsn?: string
  gstRate: number
  stock: number
  lowStockAt: number
  salePrice: number
  purchasePrice: number
  unit?: string
  createdAt: string
  updatedAt: string
}

type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

function getStockStatus(product: Product): StockStatus {
  if (product.stock <= 0) return 'out_of_stock'
  if (product.stock <= product.lowStockAt) return 'low_stock'
  return 'in_stock'
}

const STOCK_INDICATORS: Record<StockStatus, { label: string; dot: string; bg: string; text: string }> = {
  in_stock: {
    label: 'In Stock',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50 text-emerald-700',
    text: 'text-emerald-700',
  },
  low_stock: {
    label: 'Low Stock',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50 text-amber-700',
    text: 'text-amber-700',
  },
  out_of_stock: {
    label: 'Out of Stock',
    dot: 'bg-rose-500',
    bg: 'bg-rose-50 text-rose-700',
    text: 'text-rose-700',
  },
}

function InventoryHero({
  totalProducts,
  lowStockCount,
  outOfStockCount,
  activeFilter,
  onFilterChange,
}: {
  totalProducts: number
  lowStockCount: number
  outOfStockCount: number
  activeFilter: StockStatus | null
  onFilterChange: (f: StockStatus | null) => void
}) {
  const FilterStat = ({ label, count, filter, active, onClick }: {
    label: string; count: number; filter: StockStatus; active: boolean; onClick: () => void
  }) => (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-colors ${
        active
          ? 'bg-slate-50 border-slate-300'
          : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
    >
      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${count > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
        {count}
      </p>
    </button>
  )

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 lg:p-5">
      <div className="grid grid-cols-4 gap-3 lg:gap-4">
        <div className="bg-white p-3 rounded-lg">
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">
            <ShoppingCart className="w-3 h-3 inline mr-1" />Total Products
          </p>
          <p className="text-lg lg:text-xl font-semibold text-slate-900 tabular-nums">{totalProducts}</p>
        </div>
        <FilterStat
          label="Low Stock"
          count={lowStockCount}
          filter="low_stock"
          active={activeFilter === 'low_stock'}
          onClick={() => onFilterChange(activeFilter === 'low_stock' ? null : 'low_stock')}
        />
        <FilterStat
          label="Out of Stock"
          count={outOfStockCount}
          filter="out_of_stock"
          active={activeFilter === 'out_of_stock'}
          onClick={() => onFilterChange(activeFilter === 'out_of_stock' ? null : 'out_of_stock')}
        />
        <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-3">
          <p className="text-[10px] text-amber-700 font-medium uppercase tracking-wider mb-1">
            <AlertTriangle className="w-3 h-3 inline mr-1" />Needs Attention
          </p>
          <p className="text-lg font-semibold text-amber-700 tabular-nums">{lowStockCount + outOfStockCount}</p>
        </div>
      </div>
    </div>
  )
}

function InventoryAttentionSection({ products }: { products: Product[] }) {
  const critical = products
    .filter(p => p.stock > 0 && p.stock <= p.lowStockAt)
    .sort((a, b) => a.stock / Math.max(a.lowStockAt, 1) - b.stock / Math.max(b.lowStockAt, 1))
    .slice(0, 5)

  if (critical.length === 0) return null

  return (
    <div className="bg-amber-50/30 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <p className="text-sm font-medium text-amber-800">Inventory Attention</p>
        <p className="text-xs text-amber-600 ml-auto">{critical.length} product{critical.length > 1 ? 's' : ''} running low</p>
      </div>
      <div className="grid gap-2">
        {critical.map(p => {
          const estimatedDays = p.stock > 0 ? Math.max(1, Math.round(p.stock / 2)) : 0
          return (
            <div key={p.id} className="flex items-center justify-between bg-white rounded border border-amber-200/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                <p className="text-xs text-slate-500">{p.stock} remaining — ~{estimatedDays} day{estimatedDays > 1 ? 's' : ''}</p>
              </div>
              <div className="w-full max-w-[120px] h-1.5 bg-amber-100 rounded-full ml-3">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${Math.min(100, (p.stock / Math.max(p.lowStockAt, 1)) * 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProductCard({ product, onSelect }: { product: Product; onSelect: () => void }) {
  const status = getStockStatus(product)
  const indicator = STOCK_INDICATORS[status]

  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-white border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
          <Package className="w-4 h-4 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{product.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`flex items-center gap-1 text-xs`}>
              <span className={`w-1.5 h-1.5 rounded-full ${indicator.dot}`} />
              <span className={indicator.text}>{indicator.label}</span>
            </span>
            {product.stock > 0 && (
              <span className="text-xs text-slate-400">({product.stock})</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatINR(product.salePrice)}</p>
          {product.unit && (
            <p className="text-[10px] text-slate-400">per {product.unit}</p>
          )}
        </div>
      </div>
    </button>
  )
}

function ExportDropdown({ onClose }: { onClose: () => void }) {
  const router = useRouter()

  const handleExport = async (format: 'xlsx' | 'csv') => {
    onClose()
    const tenantId = getCookie('bz_tenant')
    if (!tenantId) return

    try {
      const products = await db().products.where('tenantId').equals(tenantId).toArray() as unknown as Product[]
      const data = products.map(p => ({
        Name: p.name,
        Barcode: p.barcode || '',
        HSN: p.hsn || '',
        'Sale Price': p.salePrice,
        'Purchase Price': p.purchasePrice,
        'GST Rate': `${p.gstRate}%`,
        Stock: p.stock,
        Unit: p.unit || '',
      }))

      if (format === 'csv') {
        const headers = Object.keys(data[0] || {})
        const csv = [
          headers.join(','),
          ...data.map(row => headers.map(h => `"${String((row as any)[h]).replace(/"/g, '""')}"`).join(',')),
        ].join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `products_${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        const { default: xlsx } = await import('xlsx')
        const wb = xlsx.utils.book_new()
        const ws = xlsx.utils.json_to_sheet(data)
        xlsx.utils.book_append_sheet(wb, ws, 'Products')
        xlsx.writeFile(wb, `products_${new Date().toISOString().slice(0, 10)}.xlsx`)
      }
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  return (
    <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
      <button onClick={() => handleExport('xlsx')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
        <Download className="w-4 h-4" /> Export Excel
      </button>
      <button onClick={() => handleExport('csv')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
        <Download className="w-4 h-4" /> Export CSV
      </button>
      <button onClick={() => { onClose(); router.push('/products/import') }} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
        <Upload className="w-4 h-4" /> Import
      </button>
    </div>
  )
}

export default function ProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [activeFilter, setActiveFilter] = useState<StockStatus | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [visibleCount, setVisibleCount] = useState(25)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const tenantId = getCookie('bz_tenant')
        if (!tenantId) { router.push('/auth'); return }
        const data = await db().products.where('tenantId').equals(tenantId).toArray()
        setProducts(data as unknown as Product[])
      } catch {
        setError('Failed to load products')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement !== searchRef.current) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const lowStockCount = useMemo(
    () => products.filter(p => getStockStatus(p) === 'low_stock').length,
    [products]
  )
  const outOfStockCount = useMemo(
    () => products.filter(p => getStockStatus(p) === 'out_of_stock').length,
    [products]
  )

  // Filter by search + status
  const filtered = useMemo(() => {
    let result = products
    if (q.trim()) {
      const query = q.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.barcode?.toLowerCase().includes(query) ||
        p.hsn?.toLowerCase().includes(query)
      )
    }
    if (activeFilter) {
      result = result.filter(p => getStockStatus(p) === activeFilter)
    }
    return result
  }, [products, q, activeFilter])

  const displayed = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-8">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-28 bg-white border border-slate-200 rounded-lg animate-pulse" />
          <div className="h-10 bg-white border border-slate-200 rounded-lg animate-pulse" />
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-16 bg-white border border-slate-200 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Error ──
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 pb-8">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
          <div className="bg-white border border-rose-200 rounded-lg p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
            <p className="text-sm text-rose-600 mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Empty ──
  if (products.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 pb-8">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
          <div className="bg-white border border-slate-200 rounded-lg p-8 lg:p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4">
              <Package className="w-6 h-6 text-slate-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">No products yet</h2>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
              Add your first product to start managing inventory and creating invoices.
            </p>
            <Button onClick={() => router.push('/products/add')}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Product
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">

        {/* Inventory Health Hero */}
        <InventoryHero
          totalProducts={products.length}
          lowStockCount={lowStockCount}
          outOfStockCount={outOfStockCount}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />

        {/* Inventory Attention */}
        <InventoryAttentionSection products={products} />

        {/* Search + Actions bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name, barcode, or HSN... (/)"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>

          {/* Desktop actions */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="relative" ref={menuRef}>
              <Button variant="outline" size="sm" onClick={() => setShowMenu(!showMenu)}>
                <SlidersHorizontal className="w-4 h-4 mr-1.5" /> Options
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
              {showMenu && <ExportDropdown onClose={() => setShowMenu(false)} />}
            </div>
            <Button size="sm" onClick={() => router.push('/products/add')}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Product
            </Button>
          </div>
        </div>

        {/* Active filter indicator */}
        {activeFilter && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Filtered by: <strong className="text-slate-700">{activeFilter === 'low_stock' ? 'Low Stock' : 'Out of Stock'}</strong></span>
            <button onClick={() => setActiveFilter(null)} className="text-slate-400 hover:text-slate-600 underline">Clear</button>
            <span className="text-slate-300">|</span>
            <span>{filtered.length} product{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Product list */}
        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
            <p className="text-sm text-slate-400">No products match your search</p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {displayed.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelect={() => router.push(`/products/${product.id}`)}
                />
              ))}
            </div>

            {hasMore && (
              <div className="text-center pt-2">
                <Button variant="outline" size="sm" onClick={() => setVisibleCount(v => v + 25)}>
                  Show More ({filtered.length - visibleCount} remaining)
                </Button>
              </div>
            )}

            <div className="text-center text-xs text-slate-400 pt-1">
              Showing {displayed.length} of {filtered.length} product{filtered.length !== 1 ? 's' : ''}
              {q && ` for "${q}"`}
            </div>
          </>
        )}
      </div>

      {/* Mobile FAB */}
      <div className="sm:hidden fixed bottom-20 right-4 z-10">
        <button
          onClick={() => router.push('/products/add')}
          className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-lg"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile options button */}
      <div className="sm:hidden fixed bottom-20 right-20 z-10">
        <button
          onClick={() => router.push('/products/import')}
          className="w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-600 flex items-center justify-center shadow"
        >
          <Upload className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
