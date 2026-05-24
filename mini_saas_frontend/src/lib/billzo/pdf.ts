import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'
import type { GSTReport, SalesMetrics, AgingBucket } from './report-engine'
import { formatINR } from './report-engine'

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
  businessGstin?: string
  businessPan?: string
  businessAddress?: string
  bankDetails?: BankDetailsData
  upiId?: string
  whiteLabel?: boolean
  placeOfSupply?: string
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
  const margin = 16
  const contentW = pw - margin * 2
  let y = margin

  const green = [22, 128, 45] as const
  const lightGreen = [237, 248, 240] as const
  const gray = [100, 116, 139] as const
  const lightGray = [241, 245, 249] as const

  // ── Header: Dual Branding ──
  // Merchant name (left) + BillZo badge (right)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...green)
  doc.text(data.businessName, margin, y)

  if (!data.whiteLabel) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...gray)
    doc.text('★ Powered by BillZo', pw - margin, y, { align: 'right' })
  }
  y += 6

  // Merchant details line
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...gray)
  const detailParts: string[] = []
  if (data.businessAddress) detailParts.push(data.businessAddress)
  if (data.businessPhone) detailParts.push(`Ph: ${data.businessPhone}`)
  doc.text(detailParts.join(' | '), margin, y, { maxWidth: contentW })
  y += 4

  doc.setFont('helvetica', 'bold')
  if (data.businessGstin) {
    doc.text(`GSTIN: ${data.businessGstin}`, margin, y)
    if (data.businessPan) {
      doc.text(`PAN: ${data.businessPan}`, margin + 70, y)
    }
  } else if (data.businessPan) {
    doc.text(`PAN: ${data.businessPan}`, margin, y)
  }
  y += 6

  // ── Separator ──
  doc.setDrawColor(...lightGray)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pw - margin, y)
  y += 6

  // ── TAX INVOICE title ──
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...green)
  doc.text('TAX INVOICE', pw / 2, y, { align: 'center' })
  y += 8

  // ── Invoice meta row ──
  const metaLeft = [
    `Invoice #: ${data.invoiceNumber}`,
    `Date: ${data.date}`,
  ]
  const metaRight: string[] = []
  if (data.placeOfSupply) metaRight.push(`Place of Supply: ${data.placeOfSupply}`)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(51, 51, 51)
  doc.text(metaLeft.join(' | '), margin, y)
  if (metaRight.length) {
    doc.text(metaRight.join(' | '), pw - margin, y, { align: 'right' })
  }
  y += 6

  // ── Separator ──
  doc.setDrawColor(...lightGray)
  doc.line(margin, y, pw - margin, y)
  y += 6

  // ── Bill To ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...gray)
  doc.text('Bill To:', margin, y)
  y += 5
  doc.setTextColor(51, 51, 51)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(data.customerName, margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const customerLines: string[] = []
  if (data.customerPhone) customerLines.push(`Phone: ${data.customerPhone}`)
  if (data.customerGstin) customerLines.push(`GSTIN: ${data.customerGstin}`)
  if (data.customerAddress) customerLines.push(data.customerAddress)
  if (customerLines.length) {
    doc.text(customerLines.join(' · '), margin, y)
    y += 4
  }
  y += 4

  // ── Items Table ──
  const hasGst = data.items.some(i => i.gstRate && i.gstRate > 0)
  const tableColumns = hasGst
    ? ['#', 'HSN', 'Item', 'Qty', 'Rate', 'Taxable', 'CGST', 'SGST', 'Total']
    : ['#', 'Item', 'Qty', 'Rate', 'Amount']

  const tableBody = data.items.map((item, i) => {
    const lineTotal = item.price * item.qty
    const taxable = item.gstRate ? Math.round(lineTotal * 100 / (100 + item.gstRate)) : lineTotal
    const gstAmt = item.gstRate ? Math.round(taxable * item.gstRate / 100) : 0
    const cgst = Math.round(gstAmt / 2)
    const sgst = gstAmt - cgst
    if (hasGst) {
      return [
        String(i + 1),
        item.hsn || '-',
        item.name.substring(0, 20),
        String(item.qty),
        `₹${item.price}`,
        `₹${taxable}`,
        item.gstRate ? `${item.gstRate / 2}%\n₹${cgst}` : '-',
        item.gstRate ? `${item.gstRate / 2}%\n₹${sgst}` : '-',
        `₹${lineTotal}`,
      ]
    }
    return [String(i + 1), item.name.substring(0, 28), String(item.qty), `₹${item.price}`, `₹${lineTotal}`]
  })

  autoTable(doc, {
    startY: y,
    head: [tableColumns],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: green as any,
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: { fontSize: 7, halign: 'center' },
    columnStyles: hasGst
      ? {
          0: { cellWidth: 8 },
          1: { cellWidth: 14 },
          2: { cellWidth: 40 },
          3: { cellWidth: 10 },
          4: { cellWidth: 14 },
          5: { cellWidth: 16 },
          6: { cellWidth: 18 },
          7: { cellWidth: 18 },
          8: { cellWidth: 18 },
        }
      : {
          0: { cellWidth: 8 },
          1: { cellWidth: 60 },
          2: { cellWidth: 12 },
          3: { cellWidth: 20 },
          4: { cellWidth: 25 },
        },
    margin: { left: margin, right: margin },
  })

  // @ts-ignore
  y = doc.lastAutoTable.finalY + 6

  // ── Totals ──
  const totalX = pw - margin - 60
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...gray)
  doc.text('Subtotal:', totalX, y)
  doc.text(`₹${data.subtotal.toFixed(0)}`, pw - margin, y, { align: 'right' })
  y += 5

  if (hasGst) {
    const totalCgst = Math.round(data.tax / 2)
    const totalSgst = data.tax - totalCgst
    doc.text('CGST:', totalX, y)
    doc.text(`₹${totalCgst.toFixed(0)}`, pw - margin, y, { align: 'right' })
    y += 5
    doc.text('SGST:', totalX, y)
    doc.text(`₹${totalSgst.toFixed(0)}`, pw - margin, y, { align: 'right' })
    y += 5
  } else {
    doc.text('Tax:', totalX, y)
    doc.text(`₹${data.tax.toFixed(0)}`, pw - margin, y, { align: 'right' })
    y += 5
  }

  doc.setDrawColor(...lightGray)
  doc.line(totalX, y, pw - margin, y)
  y += 5

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...green)
  doc.text('Total:', totalX, y)
  doc.text(`₹${data.total.toFixed(0)}`, pw - margin, y, { align: 'right' })
  y += 7

  // ── Amount in Words ──
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...gray)
  doc.text(`Rupees ${numberToWords(Math.round(data.total))} Only`, margin, y)
  y += 8

  // ── Separator ──
  doc.setDrawColor(...lightGray)
  doc.line(margin, y, pw - margin, y)
  y += 6

  // ── Bottom Section: Payment Info + QR ──
  const bottomY = y
  const leftColX = margin
  const rightColX = pw / 2 + 4

  // Left column: Bank Details
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(51, 51, 51)
  doc.text('Payment Details', leftColX, bottomY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...gray)
  let bankY = bottomY + 5
  if (data.bankDetails?.accountHolder) {
    doc.text(`A/c Holder: ${data.bankDetails.accountHolder}`, leftColX, bankY)
    bankY += 4
  }
  if (data.bankDetails?.bankName) {
    doc.text(`Bank: ${data.bankDetails.bankName}`, leftColX, bankY)
    bankY += 4
  }
  if (data.bankDetails?.accountNumber) {
    doc.text(`A/c No: ${data.bankDetails.accountNumber}`, leftColX, bankY)
    bankY += 4
  }
  if (data.bankDetails?.ifsc) {
    doc.text(`IFSC: ${data.bankDetails.ifsc}`, leftColX, bankY)
    bankY += 4
  }
  if (data.upiId) {
    doc.text(`UPI: ${data.upiId}`, leftColX, bankY)
    bankY += 4
  }

  // Right column: QR Code
  if (data.upiId) {
    try {
      const upiQrStr = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.businessName)}&am=${data.total}&tn=INV%20${encodeURIComponent(data.invoiceNumber)}`
      const qrDataUrl = await QRCode.toDataURL(upiQrStr, {
        width: 90,
        margin: 1,
        color: { dark: '#1e293b', light: '#ffffff' },
      })
      doc.addImage(qrDataUrl, 'PNG', rightColX, bottomY, 32, 32)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5)
      doc.setTextColor(...gray)
      doc.text('Scan to pay via UPI', rightColX, bottomY + 35, { maxWidth: 32 })
    } catch {
      // QR generation failed silently
    }
  }

  y = Math.max(bankY + 4, bottomY + 38) + 6

  // ── Terms ──
  doc.setDrawColor(...lightGray)
  doc.line(margin, y, pw - margin, y)
  y += 4
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6)
  doc.setTextColor(...gray)
  doc.text('Thank you for your business! Payment due within 15 days.', margin, y)
  y += 3

  // ── Footer ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(...gray)
  if (!data.whiteLabel) {
    doc.text(`This is a computer-generated invoice from ★ BillZo  •  ${data.invoiceNumber}`, pw / 2, 285, { align: 'center' })
  } else {
    doc.text(`Invoice #${data.invoiceNumber}  •  Generated on ${data.date}`, pw / 2, 285, { align: 'center' })
  }

  return doc
}

export async function downloadInvoicePDF(data: InvoiceData) {
  const doc = await generateInvoicePDF(data)
  doc.save(`${data.invoiceNumber}.pdf`)
}

export function getWhatsAppShareLink(data: InvoiceData): string {
  const taxBreakup = data.items.some(i => i.gstRate && i.gstRate > 0)
    ? `CGST ${data.items[0]?.gstRate ? data.items[0].gstRate / 2 : 0}% + SGST ${data.items[0]?.gstRate ? data.items[0].gstRate / 2 : 0}%`
    : ''

  const message = `*TAX INVOICE*\n\n`
    + `Invoice #: ${data.invoiceNumber}\n`
    + `Date: ${data.date}\n\n`
    + `*Items:*\n`
    + data.items.map(item => {
      const gstNote = item.gstRate ? ` @ ${item.gstRate}% GST` : ''
      return `${item.name} x${item.qty} = ₹${(item.price * item.qty).toFixed(0)}${gstNote}`
    }).join('\n') + `\n\n`
    + `${taxBreakup ? `Tax: ${taxBreakup}\n` : ''}`
    + `*Total: ₹${data.total.toFixed(0)}*\n\n`
    + `From: ${data.businessName}`
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
