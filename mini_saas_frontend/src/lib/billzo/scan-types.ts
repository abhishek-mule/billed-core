export type ReceiptType =
  | 'thermal'
  | 'printed'
  | 'handwritten'
  | 'screenshot'
  | 'whatsapp_forward'
  | 'gst_invoice'
  | 'restaurant_bill'
  | 'pharmacy_bill'
  | 'default_receipt'

export type PreprocessRecipe =
  | 'thermal_receipt'
  | 'printed_invoice'
  | 'screenshot_whatsapp'
  | 'default_receipt'

export type ScanStage =
  | 'capture_assessment'
  | 'fast_header_extraction'
  | 'totals_locked'
  | 'items_streaming'
  | 'reconstruction_applied'
  | 'review_ready'
  | 'failed'

export type FieldTrustState =
  | 'verified'
  | 'check_amount'
  | 'product_unclear'
  | 'date_needs_review'
  | 'supplier_matched_history'
  | 'review'

export interface GeometryEvidence {
  zone: 'header' | 'table' | 'totals' | 'footer'
  startLine: number
  endLine: number
  confidence: number
  reason: string
}

export interface FieldEvidence {
  field: string
  pass: 'barcode_pass' | 'geometry_pass' | 'layout_pass' | 'numeric_pass' | 'product_pass' | 'merchant_memory' | 'ai_fallback'
  confidence: number
  reason: string
  zone?: GeometryEvidence['zone']
}

export interface ReviewHint {
  field: string
  state: FieldTrustState
  label: string
  reason: string
}

export interface CaptureAssessment {
  receiptDetected: boolean
  blurScore: number
  brightnessScore: number
  tiltScore: number
  cropConfidence: number
  quality: 'good' | 'fair' | 'poor'
  guidance: string[]
  barcodeFound: boolean
  totalsZoneFound: boolean
  networkQualityBucket: 'fast' | 'medium' | 'slow' | 'unknown'
  deviceClass: 'low' | 'mid' | 'high' | 'unknown'
}

export interface ScanLineItem {
  id: string
  name: string
  quantity: number
  rate: number
  amount: number
  unit?: string
  confidence: number
  trustState: FieldTrustState
  trustLabel: string
  trustReason: string
  evidence: FieldEvidence[]
}

export interface ScanField<T = string | number> {
  value?: T
  confidence: number
  trustState: FieldTrustState
  trustLabel: string
  trustReason: string
  evidence: FieldEvidence[]
}

export interface ExtractionPassBundle {
  barcodePass: {
    barcodes: string[]
    confidence: number
  }
  geometryPass: {
    totalsZoneFound: boolean
    rowsDetected: number
    columnGroups: number
    evidence: GeometryEvidence[]
  }
  layoutPass: {
    headerLines: string[]
    tableLines: string[]
    totalLines: string[]
  }
  numericPass: {
    supplier?: string
    invoiceNumber?: string
    date?: string
    gstin?: string
    subtotal?: number
    tax?: number
    total?: number
  }
  productPass: {
    items: Array<{
      name: string
      quantity: number
      rate: number
      amount: number
      unit?: string
      confidence: number
      evidence: FieldEvidence[]
    }>
  }
}

export interface CommerceMemoryRecord {
  tenantId: string
  vendor: string
  rawText: string
  correctedText: string
  fieldType: string
  confidenceAtCapture: number
  frequency: number
  acceptedCount: number
  rejectedCount: number
  lastSeenAt: string
}

export interface CatalogMemoryRecord {
  id: string
  name: string
  barcode?: string
  salePrice: number
  unit?: string
}

export interface SkuMemoryRecord {
  vendorName: string
  ocrName: string
  productId: string
  productName: string
  matchCount: number
  lastMatchedAt: string
}

export interface MerchantMemorySnapshot {
  corrections: CommerceMemoryRecord[]
  skuMappings: SkuMemoryRecord[]
  catalog: CatalogMemoryRecord[]
}

export interface ReviewProjection {
  supplier: ScanField<string>
  invoiceNumber: ScanField<string>
  date: ScanField<string>
  gstin: ScanField<string>
  subtotal: ScanField<number>
  tax: ScanField<number>
  total: ScanField<number>
  items: ScanLineItem[]
  hints: ReviewHint[]
}

export interface ScanSessionPayload {
  tenantId?: string
  previewImage?: string
  croppedCompressedImage: string
  ocrOptimizedImage?: string
  captureAssessment: CaptureAssessment
  barcodeCandidates: string[]
  rawText?: string
  merchantMemory?: MerchantMemorySnapshot
  preprocessMetadata?: Record<string, unknown>
}

export interface ScanJob {
  id: string
  createdAt: string
  updatedAt: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  input: ScanSessionPayload
  events: ScanStageEvent[]
}

export interface ScanStageEvent {
  id: string
  scanJobId: string
  stage: ScanStage
  timestamp: number
  type: 'stage' | 'partial' | 'final' | 'error'
  payload: Record<string, unknown>
}

export interface ScanTelemetryEvent {
  id: string
  tenantId: string
  scanJobId?: string
  vendorName?: string
  receiptType?: ReceiptType
  preprocessRecipe?: PreprocessRecipe
  deviceClass: string
  networkQualityBucket: string
  fieldType?: string
  trustState?: FieldTrustState
  outcome: 'accepted' | 'edited' | 'rejected' | 'stage' | 'failure'
  metricName: string
  metricValue?: number
  createdAt: string
}
