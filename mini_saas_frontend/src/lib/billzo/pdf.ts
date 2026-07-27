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
  const gray = [100, 116, 139] as const
  const lightGray = [241, 245, 249] as const
  const dark = [51, 51, 51] as const

  const isBill = data.documentType === 'bill'
  const showGst = !isBill && data.items.some(i => i.gstRate && i.gstRate > 0)

  function drawSeparator(extra = 0) {
    doc.setDrawColor(...lightGray)
    doc.setLineWidth(0.5)
    doc.line(margin, y, pw - margin, y)
    y += 4 + extra
  }

  async function drawMerchantBlock() {
    // Logo (left) + BillZo badge (right)
    let logoHeight = 0
    if (data.logo) {
      try {
        const imgWidth = 22
        const imgHeight = 22
        doc.addImage(data.logo, 'PNG', margin, y - 2, imgWidth, imgHeight)
        logoHeight = imgHeight + 2
      } catch { }
    }

    const nameX = data.logo ? margin + 26 : margin
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...green)
    doc.text(data.businessName, nameX, y + (logoHeight > 0 ? 4 : 0))

    if (!data.whiteLabel) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...gray)
      doc.text('★ Powered by BillZo', pw - margin, y, { align: 'right' })
    }

    y += logoHeight > 0 ? logoHeight + 2 : 8

    let detailY = y
    const details: string[] = []
    if (data.businessAddress) details.push(data.businessAddress)
    if (data.businessPhone) details.push(`Ph: ${data.businessPhone}`)
    if (data.businessEmail) details.push(data.businessEmail)

    if (details.length) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...gray)
      doc.text(details.join(' | '), margin, detailY, { maxWidth: contentW })
      detailY += 4
    }

    if (!isBill) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...gray)
      if (data.businessGstin) {
        doc.text(`GSTIN: ${data.businessGstin}`, margin, detailY)
        if (data.businessPan) {
          doc.text(`PAN: ${data.businessPan}`, margin + 70, detailY)
        }
      } else if (data.businessPan) {
        doc.text(`PAN: ${data.businessPan}`, margin, detailY)
      }
      detailY += 5
    }

    y = detailY
  }

  function drawDocumentTitle() {
    const title = isBill ? 'BILL' : 'TAX INVOICE'
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...green)
    doc.text(title, pw / 2, y, { align: 'center' })
    y += 8
  }

  function drawInvoiceMeta() {
    const metaLeft = [
      `${isBill ? 'Bill' : 'Invoice'} #: ${data.invoiceNumber}`,
      `Date: ${data.date}`,
    ]
    const metaRight: string[] = []
    if (!isBill && data.placeOfSupply) metaRight.push(`Place of Supply: ${data.placeOfSupply}`)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...dark)
    doc.text(metaLeft.join(' | '), margin, y)
    if (metaRight.length) {
      doc.text(metaRight.join(' | '), pw - margin, y, { align: 'right' })
    }
    y += 6
  }

  function drawCustomerBlock() {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...gray)
    doc.text('Bill To:', margin, y)
    y += 5
    doc.setTextColor(...dark)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(data.customerName, margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const lines: string[] = []
    if (data.customerPhone) lines.push(`Phone: ${data.customerPhone}`)
    if (!isBill && data.customerGstin) lines.push(`GSTIN: ${data.customerGstin}`)
    if (data.customerAddress) lines.push(data.customerAddress)
    if (lines.length) {
      doc.text(lines.join(' · '), margin, y)
      y += 4
    }
    y += 4
  }

  async function drawItemsTable() {
    const tableColumns = showGst
      ? ['#', 'HSN', 'Item', 'Qty', 'Rate', 'Taxable', 'CGST', 'SGST', 'Total']
      : ['#', 'Item', 'Qty', 'Rate', 'Amount']

    const tableBody = data.items.map((item, i) => {
      const lineTotal = item.price * item.qty
      const taxable = item.gstRate ? Math.round(lineTotal * 100 / (100 + item.gstRate)) : lineTotal
      const gstAmt = item.gstRate ? Math.round(taxable * item.gstRate / 100) : 0
      const cgst = Math.round(gstAmt / 2)
      const sgst = gstAmt - cgst
      if (showGst) {
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
      columnStyles: showGst
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
  }

  function drawTotals() {
    const totalX = pw - margin - 60
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...gray)
    doc.text('Subtotal:', totalX, y)
    doc.text(`₹${data.subtotal.toFixed(0)}`, pw - margin, y, { align: 'right' })
    y += 5

    if (showGst) {
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

    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...gray)
    doc.text(`Rupees ${numberToWords(Math.round(data.total))} Only`, margin, y)
    y += 8
  }

  async function drawPaymentBlock() {
    const hasAnyPayment = data.upiId || data.bankDetails
    if (!hasAnyPayment) return

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...dark)
    doc.text('Payment', margin, y)
    y += 7

    const qrSize = 32
    let qrY = y
    if (data.upiId) {
      try {
        const upiQrStr = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.businessName)}&am=${data.total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(data.invoiceNumber)}`
        const qrDataUrl = await QRCode.toDataURL(upiQrStr, {
          width: 120,
          margin: 1,
          color: { dark: '#1e293b', light: '#ffffff' },
        })
        qrY = y
        const qrX = pw / 2 - qrSize / 2
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(...dark)
        doc.text('Scan to Pay', pw / 2, y, { align: 'center' })
        y += 4
        qrY += 4
        doc.addImage(qrDataUrl, 'PNG', qrX, y, qrSize, qrSize)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6)
        doc.setTextColor(...gray)
        doc.text('UPI', pw / 2, y + qrSize + 3, { align: 'center' })
        y += qrSize + 8
      } catch { }
    }

    if (data.upiId) {
      if (y > qrY + qrSize + 2) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7)
        doc.setTextColor(...gray)
        doc.text('— OR —', pw / 2, y, { align: 'center' })
        y += 5
      }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...dark)
      doc.text('UPI ID:', margin, y)
      doc.setFont('helvetica', 'bold')
      doc.text(data.upiId, margin + 18, y)
      y += 5
    }

    if (data.bankDetails) {
      if (data.upiId && y > qrY + qrSize + 2) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7)
        doc.setTextColor(...gray)
        doc.text('— OR —', pw / 2, y, { align: 'center' })
        y += 5
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...dark)
      doc.text('Bank Transfer', margin, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...gray)
      const bankLines: string[] = []
      if (data.bankDetails.accountHolder) bankLines.push(`A/c Holder: ${data.bankDetails.accountHolder}`)
      if (data.bankDetails.bankName) bankLines.push(`Bank: ${data.bankDetails.bankName}`)
      if (data.bankDetails.accountNumber) bankLines.push(`A/c: ${data.bankDetails.accountNumber}`)
      if (data.bankDetails.ifsc) bankLines.push(`IFSC: ${data.bankDetails.ifsc}`)
      for (const line of bankLines) {
        doc.text(line, margin, y)
        y += 4
      }
    }

    y += 4
  }

  function drawFooter() {
    if (isBill) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(7)
      doc.setTextColor(...gray)
      doc.text('This document is generated for business records and payment collection. It is not a GST Tax Invoice.', pw / 2, y, { align: 'center' })
      y += 5
    }

    drawSeparator(0)

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(6)
    doc.setTextColor(...gray)
    doc.text('Thank you for your business. We appreciate your trust.', margin, y)
    y += 3

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...gray)
    if (!data.whiteLabel) {
      doc.text(`This is a computer-generated ${isBill ? 'bill' : 'tax invoice'} from ★ BillZo  •  ${data.invoiceNumber}`, pw / 2, 285, { align: 'center' })
    } else {
      doc.text(`${isBill ? 'Bill' : 'Invoice'} #${data.invoiceNumber}  •  Generated on ${data.date}`, pw / 2, 285, { align: 'center' })
    }
  }

  // ── Assemble Document ──
  await drawMerchantBlock()
  drawSeparator(2)
  drawDocumentTitle()
  drawInvoiceMeta()
  drawSeparator(2)
  drawCustomerBlock()
  await drawItemsTable()
  drawTotals()
  drawSeparator(4)
  await drawPaymentBlock()
  drawSeparator(4)
  drawFooter()

  return doc
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

export function getWhatsAppShareLink(data: InvoiceData): string {
  const isBill = data.documentType === 'bill'
  const taxBreakup = !isBill && data.items.some(i => i.gstRate && i.gstRate > 0)
    ? `CGST ${data.items[0]?.gstRate ? data.items[0].gstRate / 2 : 0}% + SGST ${data.items[0]?.gstRate ? data.items[0].gstRate / 2 : 0}%`
    : ''

  const message = `*${isBill ? 'BILL' : 'TAX INVOICE'}*\n\n`
    + `${isBill ? 'Bill' : 'Invoice'} #: ${data.invoiceNumber}\n`
    + `Date: ${data.date}\n\n`
    + `*Items:*\n`
    + data.items.map(item => {
      const gstNote = !isBill && item.gstRate ? ` @ ${item.gstRate}% GST` : ''
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
