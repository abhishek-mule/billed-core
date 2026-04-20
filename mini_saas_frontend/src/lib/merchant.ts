// Merchant utilities and helpers

export interface MerchantInvoicePayload {
  customerPhone: string
  customerName?: string
  items: Array<{
    itemCode: string
    itemName?: string
    quantity: number
    rate: number
  }>
  notes?: string
}

export interface MerchantInvoiceResponse {
  success: boolean
  invoiceId?: string
  invoiceNumber?: string
  whatsappLink?: string
  error?: string
  message?: string
}

export function validateInvoicePayload(payload: MerchantInvoicePayload): { valid: boolean; error?: string } {
  const phoneRegex = /^[6-9]\d{9}$/
  if (!phoneRegex.test(payload.customerPhone.replace(/\D/g, ''))) {
    return { valid: false, error: 'Invalid Indian phone number' }
  }

  if (!payload.items || payload.items.length === 0) {
    return { valid: false, error: 'At least one item is required' }
  }

  for (const item of payload.items) {
    if (!item.itemCode || item.quantity <= 0 || item.rate <= 0) {
      return { valid: false, error: 'Invalid item details' }
    }
  }

  return { valid: true }
}

export function generateInvoiceNumber(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0')
  return `INV-${dateStr}-${random}`
}

export function generateCustomerId(phone: string): string {
  const cleanPhone = phone.replace(/\D/g, '')
  const lastDigits = cleanPhone.slice(-4)
  const timestamp = Date.now().toString().slice(-6)
  return `CUST-${lastDigits}-${timestamp}`
}

export function formatPhone(phone: string): string {
  return phone.replace(/\D/g, '')
}