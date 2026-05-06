'use client'

import { useState, useRef } from 'react'
import { Barcode, Camera, FileImage, Receipt, Zap, Loader2, CheckCircle, X, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ExtractedData {
  supplier?: string
  invoice_number?: string
  date?: string
  items: Array<{
    name: string
    quantity: number
    rate: number
    amount: number
  }>
  subtotal?: number
  tax?: number
  total?: number
  raw_text?: string
  confidence?: number
}

const OCR_API_URL = process.env.NEXT_PUBLIC_OCR_API_URL || 'http://localhost:8000'

export function Scan() {
  const router = useRouter()
  const [mode, setMode] = useState<'bill' | 'barcode'>('bill')
  const [result, setResult] = useState<ExtractedData | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formatINR = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

  const processUpload = async (file?: File) => {
    if (!file) return
    setProcessing(true)
    setError('')
    setResult(null)

    try {
      // Send to Python EasyOCR backend
      const formData = new FormData()
      formData.append('image', file)

      const response = await fetch(`${OCR_API_URL}/scan`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`OCR failed: ${response.statusText}`)
      }

      const data = await response.json()
      setResult(data)
      console.log('OCR Result:', data)
    } catch (err: any) {
      console.error('OCR Error:', err)
      setError(err.message || 'Failed to process image')
    } finally {
      setProcessing(false)
    }
  }

  const handleCapture = async () => {
    // Use camera capture via input
    fileInputRef.current?.click()
  }

  const saveAsPurchase = async () => {
    if (!result) return
    
    const { db } = await import('@/lib/billzo/db')
    const tenantId = localStorage.getItem('tenantId')
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

    alert('Purchase saved!')
    router.push('/purchases')
  }

  const saveAsInvoice = async () => {
    if (!result) return
    
    const { db } = await import('@/lib/billzo/db')
    const tenantId = localStorage.getItem('tenantId')
    if (!tenantId) return

    const invoiceId = `local-${Date.now()}`
    
    await db().invoices.add({
      id: invoiceId,
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
      pdfUrl: '',
      version: 1,
    } as any)

    alert('Invoice saved!')
    router.push('/invoices')
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
                <Loader2 className="h-12 w-12 animate-spin text-white" />
              ) : (
                <Camera className="h-16 w-16 text-white/50" />
              )}
            </div>
            
            <button 
              onClick={handleCapture} 
              disabled={processing}
              className="mx-auto flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-4 text-base font-black text-black disabled:opacity-50"
            >
              {processing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5" />
                  Scan with Camera
                </>
              )}
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
                onChange={(event) => processUpload(event.target.files?.[0])} 
              />
            </label>
            
            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}
          </div>
        </section>
      ) : (
        <section className="grid min-h-[350px] place-items-center rounded-lg border bg-black text-white">
          <div className="text-center">
            <Barcode className="h-16 w-16 mx-auto mb-4 text-white/50" />
            <p className="text-white/70">Barcode scanner coming soon</p>
          </div>
        </section>
      )}

      {result && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="section-label">Extracted Data</p>
            {result.confidence && (
              <span className={`text-xs px-2 py-1 rounded-full ${result.confidence > 70 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {result.confidence}% confidence
              </span>
            )}
          </div>

          <div className="grid gap-3 text-sm">
            {result.supplier && (
              <div className="flex justify-between">
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
            {result.items.length > 0 && (
              <div>
                <span className="text-muted-foreground">Items ({result.items.length}):</span>
                <ul className="mt-1 space-y-1">
                  {result.items.slice(0, 5).map((item, i) => (
                    <li key={i} className="flex justify-between text-xs">
                      <span className="truncate max-w-[150px]">{item.name}</span>
                      <span>{item.quantity} × {formatINR(item.rate)} = {formatINR(item.amount)}</span>
                    </li>
                  ))}
                  {result.items.length > 5 && (
                    <li className="text-xs text-muted-foreground">+{result.items.length - 5} more items</li>
                  )}
                </ul>
              </div>
            )}
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
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Save as Purchase
            </button>
            <button 
              onClick={saveAsInvoice}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
            >
              Create Invoice
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-white p-4">
        <p className="section-label">How it works</p>
        <ul className="mt-2 text-sm text-muted-foreground space-y-1">
          <li>1. Click "Scan with Camera" or upload an image</li>
          <li>2. AI extracts supplier, items, tax from invoice</li>
          <li>3. Save as Purchase or create Invoice</li>
        </ul>
      </div>
    </div>
  )
}