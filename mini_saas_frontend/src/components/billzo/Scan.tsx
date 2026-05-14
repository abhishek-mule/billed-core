'use client'

import { useState, useRef } from 'react'
import { Barcode, Camera, FileImage, Receipt, Zap, Loader2, CheckCircle, X, Plus, Edit3, RefreshCw, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { BarcodeScanner } from './BarcodeScanner'
import { lookupBarcode, type BarcodeLookupResult } from '@/lib/billzo/barcode-lookup'
import { extractTextFromImage } from '@/lib/billzo/ocr'

interface LineItem {
  name: string
  quantity: number
  rate: number
  amount: number
  edited?: boolean
}

interface ExtractedData {
  supplier?: string
  invoice_number?: string
  date?: string
  items: LineItem[]
  subtotal?: number
  tax?: number
  total?: number
  raw_text?: string
  confidence: number
}

interface EnrichedProduct {
  name: string
  brand?: string
  category?: string
  gstRate: number
  purchasePrice: number
  salePrice: number
  suggestedStock: number
  suggestedUnit: string
}

const FALLBACK_OCR_URL = process.env.NEXT_PUBLIC_OCR_API_URL

export function Scan() {
  const router = useRouter()
  const [mode, setMode] = useState<'bill' | 'barcode'>('bill')
  const [result, setResult] = useState<ExtractedData | null>(null)
  const [processing, setProcessing] = useState(false)
  const [processingStage, setProcessingStage] = useState('')
  const [error, setError] = useState('')
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [barcodeResult, setBarcodeResult] = useState<BarcodeLookupResult | null>(null)
  const [enrichedProduct, setEnrichedProduct] = useState<EnrichedProduct | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formatINR = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

  const processUpload = async (file?: File) => {
    if (!file) return
    setProcessing(true)
    setError('')
    setResult(null)
    setProcessingStage('Initializing OCR...')

    try {
      setProcessingStage('Extracting text from image (free, no server call)...')
      const ocrResult = await extractTextFromImage(file)
      console.log('[Scan] Tesseract raw text:', ocrResult.rawText.slice(0, 200))

      if (ocrResult.rawText.trim().length < 20) {
        setError('Could not extract enough text. Please try a clearer image.')
        setProcessing(false)
        return
      }

      setProcessingStage('Sending to Gemini AI for structured extraction...')
      const response = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: ocrResult.rawText,
          imageBase64: undefined,
          tenantId: getCookie('bz_tenant') || undefined,
        }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Extraction failed')
      }

      const data = await response.json()
      setResult({ ...data.data, items: (data.data.items || []).map((item: any) => ({ ...item })) })
      console.log('[Scan] Extracted:', data.data)
    } catch (err: any) {
      console.error('[Scan] Error:', err)
      if (err.message?.includes('fetch') || err.message?.includes('network')) {
        setError('Could not connect to extraction service. Please try again.')
      } else {
        setError(err.message || 'Failed to process image')
      }
    } finally {
      setProcessing(false)
      setProcessingStage('')
    }
  }

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    if (!result) return
    const items = [...result.items]
    if (field === 'name' || field === 'edited') {
      items[index] = { ...items[index], [field]: value }
    } else {
      const numValue = typeof value === 'string' ? parseFloat(value) || 0 : value
      items[index] = { ...items[index], [field]: numValue }
      if (field === 'quantity' || field === 'rate') {
        items[index].amount = items[index].quantity * items[index].rate
      }
    }

    const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0)
    const tax = result.tax || 0
    setResult({ ...result, items, subtotal, total: subtotal + tax })
  }

  const addLineItem = () => {
    if (!result) return
    setResult({
      ...result,
      items: [...result.items, { name: '', quantity: 1, rate: 0, amount: 0 }],
    })
  }

  const removeLineItem = (index: number) => {
    if (!result) return
    const items = result.items.filter((_, i) => i !== index)
    const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0)
    setResult({ ...result, items, subtotal, total: subtotal + (result.tax || 0) })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processUpload(file)
  }

  const handleBarcodeScan = async (code: string) => {
    setShowBarcodeScanner(false)
    setProcessing(true)
    setError('')
    setBarcodeResult(null)
    setEnrichedProduct(null)

    try {
      const tenantId = getCookie('bz_tenant') || undefined
      const lookup = await lookupBarcode(code, { tenantId })
      setBarcodeResult(lookup)

      setProcessingStage('Enriching product data with AI...')
      const response = await fetch('/api/ocr/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: code,
          rawText: undefined,
          tenantId,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setEnrichedProduct(data.data)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to look up barcode')
    } finally {
      setProcessing(false)
      setProcessingStage('')
    }
  }

  const addBarcodeProduct = () => {
    const params = new URLSearchParams()
    params.set('barcode', barcodeResult?.barcode || '')
    if (barcodeResult?.name) params.set('name', barcodeResult.name)
    if (barcodeResult?.brand) params.set('brand', barcodeResult.brand)
    if (enrichedProduct) {
      params.set('category', enrichedProduct.category || '')
      params.set('gstRate', String(enrichedProduct.gstRate))
      params.set('purchasePrice', String(enrichedProduct.purchasePrice))
      params.set('salePrice', String(enrichedProduct.salePrice))
      params.set('stock', String(enrichedProduct.suggestedStock))
      params.set('unit', enrichedProduct.suggestedUnit)
    }
    router.push(`/products/add?${params.toString()}`)
  }

  const saveAsPurchase = async () => {
    if (!result) return

    const { db } = await import('@/lib/billzo/db')
    const tenantId = getCookie('bz_tenant') || ''
    if (!tenantId) return

    await db().purchases.add({
      id: `local-${Date.now()}`,
      tenantId,
      supplier: result.supplier || 'Unknown Supplier',
      amount: result.total || result.subtotal || 0,
      gstin: '',
      source: 'scan',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
      version: 1,
    } as any)

    router.push('/purchases')
  }

  const saveAsInvoice = async () => {
    if (!result) return

    const { db } = await import('@/lib/billzo/db')
    const tenantId = getCookie('bz_tenant') || ''
    if (!tenantId) return

    await db().invoices.add({
      id: `local-${Date.now()}`,
      tenantId,
      customerId: '',
      customerName: result.supplier || 'Unknown Customer',
      customerPhone: '',
      total: result.total || result.subtotal || 0,
      paidAmount: 0,
      status: 'unpaid',
      dueAt: result.date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
      recoveryStage: 't0_soft',
      nextRecoveryAt: new Date().toISOString(),
      lastWhatsAppStatus: 'queued',
      reminderCount: 0,
      pdfUrl: '',
      version: 1,
    } as any)

    router.push('/invoices')
  }

  const switchToInvoiceMode = () => {
    setMode('bill')
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Primary entry</p>
        <h1 className="text-2xl font-black">Scan Engine</h1>
      </header>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
        <button
          onClick={() => setMode('bill')}
          className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'bill' ? 'bg-white text-black shadow-sm' : 'text-muted-foreground'}`}
        >
          <Receipt className="h-4 w-4" /> Bill OCR
        </button>
        <button
          onClick={() => setMode('barcode')}
          className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'barcode' ? 'bg-white text-black shadow-sm' : 'text-muted-foreground'}`}
        >
          <Barcode className="h-4 w-4" /> Barcode
        </button>
      </div>

      {mode === 'bill' ? (
        <section className="grid min-h-[350px] place-items-center rounded-lg border bg-black text-white">
          <div className="w-full max-w-sm space-y-5 px-6 text-center">
            <div className="mx-auto aspect-[3/4] w-full max-w-[200px] place-items-center rounded-lg border-2 border-dashed border-white/35 bg-white/10">
              {processing ? (
                <div className="space-y-2">
                  <Loader2 className="h-12 w-12 animate-spin text-white mx-auto" />
                  <p className="text-xs text-white/60">{processingStage}</p>
                </div>
              ) : (
                <Camera className="h-16 w-16 text-white/50" />
              )}
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={processing}
              className="mx-auto flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-4 text-base font-black text-black disabled:opacity-50"
            >
              <Zap className="h-5 w-5" />
              Scan with Camera
            </button>

            <label className="mx-auto flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-3 text-sm font-black hover:bg-white/10">
              <FileImage className="h-4 w-4" />
              Upload Bill Image
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}
          </div>
        </section>
      ) : (
        <section className="grid min-h-[350px] place-items-center rounded-lg border bg-black text-white">
          <div className="w-full max-w-sm px-6 text-center">
            <Barcode className="h-16 w-16 mx-auto mb-4 text-white/50" />
            <p className="text-white/70">Scan a barcode to find and enrich product details</p>
            <button
              onClick={() => setShowBarcodeScanner(true)}
              disabled={processing}
              className="mt-5 mx-auto flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-4 text-base font-black text-black disabled:opacity-50"
            >
              {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Barcode className="h-5 w-5" />}
              {processing ? 'Looking up...' : 'Start Barcode Scan'}
            </button>
          </div>
        </section>
      )}

      {barcodeResult && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="section-label">Barcode Lookup</p>
            <span className={`text-xs px-2 py-1 rounded-full ${barcodeResult.confidence > 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {Math.round(barcodeResult.confidence * 100)}% confidence
            </span>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="mt-1 font-bold">{barcodeResult.name || 'Unknown product'}</h3>
              <p className="text-xs text-muted-foreground">{barcodeResult.barcode} · {barcodeResult.source}</p>
              {enrichedProduct && (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {enrichedProduct.brand && <p>Brand: {enrichedProduct.brand}</p>}
                  {enrichedProduct.category && <p>Category: {enrichedProduct.category}</p>}
                  {enrichedProduct.gstRate && <p>GST: {enrichedProduct.gstRate}%</p>}
                  <p>Purchase: {formatINR(enrichedProduct.purchasePrice)} · Sale: {formatINR(enrichedProduct.salePrice)}</p>
                </div>
              )}
            </div>
            {barcodeResult.imageUrl && (
              <img src={barcodeResult.imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover border" />
            )}
          </div>

          <button onClick={addBarcodeProduct} className="w-full py-2 bg-primary text-primary-foreground rounded-lg font-medium flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" />
            {enrichedProduct ? 'Review & Save Product' : 'Add Product'}
          </button>
        </div>
      )}

      {showBarcodeScanner && (
        <BarcodeScanner onClose={() => setShowBarcodeScanner(false)} onScan={handleBarcodeScan} />
      )}

      {result && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="section-label">Extracted Data</p>
              {result.confidence > 0 && (
                <span className={`text-xs px-2 py-1 rounded-full ${result.confidence > 70 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {Math.round(result.confidence)}% AI confidence
                </span>
              )}
            </div>
            <button onClick={switchToInvoiceMode} className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">
              <Edit3 className="h-3 w-3" /> Edit
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            {result.supplier && (
              <div className="flex justify-between col-span-2">
                <span className="text-muted-foreground">Supplier:</span>
                <span className="font-medium">{result.supplier}</span>
              </div>
            )}
            {result.invoice_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice #:</span>
                <span className="font-medium">{result.invoice_number}</span>
              </div>
            )}
            {result.date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date:</span>
                <span className="font-medium">{result.date}</span>
              </div>
            )}
          </div>

          {result.items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-tight">Items ({result.items.length})</p>
                <button onClick={addLineItem} className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">
                  <Plus className="h-3 w-3" /> Add item
                </button>
              </div>
              {result.items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center text-xs border rounded-lg p-2">
                  <input
                    className="col-span-5 bg-transparent outline-none font-medium truncate"
                    value={item.name}
                    onChange={(e) => updateLineItem(i, 'name', e.target.value)}
                    placeholder="Item name"
                  />
                  <input
                    className="col-span-2 bg-transparent outline-none text-right text-muted-foreground"
                    type="number"
                    value={item.quantity || ''}
                    onChange={(e) => updateLineItem(i, 'quantity', e.target.value)}
                    placeholder="Qty"
                  />
                  <input
                    className="col-span-2 bg-transparent outline-none text-right text-muted-foreground"
                    type="number"
                    value={item.rate || ''}
                    onChange={(e) => updateLineItem(i, 'rate', e.target.value)}
                    placeholder="Rate"
                  />
                  <span className="col-span-2 text-right font-medium">{formatINR(item.amount)}</span>
                  <button onClick={() => removeLineItem(i)} className="col-span-1 text-muted-foreground hover:text-red-500 flex justify-end">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1 text-sm border-t pt-3">
            {result.subtotal !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">{formatINR(result.subtotal)}</span>
              </div>
            )}
            {result.tax !== undefined && result.tax > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax (GST):</span>
                <span className="font-medium">{formatINR(result.tax)}</span>
              </div>
            )}
            {result.total !== undefined && (
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Total:</span>
                <span className="font-bold text-lg">{formatINR(result.total)}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={saveAsPurchase}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <Check className="h-4 w-4" /> Save Purchase
            </button>
            <button
              onClick={saveAsInvoice}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" /> Create Invoice
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-white p-4">
        <p className="section-label">How it works</p>
        <ul className="mt-2 text-sm text-muted-foreground space-y-1">
          <li>1. Click "Scan with Camera" or upload an image</li>
          <li>2. Tesseract.js extracts text locally (free, offline)</li>
          <li>3. Gemini Flash parses text into structured data</li>
          <li>4. Edit extracted items if needed, then save</li>
        </ul>
      </div>
    </div>
  )
}

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}