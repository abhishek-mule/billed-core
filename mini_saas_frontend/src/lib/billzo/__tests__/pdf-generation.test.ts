import { describe, it, expect } from 'vitest'
import { generateInvoicePDF } from '@/lib/billzo/pdf'

const base = {
  invoiceNumber: 'BZ-0001',
  date: '01 Sep 2026',
  createdAtIso: '2026-09-01T10:30:00.000Z',
  customerName: 'Ramesh Sharma',
  customerPhone: '9876543210',
  businessName: 'Sharma Dhaba',
  businessGstin: '27ABCDE1234F1Z5',
  whiteLabel: false,
} as const

describe('generateInvoicePDF', () => {
  it('emits a non-empty PDF for a GST invoice', async () => {
    const doc = await generateInvoicePDF({
      ...base,
      items: [
        { name: 'Paneer Tikka', hsn: '2108', qty: 2, price: 200, gstRate: 18, unit: 'Plate' },
        { name: 'Butter Naan', hsn: '1905', qty: 4, price: 40, gstRate: 5, unit: 'Piece' },
      ],
      subtotal: 500,
      tax: 30,
      total: 530,
      amountReceived: 100,
      upiId: 'sharmadhaba@okhdfcbank',
      placeOfSupply: '27',
      documentType: 'tax_invoice',
    })
    const out: ArrayBuffer = (doc as any).output('arraybuffer')
    expect(out.byteLength).toBeGreaterThan(1000)
    expect(doc.getNumberOfPages()).toBeGreaterThan(0)
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(2)
  })

  it('handles inter-state supply (IGST classification path)', async () => {
    const doc = await generateInvoicePDF({
      ...base,
      placeOfSupply: '29',
      items: [{ name: 'Widget', hsn: '9999', qty: 1, price: 118, gstRate: 18 }],
      subtotal: 100,
      tax: 18,
      total: 118,
      documentType: 'tax_invoice',
    })
    const out: ArrayBuffer = (doc as any).output('arraybuffer')
    expect(out.byteLength).toBeGreaterThan(1000)
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('emits a single-page non-GST white-label bill', async () => {
    const doc = await generateInvoicePDF({
      invoiceNumber: 'B-42',
      date: '02 Sep 2026',
      customerName: 'Walk-in Customer',
      items: [{ name: 'Samosa', qty: 3, price: 15 }],
      subtotal: 45,
      tax: 0,
      total: 45,
      businessName: 'Sharma Dhaba',
      whiteLabel: true,
      documentType: 'bill',
    })
    expect(doc.getNumberOfPages()).toBe(1)
    const out: ArrayBuffer = (doc as any).output('arraybuffer')
    expect(out.byteLength).toBeGreaterThan(500)
  })
})