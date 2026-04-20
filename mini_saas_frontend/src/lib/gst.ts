// GST utilities for India

export const GST_RATES: Record<string, number> = {
  'Electronics': 18,
  'Electrical Equipment': 18,
  'Mobile & Accessories': 18,
  'Grocery': 0,
  'Pharmacy': 0,
  'Clothing': 5,
  'Hardware': 18,
  'Auto Parts': 18,
  'Services': 18,
  'Other': 18,
}

export function getGSTRate(itemCategory?: string, itemCode?: string): number {
  if (itemCategory && GST_RATES[itemCategory]) {
    return GST_RATES[itemCategory]
  }
  return 18
}

export interface InvoiceLineItem {
  itemCode: string
  itemName: string
  quantity: number
  rate: number
  tax?: number
}

export interface InvoiceSummary {
  subtotal: number
  taxAmount: number
  total: number
  items: Array<InvoiceLineItem & { amount: number; taxAmount: number }>
}

export function calculateInvoiceTotal(items: InvoiceLineItem[]): InvoiceSummary {
  const processedItems = items.map((item) => {
    const amount = item.quantity * item.rate
    const gstRate = item.tax || getGSTRate()
    const taxAmount = (amount * gstRate) / 100

    return {
      ...item,
      amount,
      taxAmount,
    }
  })

  const subtotal = processedItems.reduce((sum, item) => sum + item.amount, 0)
  const taxAmount = processedItems.reduce((sum, item) => sum + item.taxAmount, 0)
  const total = subtotal + taxAmount

  return {
    subtotal,
    taxAmount,
    total,
    items: processedItems,
  }
}

export function formatInvoiceForWhatsApp(summary: InvoiceSummary, invoiceNo: string): string {
  const lines = [
    `📄 Invoice: ${invoiceNo}`,
    '',
    '📋 Items:',
    ...summary.items.map((item) => `  • ${item.itemName} x${item.quantity} @ ₹${item.rate} = ₹${item.amount}`),
    '',
    `Subtotal: ₹${summary.subtotal.toFixed(2)}`,
    `Tax (GST): ₹${summary.taxAmount.toFixed(2)}`,
    `Total: ₹${summary.total.toFixed(2)}`,
  ]

  return lines.join('\n')
}