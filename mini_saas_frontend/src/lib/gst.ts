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
  isInterState?: boolean
}

export interface InvoiceSummary {
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  taxAmount: number
  total: number
  items: Array<InvoiceLineItem & { amount: number; cgst: number; sgst: number; taxAmount: number }>
}

export function calculateInvoiceTotal(items: InvoiceLineItem[], isInterState = false): InvoiceSummary {
  const processedItems = items.map((item) => {
    const amount = item.quantity * item.rate
    const gstRate = item.tax || getGSTRate()
    
    let cgst = 0, sgst = 0, igst = 0
    if (item.isInterState || isInterState) {
      igst = (amount * gstRate) / 100
    } else {
      cgst = (amount * gstRate) / 200
      sgst = (amount * gstRate) / 200
    }
    const taxAmount = cgst + sgst + igst

    return {
      ...item,
      amount,
      cgst,
      sgst,
      igst,
      taxAmount,
    }
  })

  const subtotal = processedItems.reduce((sum, item) => sum + item.amount, 0)
  const cgstTotal = processedItems.reduce((sum, item) => sum + item.cgst, 0)
  const sgstTotal = processedItems.reduce((sum, item) => sum + item.sgst, 0)
  const igstTotal = processedItems.reduce((sum, item) => sum + item.igst, 0)
  const taxAmount = cgstTotal + sgstTotal + igstTotal
  const total = subtotal + taxAmount

  return {
    subtotal,
    cgst: cgstTotal,
    sgst: sgstTotal,
    igst: igstTotal,
    taxAmount,
    total,
    items: processedItems,
  }
}

export function calcGST(items: any[]): { subtotal: number; cgst: number; sgst: number; igst: number; total: number } {
  const totals = items.reduce((acc, item) => {
    const amount = (item.qty || item.quantity) * item.rate
    const gstRate = item.gstRate || item.taxRate || 18
    
    const taxAmount = (amount * gstRate) / 100
    const cgst = taxAmount / 2
    const sgst = taxAmount / 2
    
    return {
      subtotal: acc.subtotal + amount,
      cgst: acc.cgst + cgst,
      sgst: acc.sgst + sgst,
      igst: acc.igst,
      total: acc.total + amount + taxAmount
    }
  }, { subtotal: 0, cgst: 0, sgst: 0, igst: 0, total: 0 })
  
  return totals
}

export function formatInvoiceForWhatsApp(summary: any, invoiceNo: string): string {
  const items = summary.items || []
  const lines = [
    `📄 Invoice: ${invoiceNo}`,
    '',
    '📋 Items:',
    ...items.map((item: any) => `  • ${item.itemName || item.name} x${item.quantity || item.qty} @ ₹${item.rate} = ₹${item.amount}`),
    '',
    `Subtotal: ₹${summary.subtotal}`,
    summary.igst > 0 
      ? `IGST: ₹${summary.igst}` 
      : `CGST: ₹${summary.cgst} | SGST: ₹${summary.sgst}`,
    `Total: ₹${summary.total || summary.grandTotal}`,
  ]

  return lines.join('\n')
}