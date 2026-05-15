import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { GSTReport, SalesMetrics, AgingBucket } from './report-engine'
import { formatINR } from './report-engine'

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
  if (data.items.length > 0) {
    doc.text(`Tax (${data.items[0]?.gstRate ?? 0}%):`, 120, y)
    doc.text(`₹${data.tax.toFixed(0)}`, 155, y)
    y += 7
  }
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
    headStyles: { fillColor: [99, 102, 241] },
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
      headStyles: { fillColor: [99, 102, 241] },
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