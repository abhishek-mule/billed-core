export interface InvoiceLineItem {
  itemCode: string
  itemName: string
  quantity: number
  rate: number
  amount: number
  taxRate: number
  cgst: number
  sgst: number
  igst: number
}

export interface InvoiceTotals {
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  taxAmount: number
  discountAmount: number
  total: number
}

export function roundCurrency(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals)
  return Math.round(value * multiplier) / multiplier
}

export function calculateLineItemAmount(
  quantity: number,
  rate: number,
  taxRate: number
): { amount: number; cgst: number; sgst: number; igst: number } {
  const rawAmount = roundCurrency(quantity * rate)
  const taxableAmount = rawAmount
  const cgst = roundCurrency(taxableAmount * (taxRate / 2) / 100)
  const sgst = roundCurrency(taxableAmount * (taxRate / 2) / 100)
  const igst = roundCurrency(taxableAmount * taxRate / 100)
  
  return {
    amount: rawAmount,
    cgst,
    sgst,
    igst,
  }
}

export function calculateInvoiceTotals(
  lineItems: InvoiceLineItem[],
  discountAmount: number = 0
): InvoiceTotals {
  const roundedLineItems = lineItems.map(item => {
    const { amount, cgst, sgst, igst } = calculateLineItemAmount(
      item.quantity,
      item.rate,
      item.taxRate
    )
    return {
      ...item,
      amount,
      cgst,
      sgst,
      igst,
    }
  })
  
  const subtotal = roundCurrency(
    roundedLineItems.reduce((sum, item) => sum + item.amount, 0)
  )
  
  const cgst = roundCurrency(
    roundedLineItems.reduce((sum, item) => sum + item.cgst, 0)
  )
  const sgst = roundCurrency(
    roundedLineItems.reduce((sum, item) => sum + item.sgst, 0)
  )
  const igst = roundCurrency(
    roundedLineItems.reduce((sum, item) => sum + item.igst, 0)
  )
  
  const taxAmount = roundCurrency(cgst + sgst + igst)
  const total = roundCurrency(subtotal + taxAmount - discountAmount)
  
  return {
    subtotal,
    cgst,
    sgst,
    igst,
    taxAmount,
    discountAmount: roundCurrency(discountAmount),
    total,
  }
}

export function validateLedgerConsistency(
  storedTotals: InvoiceTotals,
  computedTotals: InvoiceTotals
): { valid: boolean; discrepancies?: string[] } {
  const discrepancies: string[] = []
  
  if (storedTotals.subtotal !== computedTotals.subtotal) {
    discrepancies.push(`subtotal: stored ${storedTotals.subtotal} vs computed ${computedTotals.subtotal}`)
  }
  
  if (storedTotals.cgst !== computedTotals.cgst) {
    discrepancies.push(`cgst: stored ${storedTotals.cgst} vs computed ${computedTotals.cgst}`)
  }
  
  if (storedTotals.sgst !== computedTotals.sgst) {
    discrepancies.push(`sgst: stored ${storedTotals.sgst} vs computed ${computedTotals.sgst}`)
  }
  
  if (storedTotals.igst !== computedTotals.igst) {
    discrepancies.push(`igst: stored ${storedTotals.igst} vs computed ${computedTotals.igst}`)
  }
  
  if (storedTotals.taxAmount !== computedTotals.taxAmount) {
    discrepancies.push(`taxAmount: stored ${storedTotals.taxAmount} vs computed ${computedTotals.taxAmount}`)
  }
  
  if (storedTotals.total !== computedTotals.total) {
    discrepancies.push(`total: stored ${storedTotals.total} vs computed ${computedTotals.total}`)
  }
  
  return {
    valid: discrepancies.length === 0,
    discrepancies: discrepancies.length > 0 ? discrepancies : undefined,
  }
}

export function validateLineItemTotals(item: InvoiceLineItem): { valid: boolean; error?: string } {
  const computed = calculateLineItemAmount(item.quantity, item.rate, item.taxRate)
  
  const amountMatch = item.amount === computed.amount
  const cgstMatch = item.cgst === computed.cgst
  const sgstMatch = item.sgst === computed.sgst
  const igstMatch = item.igst === computed.igst
  
  if (!amountMatch || !cgstMatch || !sgstMatch || !igstMatch) {
    return {
      valid: false,
      error: `Line item ${item.itemCode} has inconsistent calculations`,
    }
  }
  
  return { valid: true }
}