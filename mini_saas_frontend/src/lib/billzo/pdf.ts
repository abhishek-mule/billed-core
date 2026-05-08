import { jsPDF } from 'jspdf'

export interface InvoiceItem {
  name: string
  qty: number
  price: number
  gstRate?: number
}

export interface InvoiceData {
  invoiceNumber: string
  date: string
  customerName: string
  customerPhone?: string
  items: InvoiceItem[]
  subtotal: number
  tax: number
  total: number
  businessName: string
  businessPhone?: string
  businessGstin?: string
}

export function generateInvoicePDF(data: InvoiceData): jsPDF {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  // Header - Business Name
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(data.businessName || 'Invoice', pageWidth / 2, y, { align: 'center' })
  y += 10

  // Business Details
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  if (data.businessPhone) {
    doc.text(`Phone: ${data.businessPhone}`, pageWidth / 2, y, { align: 'center' })
    y += 5
  }
  if (data.businessGstin) {
    doc.text(`GSTIN: ${data.businessGstin}`, pageWidth / 2, y, { align: 'center' })
    y += 5
  }
  y += 5

  // Invoice Details Line
  doc.setDrawColor(200, 200, 200)
  doc.line(20, y, pageWidth - 20, y)
  y += 10

  // Invoice Number & Date
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`Invoice #: ${data.invoiceNumber}`, 20, y)
  doc.text(`Date: ${data.date}`, pageWidth - 20, y, { align: 'right' })
  y += 10

  // Customer Details
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Bill To:', 20, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text(data.customerName, 20, y)
  y += 5
  if (data.customerPhone) {
    doc.setFont('helvetica', 'normal')
    doc.text(`Phone: ${data.customerPhone}`, 20, y)
    y += 5
  }
  y += 10

  // Items Table Header
  doc.setFillColor(240, 240, 240)
  doc.rect(20, y, pageWidth - 40, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Item', 22, y + 5.5)
  doc.text('Qty', 100, y + 5.5)
  doc.text('Price', 120, y + 5.5)
  doc.text('Amount', 155, y + 5.5)
  y += 10

  // Items
  doc.setFont('helvetica', 'normal')
  data.items.forEach((item) => {
    doc.text(item.name.substring(0, 35), 22, y)
    doc.text(String(item.qty), 100, y)
    doc.text(`₹${item.price.toFixed(0)}`, 120, y)
    doc.text(`₹${(item.price * item.qty).toFixed(0)}`, 155, y)
    y += 7
  })

  y += 5

  // Totals Line
  doc.line(20, y, pageWidth - 20, y)
  y += 10

  // Subtotal
  doc.text('Subtotal:', 120, y)
  doc.text(`₹${data.subtotal.toFixed(0)}`, 155, y)
  y += 7

  // Tax
  doc.text(`Tax (${data.items[0]?.gstRate || 0}%):`, 120, y)
  doc.text(`₹${data.tax.toFixed(0)}`, 155, y)
  y += 7

  // Total
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Total:', 120, y)
  doc.text(`₹${data.total.toFixed(0)}`, 155, y)
  y += 15

  // Footer
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(128, 128, 128)
  doc.text('Thank you for your business!', pageWidth / 2, y, { align: 'center' })

  return doc
}

export function downloadInvoicePDF(data: InvoiceData) {
  const doc = generateInvoicePDF(data)
  doc.save(`${data.invoiceNumber}.pdf`)
}

export function getWhatsAppShareLink(data: InvoiceData): string {
  const message = `*INVOICE*\n\n`
    + `Invoice #: ${data.invoiceNumber}\n`
    + `Date: ${data.date}\n\n`
    + `*Items:*\n`
    + data.items.map(item => `${item.name} x${item.qty} = ₹${(item.price * item.qty).toFixed(0)}`).join('\n') + `\n\n`
    + `*Total: ₹${data.total.toFixed(0)}*\n\n`
    + `From: ${data.businessName}`

  const encodedMessage = encodeURIComponent(message)
  
  if (data.customerPhone) {
    const phone = data.customerPhone.replace(/\D/g, '')
    return `https://wa.me/${phone}?text=${encodedMessage}`
  }
  
  return `https://wa.me/?text=${encodedMessage}`
}