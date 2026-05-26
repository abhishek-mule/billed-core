'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Barcode, Camera, Check, Edit3, FileImage, Loader2, Plus, Receipt, RefreshCw, X, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { BarcodeScanner } from './BarcodeScanner'
import { extractTextFromImage } from '@/lib/billzo/ocr'
import { preprocessFull, preprocessLight, type PreprocessMetadata } from '@/lib/billzo/preprocess'
import { formatINR } from '@/lib/utils'
import { getCookie } from '@/lib/cookies'
import { learnFromInvoiceDiff } from '@/lib/billzo/correction-memory'
import { notifyChanged } from '@/lib/billzo/db'
import { scheduleBackgroundSync } from '@/lib/billzo/sync'
import { analyzeCapture, buildMerchantMemorySnapshot, detectImageBarcodes } from '@/lib/billzo/edge-intelligence'
import type { CaptureAssessment, ReviewProjection, ScanStageEvent } from '@/lib/billzo/scan-types'
import { logScanTelemetry } from '@/lib/billzo/scan-telemetry'

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

type ScanSummary = {
  receiptType?: string
  preprocess?: { recipe?: string }
  assessment?: CaptureAssessment
  review?: ReviewProjection
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const value = typeof reader.result === 'string' ? reader.result : ''
      resolve(value.split(',')[1] || '')
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function trustTone(state: string) {
  switch (state) {
    case 'verified':
      return 'bg-green-100 text-green-800'
    case 'supplier_matched_history':
      return 'bg-emerald-100 text-emerald-800'
    case 'check_amount':
      return 'bg-amber-100 text-amber-900'
    case 'product_unclear':
      return 'bg-orange-100 text-orange-900'
    case 'date_needs_review':
      return 'bg-yellow-100 text-yellow-900'
    default:
      return 'bg-slate-100 text-slate-800'
  }
}

export function Scan() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const [mode, setMode] = useState<'bill' | 'barcode'>('bill')
  const [processing, setProcessing] = useState(false)
  const [stageLabel, setStageLabel] = useState('')
  const [error, setError] = useState('')
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null)
  const [enrichedProduct, setEnrichedProduct] = useState<EnrichedProduct | null>(null)
  const [preprocessMeta, setPreprocessMeta] = useState<PreprocessMetadata | null>(null)
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null)
  const [streamedItems, setStreamedItems] = useState<ReviewProjection['items']>([])
  const [rawOcrText, setRawOcrText] = useState<string | null>(null)
  const [originalReview, setOriginalReview] = useState<ReviewProjection | null>(null)
  const [review, setReview] = useState<ReviewProjection | null>(null)
  const [reviewHints, setReviewHints] = useState<Array<{ label: string; reason: string }>>([])
  const [scanJobId, setScanJobId] = useState<string | null>(null)

  const reviewReady = Boolean(review)
  const liveAssessment = scanSummary?.assessment

  const closeStream = () => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
  }

  useEffect(() => () => closeStream(), [])

  const resetBillState = () => {
    closeStream()
    setProcessing(false)
    setStageLabel('')
    setError('')
    setScanSummary(null)
    setStreamedItems([])
    setOriginalReview(null)
    setReview(null)
    setReviewHints([])
    setScanJobId(null)
    setRawOcrText(null)
  }

  const runPreprocess = async (file: File, mode: 'light' | 'full') => {
    const fn = mode === 'full' ? preprocessFull : preprocessLight
    const result = await fn(file)
    setPreprocessMeta(result.metadata)
    return result
  }

  const openStream = (jobId: string) => {
    closeStream()
    const es = new EventSource(`/api/scan/stream?scanJobId=${encodeURIComponent(jobId)}`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      const data = JSON.parse(event.data) as ScanStageEvent | { type: string }
      if ('type' in data && data.type === 'connected') return
      if (!('stage' in data)) return

      const next = data as ScanStageEvent
      switch (next.stage) {
        case 'capture_assessment':
          setStageLabel('Receipt detected')
          setScanSummary((prev) => ({
            ...prev,
            assessment: next.payload.assessment as CaptureAssessment,
          }))
          void logScanTelemetry({
            tenantId: getCookie('bz_tenant') || 'unknown',
            scanJobId: next.scanJobId,
            deviceClass: String((next.payload.assessment as CaptureAssessment)?.deviceClass || 'unknown'),
            networkQualityBucket: String((next.payload.assessment as CaptureAssessment)?.networkQualityBucket || 'unknown'),
            outcome: 'stage',
            metricName: 'capture_assessment',
          }).catch(() => {})
          break
        case 'fast_header_extraction':
          setStageLabel('Locking supplier and bill details...')
          setScanSummary((prev) => ({
            ...prev,
            receiptType: next.payload.receiptType as string,
            preprocess: next.payload.preprocess as { recipe?: string },
          }))
          break
        case 'totals_locked':
          setStageLabel('Totals locked')
          break
        case 'items_streaming':
          setStageLabel('Streaming line items...')
          setStreamedItems((prev) => [
            ...prev,
            ...(((next.payload.items as Array<Record<string, unknown>>) || []).map((item, index) => ({
              id: String(item.id || `stream-${index}-${Date.now()}`),
              name: String(item.name || ''),
              quantity: Number(item.quantity || 1),
              rate: Number(item.rate || 0),
              amount: Number(item.amount || 0),
              unit: item.unit ? String(item.unit) : undefined,
              confidence: Number(item.confidence || 55),
              trustState: Number(item.confidence || 55) >= 80 ? 'verified' : 'product_unclear',
              trustLabel: Number(item.confidence || 55) >= 80 ? 'Verified' : 'Product unclear',
              trustReason: 'Streaming item reconstruction',
              evidence: [],
            })) as ReviewProjection['items']),
          ])
          break
        case 'reconstruction_applied':
          setStageLabel('Applying merchant intelligence...')
          break
        case 'review_ready': {
          setProcessing(false)
          setStageLabel('Review ready')
          const nextReview = next.payload.review as ReviewProjection
          setOriginalReview(JSON.parse(JSON.stringify(nextReview)))
          setReview(nextReview)
          setReviewHints(nextReview.hints.map((hint) => ({ label: hint.label, reason: hint.reason })))
          void logScanTelemetry({
            tenantId: getCookie('bz_tenant') || 'unknown',
            scanJobId: next.scanJobId,
            vendorName: String(nextReview.supplier.value || ''),
            receiptType: next.payload.receiptType as any,
            preprocessRecipe: (next.payload.preprocess as { recipe?: string })?.recipe as any,
            deviceClass: String((next.payload.assessment as CaptureAssessment)?.deviceClass || 'unknown'),
            networkQualityBucket: String((next.payload.assessment as CaptureAssessment)?.networkQualityBucket || 'unknown'),
            outcome: 'stage',
            metricName: 'review_ready',
            metricValue: nextReview.items.length,
          }).catch(() => {})
          setScanSummary((prev) => ({
            ...prev,
            receiptType: next.payload.receiptType as string,
            preprocess: next.payload.preprocess as { recipe?: string },
            review: nextReview,
            assessment: next.payload.assessment as CaptureAssessment,
          }))
          closeStream()
          break
        }
        case 'failed':
          setProcessing(false)
          setError(String(next.payload.error || 'Scan failed'))
          closeStream()
          break
      }
    }

    es.onerror = () => {
      es.close()
    }
  }

  const escalateWithLocalOcr = async (jobId: string, blob: Blob) => {
    try {
      const ocr = await extractTextFromImage(blob)
      setRawOcrText(ocr.rawText)
      await fetch('/api/scan/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanJobId: jobId, rawText: ocr.rawText }),
      })
    } catch {
      // local OCR is a best-effort assist layer
    }
  }

  const startReceiptScan = async (file?: File) => {
    if (!file) return

    resetBillState()
    setProcessing(true)
    setStageLabel('Assessing capture...')

    try {
      const tenantId = getCookie('bz_tenant') || ''
      const [light, merchantMemory] = await Promise.all([
        runPreprocess(file, 'light'),
        tenantId ? buildMerchantMemorySnapshot(tenantId) : Promise.resolve(undefined),
      ])

      let ocrOptimizedBlob: Blob | undefined
      const barcodeCandidates = await detectImageBarcodes(light.blob)
      const assessment = await analyzeCapture(light.blob, barcodeCandidates)

      if (assessment.quality !== 'good') {
        const full = await runPreprocess(file, 'full')
        ocrOptimizedBlob = full.blob
      }

      const sessionRes = await fetch('/api/scan/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenantId || undefined,
          croppedCompressedImage: await blobToBase64(light.blob),
          previewImage: await blobToBase64(light.blob),
          ocrOptimizedImage: ocrOptimizedBlob ? await blobToBase64(ocrOptimizedBlob) : undefined,
          captureAssessment: assessment,
          barcodeCandidates,
          merchantMemory,
          preprocessMetadata: light.metadata as unknown as Record<string, unknown>,
        }),
      })

      if (!sessionRes.ok) {
        throw new Error('Failed to start scan session')
      }

      const session = await sessionRes.json() as { scanJobId: string }
      setScanJobId(session.scanJobId)
      openStream(session.scanJobId)
      void escalateWithLocalOcr(session.scanJobId, ocrOptimizedBlob || light.blob)
    } catch (err: any) {
      setProcessing(false)
      setError(err.message || 'Failed to process image')
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void startReceiptScan(file)
  }

  const updateField = (field: keyof ReviewProjection, value: string) => {
    if (!review) return
    const current = review[field]
    if (!current || typeof current !== 'object' || !('value' in current)) return
    setReview({
      ...review,
      [field]: {
        ...current,
        value,
      },
    })
  }

  const updateItem = (index: number, field: 'name' | 'quantity' | 'rate', value: string) => {
    if (!review) return
    const items = [...review.items]
    const item = { ...items[index] }
    if (field === 'name') {
      item.name = value
    } else {
      const numeric = parseFloat(value) || 0
      if (field === 'quantity') item.quantity = numeric
      if (field === 'rate') item.rate = numeric
      item.amount = Math.round(item.quantity * item.rate * 100) / 100
    }
    items[index] = item
    setReview({
      ...review,
      items,
      subtotal: {
        ...review.subtotal,
        value: items.reduce((sum, line) => sum + (line.amount || 0), 0),
      },
      total: {
        ...review.total,
        value: items.reduce((sum, line) => sum + (line.amount || 0), 0) + Number(review.tax.value || 0),
      },
    })
  }

  const addLineItem = () => {
    if (!review) return
    setReview({
      ...review,
      items: [
        ...review.items,
        {
          id: `manual-${Date.now()}`,
          name: '',
          quantity: 1,
          rate: 0,
          amount: 0,
          confidence: 40,
          trustState: 'product_unclear',
          trustLabel: 'Product unclear',
          trustReason: 'Added manually',
          evidence: [],
        },
      ],
    })
  }

  const removeLineItem = (index: number) => {
    if (!review) return
    const items = review.items.filter((_, itemIndex) => itemIndex !== index)
    setReview({
      ...review,
      items,
      subtotal: {
        ...review.subtotal,
        value: items.reduce((sum, line) => sum + (line.amount || 0), 0),
      },
      total: {
        ...review.total,
        value: items.reduce((sum, line) => sum + (line.amount || 0), 0) + Number(review.tax.value || 0),
      },
    })
  }

  const saveAsPurchase = async () => {
    if (!review) return

    const { db } = await import('@/lib/billzo/db')
    const tenantId = getCookie('bz_tenant') || ''
    if (!tenantId) return

    const purchaseId = `local-${Date.now()}`
    const current = new Date().toISOString()
    const items = review.items
    const total = Number(review.total.value || review.subtotal.value || 0)

    const confidenceMap: Record<string, number> = {
      supplier: review.supplier.confidence,
      invoice_number: review.invoiceNumber.confidence,
      date: review.date.confidence,
      total: review.total.confidence,
    }

    items.forEach((item, index) => {
      confidenceMap[`item_name:${index}`] = item.confidence
      confidenceMap[`item_quantity:${index}`] = item.confidence
      confidenceMap[`item_rate:${index}`] = item.confidence
    })

    try {
      await db().transaction(
        'rw',
        [db().purchases, db().invoiceItems, db().products, db().inventoryMovements, db().queue],
        async () => {
          await db().purchases.add({
            id: purchaseId,
            tenantId,
            supplier: String(review.supplier.value || 'Unknown Supplier'),
            amount: total,
            gstin: String(review.gstin.value || ''),
            source: 'scan',
            createdAt: current,
            updatedAt: current,
            syncStatus: 'pending',
            version: 1,
          })

          for (const item of items) {
            const matchedProduct = await db().products
              .where('tenantId')
              .equals(tenantId)
              .filter((product) => product.name.toLowerCase().trim() === item.name.toLowerCase().trim())
              .first()

            await db().invoiceItems.add({
              id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              tenantId,
              invoiceId: purchaseId,
              productId: matchedProduct?.id,
              name: item.name,
              qty: item.quantity,
              price: item.rate,
              gstRate: 0,
              lineTotal: item.amount,
              createdAt: current,
              updatedAt: current,
            })

            if (matchedProduct) {
              const stockAfter = (matchedProduct.stock || 0) + item.quantity
              await db().products.update(matchedProduct.id, { stock: stockAfter, updatedAt: current })
              await db().inventoryMovements.add({
                id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                tenantId,
                productId: matchedProduct.id,
                sourceType: 'purchase',
                sourceId: purchaseId,
                qtyDelta: item.quantity,
                stockAfter,
                createdAt: current,
              })
            }
          }

          await db().queue.put({
            id: `queue-${Date.now()}`,
            tenantId,
            entity: 'purchase',
            entityId: purchaseId,
            action: 'upsert',
            payload: {
              id: purchaseId,
              tenantId,
              supplier: String(review.supplier.value || 'Unknown Supplier'),
              amount: total,
              source: 'scan',
              createdAt: current,
              updatedAt: current,
              syncStatus: 'pending',
              version: 1,
            },
            createdAt: current,
            updatedAt: current,
            attempts: 0,
            nextAttemptAt: current,
            status: 'pending',
            idempotencyKey: `${tenantId}:purchase:${purchaseId}:upsert`,
            conflictPolicy: 'latest_write_wins',
          })
        }
      )

      if (originalReview) {
        await learnFromInvoiceDiff(
          {
            supplier: originalReview.supplier.value,
            invoice_number: originalReview.invoiceNumber.value,
            date: originalReview.date.value,
            total: originalReview.total.value,
            items: originalReview.items.map((item) => ({ name: item.name, quantity: item.quantity, rate: item.rate })),
          },
          {
            supplier: review.supplier.value,
            invoice_number: review.invoiceNumber.value,
            date: review.date.value,
            total: review.total.value,
            items: review.items.map((item) => ({ name: item.name, quantity: item.quantity, rate: item.rate })),
          },
          tenantId,
          String(review.supplier.value || 'Unknown Supplier'),
          confidenceMap
        )
      }

      notifyChanged()
      scheduleBackgroundSync()
      await logScanTelemetry({
        tenantId,
        scanJobId: scanJobId || undefined,
        vendorName: String(review.supplier.value || ''),
        receiptType: scanSummary?.receiptType as any,
        preprocessRecipe: scanSummary?.preprocess?.recipe as any,
        deviceClass: liveAssessment?.deviceClass || 'unknown',
        networkQualityBucket: liveAssessment?.networkQualityBucket || 'unknown',
        outcome: 'accepted',
        metricName: 'purchase_saved',
        metricValue: items.length,
      })
      router.push('/purchases')
    } catch (err) {
      setError('Failed to save purchase. Please try again.')
      await logScanTelemetry({
        tenantId,
        scanJobId: scanJobId || undefined,
        vendorName: String(review.supplier.value || ''),
        receiptType: scanSummary?.receiptType as any,
        preprocessRecipe: scanSummary?.preprocess?.recipe as any,
        deviceClass: liveAssessment?.deviceClass || 'unknown',
        networkQualityBucket: liveAssessment?.networkQualityBucket || 'unknown',
        outcome: 'failure',
        metricName: 'purchase_save_failed',
      })
    }
  }

  const handleBarcodeScan = async (code: string) => {
    setShowBarcodeScanner(false)
    setProcessing(true)
    setError('')
    setScannedBarcode(code)
    setEnrichedProduct(null)

    try {
      const tenantId = getCookie('bz_tenant') || undefined

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
      setStageLabel('')
    }
  }

  const addBarcodeProduct = () => {
    const params = new URLSearchParams()
    params.set('barcode', scannedBarcode || '')
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

  const liveItems = useMemo(() => review?.items || streamedItems, [review, streamedItems])

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Retail Intelligence</p>
        <h1 className="text-2xl font-black">Progressive Scan Engine</h1>
      </header>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
        <button
          onClick={() => setMode('bill')}
          className={`flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${mode === 'bill' ? 'bg-white text-black shadow-sm' : 'text-muted-foreground'}`}
        >
          <Receipt className="h-4 w-4" /> Receipt Scan
        </button>
        <button
          onClick={() => setMode('barcode')}
          className={`flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${mode === 'barcode' ? 'bg-white text-black shadow-sm' : 'text-muted-foreground'}`}
        >
          <Barcode className="h-4 w-4" /> Barcode
        </button>
      </div>

      {mode === 'bill' ? (
        <section className="grid min-h-[350px] place-items-center rounded-lg border bg-black text-white">
          <div className="w-full max-w-sm space-y-5 px-6 text-center">
            <div className="mx-auto grid aspect-[3/4] w-full max-w-[210px] place-items-center rounded-lg border-2 border-dashed border-white/35 bg-white/10">
              {processing ? (
                <div className="space-y-2">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin text-white" />
                  <p className="text-xs text-white/70">{stageLabel || 'Starting scan...'}</p>
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
              Upload Receipt
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>

            {liveAssessment && (
              <div className="rounded-lg border border-white/10 bg-white/10 p-3 text-left text-xs">
                <p className="font-black">Capture feedback</p>
                <div className="mt-2 space-y-1 text-white/80">
                  {liveAssessment.guidance.map((hint) => (
                    <p key={hint}>{hint}</p>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="space-y-2">
                <p className="text-sm text-red-400">{error}</p>
                {rawOcrText && (
                  <button
                    onClick={() => scanJobId && fetch('/api/scan/escalate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ scanJobId, rawText: rawOcrText }),
                    })}
                    className="flex items-center justify-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-xs font-medium text-white hover:bg-white/10"
                  >
                    <RefreshCw className="h-3 w-3" /> Retry with local OCR
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="grid min-h-[350px] place-items-center rounded-lg border bg-black text-white">
          <div className="w-full max-w-sm px-6 text-center">
            <Barcode className="mx-auto mb-4 h-16 w-16 text-white/50" />
            <p className="text-white/70">Scan a barcode to find and enrich product details</p>
            <button
              onClick={() => setShowBarcodeScanner(true)}
              disabled={processing}
              className="mx-auto mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-4 text-base font-black text-black disabled:opacity-50"
            >
              {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Barcode className="h-5 w-5" />}
              {processing ? 'Looking up...' : 'Start Barcode Scan'}
            </button>
          </div>
        </section>
      )}

      {scanSummary?.preprocess && (
        <div className="rounded-lg border bg-white p-4 text-sm">
          <div className="flex flex-wrap gap-2">
            {scanSummary.receiptType && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{scanSummary.receiptType}</span>}
            {scanSummary.preprocess.recipe && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{scanSummary.preprocess.recipe}</span>}
            {preprocessMeta?.cropped ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">smart crop</span> : null}
          </div>
        </div>
      )}

      {scannedBarcode && enrichedProduct && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="mt-1 font-bold">{enrichedProduct.name || 'Unknown product'}</h3>
              <p className="text-xs text-muted-foreground">{scannedBarcode}</p>
              {enrichedProduct && (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {enrichedProduct.brand && <p>Brand: {enrichedProduct.brand}</p>}
                  {enrichedProduct.category && <p>Category: {enrichedProduct.category}</p>}
                  {enrichedProduct.gstRate && <p>GST: {enrichedProduct.gstRate}%</p>}
                  <p>Purchase: {formatINR(enrichedProduct.purchasePrice)} · Sale: {formatINR(enrichedProduct.salePrice)}</p>
                </div>
              )}
            </div>
          </div>

          <button onClick={addBarcodeProduct} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 font-medium text-primary-foreground">
            <Plus className="h-4 w-4" />
            {enrichedProduct ? 'Review & Save Product' : 'Add Product'}
          </button>
        </div>
      )}

      {showBarcodeScanner && (
        <BarcodeScanner onClose={() => setShowBarcodeScanner(false)} onScan={handleBarcodeScan} />
      )}

      {(processing || reviewReady || liveItems.length > 0) && mode === 'bill' && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="section-label">Scan Review</p>
              <p className="text-sm text-muted-foreground">{stageLabel || 'Preparing scan output...'}</p>
            </div>
            {processing ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : reviewReady ? (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800">Review ready</span>
            ) : null}
          </div>

          {reviewHints.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {reviewHints.map((hint) => (
                <div key={`${hint.label}-${hint.reason}`} className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-sm font-black">{hint.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{hint.reason}</p>
                </div>
              ))}
            </div>
          )}

          {review && (
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {([
                { key: 'supplier', label: 'Supplier', field: review.supplier },
                { key: 'invoiceNumber', label: 'Invoice #', field: review.invoiceNumber },
                { key: 'date', label: 'Date', field: review.date },
                { key: 'gstin', label: 'GSTIN', field: review.gstin },
              ] as const).map(({ key, label, field }) => (
                <div key={String(key)} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-black ${trustTone(field.trustState)}`}>{field.trustLabel}</span>
                  </div>
                  <input
                    className="w-full bg-transparent text-sm font-medium outline-none"
                    value={String(field.value || '')}
                    onChange={(e) => updateField(key as keyof ReviewProjection, e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{field.trustReason}</p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-tight text-muted-foreground">Items ({liveItems.length})</p>
              {reviewReady && (
                <button onClick={addLineItem} className="text-xs text-indigo-600 hover:underline">
                  Add item
                </button>
              )}
            </div>
            {liveItems.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Items will stream here progressively.</div>
            ) : (
              liveItems.map((item, index) => (
                <div key={item.id || `${item.name}-${index}`} className="grid grid-cols-12 items-center gap-2 rounded-lg border p-2 text-xs">
                  <div className="col-span-5 min-w-0">
                    {reviewReady ? (
                      <input
                        className="w-full truncate bg-transparent font-medium outline-none"
                        value={item.name}
                        onChange={(e) => updateItem(index, 'name', e.target.value)}
                      />
                    ) : (
                      <p className="truncate font-medium">{item.name}</p>
                    )}
                    <span className={`mt-1 inline-block rounded-full px-2 py-1 text-[10px] font-black ${trustTone(item.trustState)}`}>{item.trustLabel}</span>
                  </div>
                  <input
                    className="col-span-2 bg-transparent text-right text-muted-foreground outline-none"
                    type="number"
                    value={item.quantity || ''}
                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    disabled={!reviewReady}
                  />
                  <input
                    className="col-span-2 bg-transparent text-right text-muted-foreground outline-none"
                    type="number"
                    value={item.rate || ''}
                    onChange={(e) => updateItem(index, 'rate', e.target.value)}
                    disabled={!reviewReady}
                  />
                  <span className="col-span-2 text-right font-medium">{formatINR(item.amount || 0)}</span>
                  {reviewReady && (
                    <button onClick={() => removeLineItem(index)} className="col-span-1 flex justify-end text-muted-foreground hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {review && (
            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className={`rounded-full px-2 py-1 text-xs font-black ${trustTone(review.subtotal.trustState)}`}>{review.subtotal.trustLabel}</span>
              </div>
              <div className="flex justify-between">
                <span>{formatINR(Number(review.subtotal.value || 0))}</span>
                <span className="text-xs text-muted-foreground">{review.subtotal.trustReason}</span>
              </div>
              <div className="mt-2 flex justify-between border-t pt-2">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-lg">{formatINR(Number(review.total.value || 0))}</span>
              </div>
              <p className="text-xs text-muted-foreground">{review.total.trustLabel} · {review.total.trustReason}</p>
            </div>
          )}

          {reviewReady && (
            <div className="flex gap-2">
              <button
                onClick={saveAsPurchase}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 font-medium text-white hover:bg-blue-700"
              >
                <Check className="h-4 w-4" /> Save Purchase
              </button>
              <button
                onClick={resetBillState}
                className="flex items-center justify-center gap-2 rounded-lg border px-4 py-2 font-medium"
              >
                <Edit3 className="h-4 w-4" /> Scan Again
              </button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-white p-4">
        <p className="section-label">How it works</p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>1. Edge capture checks light, blur, tilt, crop, and barcode signals first.</li>
          <li>2. A progressive scan session streams header fields, totals, and items in stages.</li>
          <li>3. Merchant memory improves supplier and item understanding before review.</li>
          <li>4. Review uses trust states like Verified and Check amount instead of raw confidence.</li>
        </ul>
      </div>
    </div>
  )
}
