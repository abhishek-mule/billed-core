'use client'

import { useState } from 'react'
import { Barcode, Camera, FileImage, Receipt, Zap } from 'lucide-react'
import { createPurchaseFromScan, createQuickInvoice } from '@/lib/billzo/actions'
import { useBillzo } from './useBillzo'

export function Scan() {
  const { state } = useBillzo()
  const [mode, setMode] = useState<'bill' | 'barcode'>('bill')
  const [result, setResult] = useState('Ready')
  const [processing, setProcessing] = useState(false)

  const processScan = async () => {
    if (!state) return
    if (mode === 'bill') {
      const purchase = await createPurchaseFromScan()
      setResult(`${purchase.supplier} · GST ${purchase.gstin} · Rs ${purchase.amount.toLocaleString('en-IN')}`)
      return
    }
    const product = state.products.find((p) => p.barcode) || state.products[0]
    const customer = state.customers[0]
    const invoice = await createQuickInvoice(customer, product)
    setResult(`${product.barcode} · ${product.name} · invoice Rs ${invoice.total.toLocaleString('en-IN')}`)
  }

  const processUpload = async (file?: File) => {
    if (!file || !state) return
    setProcessing(true)
    try {
      if (mode === 'barcode' && 'BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'code_128', 'qr_code'] })
        const bitmap = await createImageBitmap(file)
        const codes = await detector.detect(bitmap)
        const value = codes[0]?.rawValue
        const product = state.products.find((item) => item.barcode === value) || state.products.find((item) => item.barcode) || state.products[0]
        const invoice = await createQuickInvoice(state.customers[0], product)
        setResult(`${value || product.barcode} · ${product.name} · invoice Rs ${invoice.total.toLocaleString('en-IN')}`)
        return
      }

      const Tesseract = await import('tesseract.js')
      const { data } = await Tesseract.recognize(file, 'eng')
      const text = data.text.replace(/\s+/g, ' ')
      const gstin = text.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]/)?.[0]
      const amountMatch = text.match(/(?:total|amount|grand total)[^\d]*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/i)
      const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : undefined
      const purchase = await createPurchaseFromScan({ gstin, amount })
      setResult(`${purchase.supplier} · GST ${purchase.gstin || 'not found'} · Rs ${purchase.amount.toLocaleString('en-IN')}`)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Primary entry</p>
        <h1 className="text-2xl font-black">Scan Engine</h1>
      </header>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
        <button onClick={() => setMode('bill')} className={mode === 'bill' ? 'tab-active' : 'tab'}><Receipt className="h-4 w-4" /> Bill OCR</button>
        <button onClick={() => setMode('barcode')} className={mode === 'barcode' ? 'tab-active' : 'tab'}><Barcode className="h-4 w-4" /> Barcode</button>
      </div>

      <section className="grid min-h-[420px] place-items-center rounded-lg border bg-black text-white">
        <div className="w-full max-w-sm space-y-5 px-6 text-center">
          <div className="mx-auto grid aspect-[3/4] w-full place-items-center rounded-lg border-2 border-dashed border-white/35">
            <Camera className="h-16 w-16" />
          </div>
          <button onClick={processScan} disabled={processing} className="mx-auto flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-4 text-base font-black text-black">
            <Zap className="h-5 w-5" />
            {processing ? 'Reading...' : 'Auto Fill'}
          </button>
          <label className="mx-auto flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-3 text-sm font-black">
            <FileImage className="h-4 w-4" />
            Upload Bill
            <input type="file" accept="image/*" className="hidden" onChange={(event) => processUpload(event.target.files?.[0])} />
          </label>
        </div>
      </section>

      <div className="rounded-lg border bg-white p-4">
        <p className="section-label">Extracted</p>
        <p className="mt-2 text-lg font-black">{result}</p>
        <p className="mt-1 text-sm font-bold text-muted-foreground">Writes are saved to Dexie before any sync attempt.</p>
      </div>
    </div>
  )
}
