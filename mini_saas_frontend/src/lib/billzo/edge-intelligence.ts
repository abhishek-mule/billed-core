'use client'

import type { CaptureAssessment, MerchantMemorySnapshot } from './scan-types'
import { db } from './db'
import { getCorrectionsForTenant } from './correction-memory'
import { listSkuMappingsForTenant } from './product-matcher'

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context unavailable')
  return { canvas, ctx }
}

export async function analyzeCapture(file: Blob, barcodes: string[]): Promise<CaptureAssessment> {
  const bitmap = await createImageBitmap(file)
  const { canvas, ctx } = createCanvas(bitmap.width, bitmap.height)
  ctx.drawImage(bitmap, 0, 0)
  const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()

  let sum = 0
  let edgeSum = 0
  let topWeight = 0
  let bottomWeight = 0
  let leftWeight = 0
  let rightWeight = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
      sum += gray
      const nextGray = 0.299 * data[idx + 4] + 0.587 * data[idx + 5] + 0.114 * data[idx + 6]
      edgeSum += Math.abs(nextGray - gray)
      if (y < height * 0.2) topWeight += gray
      if (y > height * 0.8) bottomWeight += gray
      if (x < width * 0.2) leftWeight += gray
      if (x > width * 0.8) rightWeight += gray
    }
  }

  const totalPixels = Math.max(1, (width - 2) * (height - 2))
  const brightnessScore = Math.max(0, Math.min(100, Math.round((sum / totalPixels) / 2.55)))
  const blurScore = Math.max(0, Math.min(100, Math.round(edgeSum / totalPixels)))
  const verticalTilt = Math.abs(topWeight - bottomWeight) / Math.max(1, topWeight + bottomWeight)
  const horizontalTilt = Math.abs(leftWeight - rightWeight) / Math.max(1, leftWeight + rightWeight)
  const tiltScore = Math.max(0, Math.min(100, Math.round(100 - (verticalTilt + horizontalTilt) * 100)))
  const cropConfidence = Math.max(35, Math.min(96, Math.round((blurScore + tiltScore + brightnessScore) / 3)))
  const guidance: string[] = []

  if (brightnessScore < 40) guidance.push('Low light detected')
  if (blurScore < 45) guidance.push('Hold steady')
  if (tiltScore < 55) guidance.push('Keep receipt straight')
  if (cropConfidence > 70) guidance.push('Receipt detected')

  return {
    receiptDetected: cropConfidence > 50,
    blurScore,
    brightnessScore,
    tiltScore,
    cropConfidence,
    quality: cropConfidence > 72 ? 'good' : cropConfidence > 52 ? 'fair' : 'poor',
    guidance: guidance.length > 0 ? guidance : ['Move closer'],
    barcodeFound: barcodes.length > 0,
    totalsZoneFound: cropConfidence > 58,
    networkQualityBucket: getNetworkBucket(),
    deviceClass: getDeviceClass(),
  }
}

function getNetworkBucket(): CaptureAssessment['networkQualityBucket'] {
  if (typeof navigator === 'undefined') return 'unknown'
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } }
  const effectiveType = nav.connection?.effectiveType
  if (!effectiveType) return 'unknown'
  if (effectiveType === '4g') return 'fast'
  if (effectiveType === '3g') return 'medium'
  return 'slow'
}

function getDeviceClass(): CaptureAssessment['deviceClass'] {
  if (typeof navigator === 'undefined') return 'unknown'
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (!memory) return 'unknown'
  if (memory <= 2) return 'low'
  if (memory <= 6) return 'mid'
  return 'high'
}

export async function detectImageBarcodes(image: Blob): Promise<string[]> {
  try {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return []
    const detector = new (window as Window & { BarcodeDetector: new (options?: { formats?: string[] }) => { detect: (image: ImageBitmap) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'],
    })
    const bitmap = await createImageBitmap(image)
    const results = await detector.detect(bitmap)
    bitmap.close()
    return Array.from(new Set(results.map((result) => result.rawValue?.trim()).filter(Boolean) as string[]))
  } catch {
    return []
  }
}

export async function buildMerchantMemorySnapshot(tenantId: string): Promise<MerchantMemorySnapshot> {
  const [corrections, skuMappings, catalog] = await Promise.all([
    getCorrectionsForTenant(tenantId),
    listSkuMappingsForTenant(tenantId),
    db().products.where('tenantId').equals(tenantId).limit(150).toArray(),
  ])

  return {
    corrections: corrections.slice(0, 250).map((correction) => ({
      tenantId: correction.tenantId,
      vendor: correction.vendorName,
      rawText: correction.rawValue,
      correctedText: correction.correctedValue,
      fieldType: correction.fieldType,
      confidenceAtCapture: correction.confidenceAtCapture || 70,
      frequency: correction.frequency || correction.count || 1,
      acceptedCount: correction.acceptedCount || correction.count || 1,
      rejectedCount: correction.rejectedCount || 0,
      lastSeenAt: correction.lastSeenAt || correction.lastCorrectedAt,
    })),
    skuMappings: skuMappings.slice(0, 250).map((record) => ({
      vendorName: record.vendorName,
      ocrName: record.ocrName,
      productId: record.productId,
      productName: record.productName,
      matchCount: record.matchCount,
      lastMatchedAt: record.lastMatchedAt,
    })),
    catalog: catalog.map((product) => ({
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      salePrice: product.salePrice,
      unit: product.unit,
    })),
  }
}
