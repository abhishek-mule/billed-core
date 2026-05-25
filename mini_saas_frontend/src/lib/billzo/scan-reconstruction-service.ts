import type { CommerceMemoryRecord, ExtractionPassBundle, MerchantMemorySnapshot, ScanLineItem, ScanField } from './scan-types'

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

function scoreMemory(record: CommerceMemoryRecord) {
  const accepted = record.acceptedCount || record.frequency || 1
  const rejected = record.rejectedCount || 0
  const base = Math.min(95, (record.confidenceAtCapture || 65) + accepted * 4 - rejected * 6)
  return Math.max(35, base)
}

export function reconstructCommerce(bundle: ExtractionPassBundle, memory?: MerchantMemorySnapshot) {
  const vendor = bundle.numericPass.supplier || ''
  const vendorKey = normalize(vendor)
  const vendorCorrections = (memory?.corrections || []).filter((record) => normalize(record.vendor) === vendorKey)
  const skuMappings = (memory?.skuMappings || []).filter((record) => normalize(record.vendorName) === vendorKey)

  const supplierMatch = vendorCorrections
    .filter((record) => record.fieldType === 'supplier' && normalize(record.rawText) === vendorKey)
    .sort((a, b) => scoreMemory(b) - scoreMemory(a))[0]

  const items = bundle.productPass.items.map((item): ScanLineItem => {
    const skuMatch = skuMappings
      .filter((record) => normalize(record.ocrName) === normalize(item.name))
      .sort((a, b) => b.matchCount - a.matchCount)[0]

    const correctedName = skuMatch?.productName || item.name
    const confidenceBoost = skuMatch ? Math.min(18, skuMatch.matchCount * 4) : 0
    const confidence = Math.min(95, item.confidence + confidenceBoost)

    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: correctedName,
      quantity: item.quantity,
      rate: item.rate,
      amount: item.amount,
      unit: item.unit,
      confidence,
      trustState: confidence >= 82 ? 'verified' : 'product_unclear',
      trustLabel: confidence >= 82 ? 'Verified' : 'Product unclear',
      trustReason: skuMatch ? 'Matched from merchant history' : 'Needs quick review',
      evidence: skuMatch
        ? [...item.evidence, { field: `item:${correctedName}`, pass: 'merchant_memory', confidence, reason: 'Resolved from merchant SKU memory', zone: 'table' }]
        : item.evidence,
    }
  })

  const supplierValue = supplierMatch?.correctedText || bundle.numericPass.supplier
  const supplierConfidence = supplierMatch ? Math.min(96, scoreMemory(supplierMatch)) : (supplierValue ? 72 : 20)

  return {
    supplier: {
      value: supplierValue,
      confidence: supplierConfidence,
      fromHistory: Boolean(supplierMatch),
    },
    invoiceNumber: {
      value: bundle.numericPass.invoiceNumber,
      confidence: bundle.numericPass.invoiceNumber ? 74 : 18,
    },
    date: {
      value: bundle.numericPass.date,
      confidence: bundle.numericPass.date ? 74 : 22,
    },
    gstin: {
      value: bundle.numericPass.gstin,
      confidence: bundle.numericPass.gstin ? 82 : 18,
    },
    subtotal: {
      value: bundle.numericPass.subtotal,
      confidence: bundle.numericPass.subtotal ? 80 : 22,
    },
    tax: {
      value: bundle.numericPass.tax,
      confidence: bundle.numericPass.tax ? 78 : 20,
    },
    total: {
      value: bundle.numericPass.total,
      confidence: bundle.numericPass.total ? 88 : 30,
    },
    items,
  }
}
