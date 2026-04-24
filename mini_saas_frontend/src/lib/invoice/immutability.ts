export type InvoiceStatus = 'DRAFT' | 'FINALIZED' | 'VOIDED' | 'CANCELLED'

export const IMMUTABLE_STATUSES: InvoiceStatus[] = ['FINALIZED', 'VOIDED']

export const MUTABLE_FIELDS = {
  DRAFT: ['customer_id', 'customer_name', 'customer_gstin', 'line_items_json', 'subtotal', 'cgst', 'sgst', 'igst', 'total', 'notes', 'payment_mode', 'due_date'],
  FINALIZED: [],
  VOIDED: [],
  CANCELLED: [],
} as const

export function canModifyInvoice(
  currentStatus: InvoiceStatus,
  newStatus: InvoiceStatus
): { allowed: boolean; reason?: string } {
  if (currentStatus === 'DRAFT') {
    if (newStatus === 'FINALIZED') {
      return { allowed: true }
    }
    if (newStatus === 'CANCELLED') {
      return { allowed: true }
    }
    return { allowed: true }
  }
  
  if (currentStatus === 'FINALIZED') {
    if (newStatus === 'VOIDED') {
      return { allowed: true }
    }
    return { 
      allowed: false, 
      reason: 'FINALIZED invoices cannot be modified. Void instead.' 
    }
  }
  
  if (currentStatus === 'VOIDED') {
    return { 
      allowed: false, 
      reason: 'VOIDED invoices are immutable' 
    }
  }
  
  if (currentStatus === 'CANCELLED') {
    return { 
      allowed: false, 
      reason: 'CANCELLED invoices are immutable' 
    }
  }
  
  return { allowed: false, reason: 'Unknown status' }
}

export function canModifyField(
  currentStatus: InvoiceStatus,
  fieldName: string
): { allowed: boolean; reason?: string } {
  if (!IMMUTABLE_STATUSES.includes(currentStatus as any)) {
    return { allowed: true }
  }
  
  if (fieldName === 'erp_sync_status' || fieldName === 'erp_invoice_id') {
    return { allowed: true }
  }
  
  return {
    allowed: false,
    reason: `${currentStatus} invoices are immutable`
  }
}

export function validateTransition(
  currentStatus: InvoiceStatus,
  newStatus: InvoiceStatus
): boolean {
  const result = canModifyInvoice(currentStatus, newStatus)
  return result.allowed
}