import type { CaptureAssessment, ReceiptType, ScanSessionPayload } from './scan-types'

function hasGstin(rawText: string) {
  return /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d]Z[A-Z\d]\b/i.test(rawText)
}

export function detectInvoiceType(input: ScanSessionPayload, assessment: CaptureAssessment): ReceiptType {
  const text = (input.rawText || '').toLowerCase()

  if (text.includes('whatsapp') || text.includes('forwarded')) return 'whatsapp_forward'
  if (text.includes('swiggy') || text.includes('zomato') || text.includes('table') || text.includes('kot')) return 'restaurant_bill'
  if (text.includes('tablet') || text.includes('capsule') || text.includes('pharmacy') || text.includes('rx')) return 'pharmacy_bill'
  if (hasGstin(text)) return 'gst_invoice'
  if (text.includes('invoice') || text.includes('tax invoice')) return 'printed'
  if (assessment.blurScore < 40 && assessment.brightnessScore < 40) return 'thermal'
  if (assessment.cropConfidence < 45) return 'screenshot'
  return 'default_receipt'
}
