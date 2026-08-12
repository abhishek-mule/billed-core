import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'
import type { GSTReport, SalesMetrics, AgingBucket } from './report-engine'
import { formatINR } from '@/lib/utils'

export interface InvoiceItem {
  name: string
  qty: number
  price: number
  gstRate?: number
  hsn?: string
}

export interface BankDetailsData {
  bankName?: string
  accountNumber?: string
  ifsc?: string
  accountHolder?: string
}

export interface InvoiceData {
  invoiceNumber: string
  date: string
  customerName: string
  customerPhone?: string
  customerGstin?: string
  customerAddress?: string
  items: InvoiceItem[]
  subtotal: number
  tax: number
  total: number
  businessName: string
  businessPhone?: string
  businessEmail?: string
  businessGstin?: string
  businessPan?: string
  businessAddress?: string
  logo?: string
  bankDetails?: BankDetailsData
  upiId?: string
  whiteLabel?: boolean
  placeOfSupply?: string
  documentType?: 'tax_invoice' | 'bill'
  invoiceFooter?: string
  paymentTerms?: string
}

const NUMBER_WORDS: Record<number, string> = {
  0: 'Zero', 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five',
  6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten',
  11: 'Eleven', 12: 'Twelve', 13: 'Thirteen', 14: 'Fourteen', 15: 'Fifteen',
  16: 'Sixteen', 17: 'Seventeen', 18: 'Eighteen', 19: 'Nineteen',
  20: 'Twenty', 30: 'Thirty', 40: 'Forty', 50: 'Fifty',
  60: 'Sixty', 70: 'Seventy', 80: 'Eighty', 90: 'Ninety',
}

function numberToWords(n: number): string {
  if (n === 0) return 'Zero'
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const hundred = Math.floor((n % 1000) / 100)
  const remainder = n % 100

  const under20 = (num: number) => NUMBER_WORDS[num] || ''
  const tens = (num: number) => {
    if (num < 20) return under20(num)
    const t = Math.floor(num / 10) * 10
    const u = num % 10
    return `${NUMBER_WORDS[t]}${u ? ' ' + under20(u) : ''}`
  }

  const parts: string[] = []
  if (crore) parts.push(`${under20(crore)} Crore`)
  if (lakh) parts.push(`${under20(lakh)} Lakh`)
  if (thousand) parts.push(`${under20(thousand)} Thousand`)
  if (hundred) parts.push(`${under20(hundred)} Hundred`)
  if (remainder) parts.push(tens(remainder))
  return parts.join(' ')
}

function getFinancialYear(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (month >= 4) return `${year}-${(year + 1).toString().slice(2)}`
  return `${year - 1}-${year.toString().slice(2)}`
}

export function generateInvoiceNumber(tenantName: string, counter: number): string {
  const prefix = tenantName.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'BIZ'
  const fy = getFinancialYear()
  return `${prefix}-${fy}-${String(counter).padStart(6, '0')}`
}

export async function generateInvoicePDF(data: InvoiceData): Promise<jsPDF> {
  const doc = new jsPDF()
  const pw = doc.internal.pageSize.getWidth()
  const margin = 18
  const contentW = pw - margin * 2
  let y = margin

  const dark = [30, 41, 59] as const
  const gray = [148, 163, 184] as const
  const midGray = [100, 116, 139] as const
  const lightBg = [248, 250, 252] as const
  const accent = [22, 128, 45] as const

  const isBill = data.documentType === 'bill'
  const showGst = !isBill && data.items.some(i => i.gstRate && i.gstRate > 0)

  // Compute everything from items — never trust passed subtotal/tax/total
  const derivedItems = data.items.map(item => {
    const lineTotal = Math.round(item.price * item.qty)
    const taxable = item.gstRate ? Math.round(lineTotal * 100 / (100 + item.gstRate)) : lineTotal
    const gstAmt = lineTotal - taxable
    const cgst = Math.round(gstAmt / 2)
    const sgst = gstAmt - cgst
    return { ...item, lineTotal, taxable, gstAmt, cgst, sgst }
  })
  const derivedSubtotal = derivedItems.reduce((s, i) => s + i.taxable, 0)
  const derivedTax = derivedItems.reduce((s, i) => s + i.gstAmt, 0)
  const derivedTotal = derivedSubtotal + derivedTax

  function num(n: number): string {
    return n.toLocaleString('en-IN')
  }

  function rs(n: number): string {
    return `Rs. ${num(n)}`
  }

  // ── Supplier Block ──
  let logoRight = margin
  if (data.logo) {
    try {
      doc.addImage(data.logo, 'PNG', margin, y - 2, 20, 20)
      logoRight = margin + 24
    } catch { }
  }

  // Business name — large, bold, dominant
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...dark)
  doc.text(data.businessName, logoRight, y + 5)

  // Supplier details — structured, line by line
  y += 16
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...midGray)
  const supplierLines: string[] = []
  if (data.businessAddress) supplierLines.push(data.businessAddress)
  if (data.businessPhone) supplierLines.push(`Phone: ${data.businessPhone}`)
  if (data.businessEmail) supplierLines.push(data.businessEmail)
  for (const line of supplierLines) {
    doc.text(line, logoRight, y)
    y += 4.5
  }
  if (!isBill) {
    if (data.businessGstin) { doc.text(`GSTIN: ${data.businessGstin}`, logoRight, y); y += 4.5 }
    if (data.businessPan) { doc.text(`PAN: ${data.businessPan}`, logoRight, y); y += 4.5 }
  }
  y += 4

  // ── Separator + Title ──
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pw - margin, y); y += 8
  const title = isBill ? 'BILL' : 'TAX INVOICE'
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...midGray)
  doc.text(title, pw / 2, y, { align: 'center' })
  y += 8

  // ── Invoice Meta ──
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...midGray)
  const today = new Date()
  const dueDate = new Date(today)
  dueDate.setDate(dueDate.getDate() + (isBill ? 0 : 15))
  const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  doc.text(`Invoice No: ${data.invoiceNumber}`, margin, y)
  doc.text(`Invoice Date: ${data.date}`, pw / 2 + 10, y)
  if (!isBill) {
    doc.text(`Due Date: ${fmtDate(dueDate)}`, pw - margin, y, { align: 'right' })
  }
  y += 5
  if (!isBill) {
    doc.setFontSize(7.5)
    if (data.placeOfSupply) doc.text(`Place of Supply: ${data.placeOfSupply}`, margin, y)
    doc.text(`Payment Terms: ${data.paymentTerms || 'Due on receipt'}`, pw - margin, y, { align: 'right' })
    y += 5
  }
  y += 3

  // ── Customer Block ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...midGray)
  doc.text('Bill To', margin, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...dark)
  doc.text(data.customerName, margin, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...midGray)
  const cinfo: string[] = []
  if (data.customerPhone) cinfo.push(`Phone: ${data.customerPhone}`)
  if (!isBill && data.customerGstin) cinfo.push(`GSTIN: ${data.customerGstin}`)
  if (data.customerAddress) cinfo.push(data.customerAddress)
  if (cinfo.length) {
    doc.text(cinfo.join('  ·  '), margin, y, { maxWidth: contentW })
    y += 5
  }
  y += 4

  // ── Items Table ──
  const si = (s: number) => ({ cellWidth: s, halign: 'right' as const })
  const ci = (s: number) => ({ cellWidth: s, halign: 'center' as const })
  const li = (s: number) => ({ cellWidth: s, halign: 'left' as const })

  if (showGst) {
    autoTable(doc, {
      startY: y,
      head: [['#', 'Item', 'HSN', 'Qty', 'Rate', 'Taxable', 'GST', 'Total']],
      body: derivedItems.map((item, i) => [
        String(i + 1),
        item.name.substring(0, 22),
        item.hsn || '—',
        String(item.qty),
        rs(item.price),
        rs(item.taxable),
        `${item.gstRate}%\n${rs(item.gstAmt)}`,
        rs(item.lineTotal),
      ]),
      theme: 'plain',
      headStyles: {
        fillColor: dark as any,
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 7, textColor: dark as any },
      alternateRowStyles: { fillColor: lightBg as any },
      tableLineColor: [226, 232, 240],
      tableLineWidth: 0.3,
      columnStyles: {
        0: ci(8), 1: li(42), 2: ci(14),
        3: ci(10), 4: si(18), 5: si(18),
        6: si(20), 7: si(20),
      },
      margin: { left: margin, right: margin },
    })
  } else {
    autoTable(doc, {
      startY: y,
      head: [['#', 'Item', 'Qty', 'Rate', 'Amount']],
      body: derivedItems.map((item, i) => [
        String(i + 1),
        item.name.substring(0, 28),
        String(item.qty),
        rs(item.price),
        rs(item.lineTotal),
      ]),
      theme: 'plain',
      headStyles: {
        fillColor: dark as any,
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 7, textColor: dark as any },
      alternateRowStyles: { fillColor: lightBg as any },
      tableLineColor: [226, 232, 240],
      tableLineWidth: 0.3,
      columnStyles: {
        0: ci(8), 1: li(68), 2: ci(12),
        3: si(24), 4: si(30),
      },
      margin: { left: margin, right: margin },
    })
  }

  // @ts-ignore
  y = doc.lastAutoTable.finalY + 10

  // ── Totals ──
  const rx = pw - margin
  const lx = rx - 55

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...midGray)
  doc.text('Subtotal', lx, y)
  doc.text(rs(derivedSubtotal), rx, y, { align: 'right' })
  y += 5.5

  if (showGst) {
    const gstRate = derivedItems[0]?.gstRate
    const label = gstRate ? `GST (${gstRate}%)` : 'GST'
    doc.text(label, lx, y)
    doc.text(rs(derivedTax), rx, y, { align: 'right' })
    y += 5.5
  } else if (derivedTax > 0) {
    doc.text('Tax', lx, y)
    doc.text(rs(derivedTax), rx, y, { align: 'right' })
    y += 5.5
  }

  // Separator
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.5)
  doc.line(lx, y, rx, y)
  y += 7

  // Grand Total
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...accent)
  doc.text('Grand Total', lx, y)
  doc.text(rs(derivedTotal), rx, y, { align: 'right' })
  y += 20

  // ── Amount in Words ──
  doc.setFillColor(...lightBg)
  doc.roundedRect(margin, y - 2, contentW, 12, 2, 2, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...midGray)
  doc.text(`Amount in Words: Rupees ${numberToWords(Math.round(derivedTotal))} Only`, margin + 4, y + 4)
  y += 16

  // ── Payment ──
  if (data.upiId) {
    // QR dominates
    try {
      const upiQrStr = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.businessName)}&am=${data.total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(data.invoiceNumber)}`
      const qrDataUrl = await QRCode.toDataURL(upiQrStr, {
        width: 160, margin: 1, color: { dark: '#1e293b', light: '#ffffff' },
      })
      const qrSize = 34
      const qrX = pw / 2 - qrSize / 2
      doc.addImage(qrDataUrl, 'PNG', qrX, y, qrSize, qrSize)
      y += qrSize + 4
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...dark)
      doc.text('Scan to Pay', pw / 2, y, { align: 'center' })
      y += 6
    } catch { }

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...midGray)
    doc.text(`UPI ID: ${data.upiId}`, margin, y)
    y += 6
  }

  if (data.bankDetails) {
    if (data.upiId) {
      doc.setFontSize(7)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(...gray)
      doc.text('or Bank Transfer', pw / 2, y, { align: 'center' })
      y += 6
    }
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...midGray)
    const bLines: { l: string; v: string }[] = []
    if (data.bankDetails.accountHolder) bLines.push({ l: 'A/c Holder', v: data.bankDetails.accountHolder })
    if (data.bankDetails.bankName) bLines.push({ l: 'Bank', v: data.bankDetails.bankName })
    if (data.bankDetails.accountNumber) bLines.push({ l: 'A/c No.', v: data.bankDetails.accountNumber })
    if (data.bankDetails.ifsc) bLines.push({ l: 'IFSC', v: data.bankDetails.ifsc })
    for (const bl of bLines) {
      doc.text(`${bl.l}: ${bl.v}`, margin, y)
      y += 4
    }
    y += 4
  }

  // ── Authorized Signatory ──
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...midGray)
  doc.text('Authorized Signatory', pw - margin, y, { align: 'right' })
  y += 3
  doc.setDrawColor(148, 163, 184)
  doc.setLineWidth(0.3)
  doc.line(pw - margin - 40, y, pw - margin, y)
  y += 12

  // ── Footer ──
  const footerY = 272
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.4)
  doc.line(margin + 8, footerY, pw - margin - 8, footerY)

  let fy = footerY + 5

  if (data.invoiceFooter) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...midGray)
    doc.text(data.invoiceFooter, pw / 2, fy, { align: 'center' })
    fy += 6
  }

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6.5)
  doc.setTextColor(...gray)
  doc.text(
    isBill
      ? 'This is a computer-generated bill for business records.'
      : 'This is a computer-generated tax invoice.',
    pw / 2, fy, { align: 'center' }
  )
  fy += 5
  if (!data.whiteLabel) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.5)
    doc.setTextColor(...gray)
    doc.text('Powered by BillZo', pw / 2, fy, { align: 'center' })
  }

  return doc
}

function formatIndianMoney(n: number): string {
  return `Rs. ${n.toLocaleString('en-IN')}`
}

export async function printInvoicePDF(data: InvoiceData): Promise<void> {
  const doc = await generateInvoicePDF(data)
  const blob = (doc as any).output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

export async function downloadInvoicePDF(data: InvoiceData) {
  const doc = await generateInvoicePDF(data)
  doc.save(`${data.invoiceNumber}.pdf`)
}

export function getWhatsAppShareLink(data: InvoiceData, paymentUrl?: string | null, overrideMessage?: string | null): string {
  const isBill = data.documentType === 'bill'
  const taxBreakup = !isBill && data.items.some(i => i.gstRate && i.gstRate > 0)
    ? `CGST ${data.items[0]?.gstRate ? data.items[0].gstRate / 2 : 0}% + SGST ${data.items[0]?.gstRate ? data.items[0].gstRate / 2 : 0}%`
    : ''

  const message = overrideMessage?.trim()
    ? overrideMessage.trim()
    : `*${isBill ? 'BILL' : 'TAX INVOICE'}*\n\n`
      + `${isBill ? 'Bill' : 'Invoice'} #: ${data.invoiceNumber}\n`
      + `Date: ${data.date}\n\n`
      + `*Items:*\n`
      + data.items.map(item => {
        const gstNote = !isBill && item.gstRate ? ` @ ${item.gstRate}% GST` : ''
        return `${item.name} x${item.qty} = ₹${(item.price * item.qty).toFixed(0)}${gstNote}`
      }).join('\n') + `\n\n`
      + `${taxBreakup ? `Tax: ${taxBreakup}\n` : ''}`
      + `*Total: ₹${data.total.toFixed(0)}*`
      + (paymentUrl ? `\n\n*Pay here:* ${paymentUrl}` : '')
      + `\n\nFrom: ${data.businessName}`
      + (data.businessGstin ? ` | GSTIN: ${data.businessGstin}` : '')

  const encodedMessage = encodeURIComponent(message)

  if (data.customerPhone) {
    const phone = data.customerPhone.replace(/\D/g, '')
    return `https://wa.me/${phone}?text=${encodedMessage}`
  }

  return `https://wa.me/?text=${encodedMessage}`
}

// ── Reports (unchanged below) ──

export function generateSalesReportPDF(
  metrics: SalesMetrics,
  businessName: string,
  dateRangeLabel: string
): jsPDF {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Sales Report', pageWidth / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`${businessName}`, pageWidth / 2, y, { align: 'center' })
  y += 6
  doc.text(dateRangeLabel || 'This Month', pageWidth / 2, y, { align: 'center' })
  y += 10

  doc.setDrawColor(200, 200, 200)
  doc.line(20, y, pageWidth - 20, y)
  y += 10

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Summary', 20, y)
  y += 10

  const summaryData = [
    ['Total Sales', formatINR(metrics.thisMonth)],
    ['Previous Period', formatINR(metrics.lastMonth)],
    ['Growth', `${metrics.trend >= 0 ? '+' : ''}${metrics.trend}%`],
    ['Invoice Count', String(metrics.invoiceCount)],
    ['Avg Invoice Value', formatINR(metrics.avgInvoiceValue)],
  ]
  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: summaryData,
    theme: 'striped',
    headStyles: { fillColor: [22, 128, 45] },
    margin: { left: 20, right: 20 },
    styles: { fontSize: 10 },
  })
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 15

  if (metrics.topCustomers.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Top Customers', 20, y)
    y += 5
    const customerData = metrics.topCustomers.map((c, i) => [
      String(i + 1),
      c.name,
      c.phone,
      formatINR(c.totalAmount),
      String(c.invoiceCount),
    ])
    autoTable(doc, {
      startY: y,
      head: [['#', 'Name', 'Phone', 'Total', 'Invoices']],
      body: customerData,
      theme: 'striped',
      headStyles: { fillColor: [22, 128, 45] },
      margin: { left: 20, right: 20 },
      styles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 50 }, 2: { cellWidth: 40 }, 3: { cellWidth: 35 }, 4: { cellWidth: 25 } },
    })
    // @ts-ignore
    y = doc.lastAutoTable.finalY + 15
  }

  if (metrics.topProducts.length > 0) {
    if (y > 240) { doc.addPage(); y = 20 }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Top Products', 20, y)
    y += 5
    const productData = metrics.topProducts.map((p, i) => [
      String(i + 1),
      p.name,
      String(p.qty),
      formatINR(p.revenue),
    ])
    autoTable(doc, {
      startY: y,
      head: [['#', 'Product', 'Units Sold', 'Revenue']],
      body: productData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
      margin: { left: 20, right: 20 },
      styles: { fontSize: 9 },
    })
    // @ts-ignore
    y = doc.lastAutoTable.finalY + 15
  }

  doc.setFontSize(9)
  doc.setTextColor(128)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, pageWidth / 2, 285, { align: 'center' })

  return doc
}

export function generateGSTReportPDF(
  report: GSTReport,
  businessName: string,
  businessGstin?: string,
  monthLabel?: string
): jsPDF {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('GST Report (GSTR-1 Format)', pageWidth / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`${businessName}${businessGstin ? ` | GSTIN: ${businessGstin}` : ''}`, pageWidth / 2, y, { align: 'center' })
  y += 6
  if (monthLabel) { doc.text(monthLabel, pageWidth / 2, y, { align: 'center' }); y += 6 }
  y += 8

  doc.setDrawColor(200, 200, 200)
  doc.line(20, y, pageWidth - 20, y)
  y += 10

  const summaryData = [
    ['Total Sales (Excl. Tax)', formatINR(report.taxableAmount)],
    ['Output GST', formatINR(report.outputGST)],
    ['CGST', formatINR(report.cgst)],
    ['SGST', formatINR(report.sgst)],
    ['Net GST Payable', formatINR(report.netGST)],
    ['Invoice Count', String(report.invoiceCount)],
  ]
  autoTable(doc, {
    startY: y,
    head: [['GST Summary', 'Amount']],
    body: summaryData,
    theme: 'striped',
    headStyles: { fillColor: [14, 116, 144] },
    margin: { left: 20, right: 20 },
    styles: { fontSize: 10 },
  })
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 15

  if (report.hsnBreakdown.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('HSN-wise Summary', 20, y)
    y += 5
    const hsnData = report.hsnBreakdown.map(h => [
      h.hsn,
      h.description || '-',
      String(h.qty),
      formatINR(h.taxableValue),
      `${h.rate}%`,
      formatINR(h.cgst + h.sgst),
      formatINR(h.total),
    ])
    autoTable(doc, {
      startY: y,
      head: [['HSN', 'Description', 'Qty', 'Taxable Value', 'Rate', 'Tax (CGST+SGST)', 'Total']],
      body: hsnData,
      theme: 'striped',
      headStyles: { fillColor: [14, 116, 144] },
      margin: { left: 20, right: 20 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 20 }, 1: { cellWidth: 40 }, 2: { cellWidth: 15 },
        3: { cellWidth: 30 }, 4: { cellWidth: 15 }, 5: { cellWidth: 30 }, 6: { cellWidth: 25 },
      },
    })
    // @ts-ignore
    y = doc.lastAutoTable.finalY + 15
  }

  doc.setFontSize(9)
  doc.setTextColor(128)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} | This is a computer-generated report`, pageWidth / 2, 285, { align: 'center' })

  return doc
}

export function generateAgingReportPDF(
  buckets: AgingBucket[],
  businessName: string
): jsPDF {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Aging Report', pageWidth / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(businessName, pageWidth / 2, y, { align: 'center' })
  y += 10

  doc.setDrawColor(200, 200, 200)
  doc.line(20, y, pageWidth - 20, y)
  y += 10

  const totalOutstanding = buckets.reduce((s, b) => s + b.amount, 0)
  const totalInvoices = buckets.reduce((s, b) => s + b.count, 0)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`Outstanding: ${formatINR(totalOutstanding)} (${totalInvoices} invoices)`, 20, y)
  y += 10

  for (const bucket of buckets) {
    if (bucket.count === 0) continue
    if (y > 230) { doc.addPage(); y = 20 }

    autoTable(doc, {
      startY: y,
      head: [[`${bucket.label} (${formatINR(bucket.amount)})`, `${bucket.count} invoices`]],
      body: bucket.invoices.map(inv => [inv.customerName, inv.customerPhone || '-', formatINR(inv.amount), `${inv.days}d`]),
      headStyles: { fillColor: [100, 116, 139] },
      margin: { left: 20, right: 20 },
      styles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 45 }, 2: { cellWidth: 35 }, 3: { cellWidth: 25 } },
    })
    // @ts-ignore
    y = doc.lastAutoTable.finalY + 10
  }

  doc.setFontSize(9)
  doc.setTextColor(128)
  doc.text(`Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, pageWidth / 2, 285, { align: 'center' })

  return doc
}

export function downloadSalesReportPDF(metrics: SalesMetrics, businessName: string, dateRangeLabel: string) {
  const doc = generateSalesReportPDF(metrics, businessName, dateRangeLabel)
  doc.save(`sales-report-${new Date().toISOString().slice(0, 10)}.pdf`)
}

export function downloadGSTReportPDF(report: GSTReport, businessName: string, businessGstin?: string, monthLabel?: string) {
  const doc = generateGSTReportPDF(report, businessName, businessGstin, monthLabel)
  doc.save(`gst-report-${new Date().toISOString().slice(0, 10)}.pdf`)
}

export function downloadAgingReportPDF(buckets: AgingBucket[], businessName: string) {
  const doc = generateAgingReportPDF(buckets, businessName)
  doc.save(`aging-report-${new Date().toISOString().slice(0, 10)}.pdf`)
}
