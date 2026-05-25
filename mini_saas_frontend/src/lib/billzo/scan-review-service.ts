import type { FieldEvidence, FieldTrustState, ReviewHint, ReviewProjection } from './scan-types'

type FieldInput<T> = {
  value?: T
  confidence: number
  fromHistory?: boolean
  evidence?: FieldEvidence[]
}

function trustForField(name: string, confidence: number, fromHistory = false): { state: FieldTrustState; label: string; reason: string } {
  if (name === 'supplier' && fromHistory) {
    return { state: 'supplier_matched_history', label: 'Supplier matched from history', reason: 'We matched this supplier using your past scans.' }
  }
  if (name === 'total' && confidence < 80) {
    return { state: 'check_amount', label: 'Check amount', reason: 'Total needs a quick verification.' }
  }
  if (name === 'date' && confidence < 80) {
    return { state: 'date_needs_review', label: 'Date needs review', reason: 'Date could be ambiguous on this bill.' }
  }
  if (name.startsWith('item') && confidence < 80) {
    return { state: 'product_unclear', label: 'Product unclear', reason: 'Item name is uncertain. A quick tap will fix it.' }
  }
  if (confidence >= 82) {
    return { state: 'verified', label: 'Verified', reason: 'Looks reliable from scan evidence.' }
  }
  return { state: 'review', label: 'Review suggested', reason: 'Worth a quick review before saving.' }
}

function projectField<T>(name: string, input: FieldInput<T>) {
  const trust = trustForField(name, input.confidence, input.fromHistory)
  return {
    value: input.value,
    confidence: input.confidence,
    trustState: trust.state,
    trustLabel: trust.label,
    trustReason: trust.reason,
    evidence: input.evidence || [],
  }
}

export function projectReview(reconstructed: {
  supplier: FieldInput<string>
  invoiceNumber: FieldInput<string>
  date: FieldInput<string>
  gstin: FieldInput<string>
  subtotal: FieldInput<number>
  tax: FieldInput<number>
  total: FieldInput<number>
  items: Array<{
    id: string
    name: string
    quantity: number
    rate: number
    amount: number
    unit?: string
    confidence: number
    evidence: FieldEvidence[]
    trustState: FieldTrustState
    trustLabel: string
    trustReason: string
  }>
}): ReviewProjection {
  const supplier = projectField('supplier', reconstructed.supplier)
  const invoiceNumber = projectField('invoiceNumber', reconstructed.invoiceNumber)
  const date = projectField('date', reconstructed.date)
  const gstin = projectField('gstin', reconstructed.gstin)
  const subtotal = projectField('subtotal', reconstructed.subtotal)
  const tax = projectField('tax', reconstructed.tax)
  const total = projectField('total', reconstructed.total)

  const hints: ReviewHint[] = [
    supplier,
    invoiceNumber,
    date,
    gstin,
    total,
    ...reconstructed.items,
  ]
    .filter((field) => field.trustState !== 'verified')
    .slice(0, 6)
    .map((field: any) => ({
      field: field.value || field.name || 'field',
      state: field.trustState,
      label: field.trustLabel,
      reason: field.trustReason,
    }))

  return {
    supplier,
    invoiceNumber,
    date,
    gstin,
    subtotal,
    tax,
    total,
    items: reconstructed.items,
    hints,
  }
}
