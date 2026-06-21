"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Save, Zap, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { getCookie } from "@/lib/cookies"
import { createProduct } from "@/lib/billzo/products-service"

const GST_RATES = [0, 5, 12, 18, 28]

export default function AddProductPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [basicMode, setBasicMode] = useState(true)

  const [form, setForm] = useState({
    name: "",
    barcode: "",
    hsn: "",
    gstRate: "18",
    stock: "0",
    lowStockAt: "10",
    salePrice: "",
    purchasePrice: "",
    unit: "pcs",
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const barcode = params.get('barcode') || ''
    const name = params.get('name') || ''
    const gstRate = params.get('gstRate') || '18'
    const stock = params.get('stock') || '0'
    const salePrice = params.get('salePrice') || ''
    const purchasePrice = params.get('purchasePrice') || ''
    const unit = params.get('unit') || 'pcs'

    if (!barcode && !name && !salePrice && !purchasePrice) return

    setForm(prev => ({
      ...prev,
      barcode: barcode || prev.barcode,
      name: name || prev.name,
      gstRate,
      stock,
      salePrice,
      purchasePrice,
      unit,
    }))
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const tenantId = getCookie('bz_tenant')
      if (!tenantId) { router.push('/auth'); return }

      const result = await createProduct({
        tenantId,
        name: form.name,
        barcode: form.barcode || undefined,
        hsn: form.hsn || undefined,
        gstRate: parseFloat(form.gstRate) || 0,
        stock: parseInt(form.stock) || 0,
        lowStockAt: parseInt(form.lowStockAt) || 10,
        salePrice: parseFloat(form.salePrice) || 0,
        purchasePrice: parseFloat(form.purchasePrice) || 0,
        unit: form.unit,
      })

      if (!result.success) {
        setError(result.error || "Failed to create product")
        return
      }

      router.push("/products")
    } catch (err: any) {
      setError(err.message || "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 rounded-lg border border-border hover:bg-muted">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Add Product</h1>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
        )}

        {/* Basic / Advanced toggle */}
        <div className="bg-card border border-border rounded-lg p-3">
          <button
            type="button"
            onClick={() => setBasicMode(!basicMode)}
            className="flex items-center justify-between w-full text-sm"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="font-medium text-foreground">
                {basicMode ? 'Basic Mode' : 'Advanced Mode'}
              </span>
              <span className="text-xs text-muted-foreground">
                {basicMode ? '(Name, Price, Stock)' : '(All fields)'}
              </span>
            </div>
            {basicMode ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Product Identity — always shown */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Product Identity</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Product Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g. LED Bulb 9W"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>

              {/* Advanced fields */}
              <div className={`grid grid-cols-2 gap-4 overflow-hidden transition-all ${basicMode ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-96 opacity-100'}`}>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Barcode</label>
                  <input
                    type="text"
                    name="barcode"
                    value={form.barcode}
                    onChange={handleChange}
                    placeholder="e.g. 8901262010129"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">HSN Code</label>
                  <input
                    type="text"
                    name="hsn"
                    value={form.hsn}
                    onChange={handleChange}
                    placeholder="e.g. 85395000"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Pricing & Tax */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Pricing & Tax</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Sale Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                  <input
                    type="number"
                    name="salePrice"
                    value={form.salePrice}
                    onChange={handleChange}
                    step="0.01"
                    placeholder="0.00"
                    className="w-full rounded-lg border border-border bg-card pl-7 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Purchase Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                  <input
                    type="number"
                    name="purchasePrice"
                    value={form.purchasePrice}
                    onChange={handleChange}
                    step="0.01"
                    placeholder="0.00"
                    className="w-full rounded-lg border border-border bg-card pl-7 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">GST Rate</label>
                <select
                  name="gstRate"
                  value={form.gstRate}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                >
                  {GST_RATES.map(r => (
                    <option key={r} value={r}>{r}% GST</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit</label>
                <select
                  name="unit"
                  value={form.unit}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="pcs">Pieces (pcs)</option>
                  <option value="kg">Kilogram (kg)</option>
                  <option value="L">Liter (L)</option>
                  <option value="m">Meter (m)</option>
                  <option value="box">Box</option>
                </select>
              </div>
            </div>
          </div>

          {/* Stock */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Stock</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Current Stock</label>
                <input
                  type="number"
                  name="stock"
                  value={form.stock}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Low Stock Alert At</label>
                <input
                  type="number"
                  name="lowStockAt"
                  value={form.lowStockAt}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4 mr-1.5" /> Save Product</>
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
