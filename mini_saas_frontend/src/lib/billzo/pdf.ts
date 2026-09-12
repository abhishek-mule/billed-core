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
  unit?: string
}

export interface BankDetailsData {
  bankName?: string
  branch?: string
  accountNumber?: string
  ifsc?: string
  accountHolder?: string
}

export interface InvoiceData {
  invoiceNumber: string
  date: string
  createdAtIso?: string
  customerName: string
  customerPhone?: string
  customerGstin?: string
  customerAddress?: string
  items: InvoiceItem[]
  subtotal: number
  tax: number
  total: number
  amountReceived?: number
  discount?: number
  description?: string
  terms?: string
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

const STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Puducherry', '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra', '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}

function formatStatePlace(s: string | undefined): string | null {
  if (!s) return null
  const code = s.trim().slice(0, 2)
  const name = STATE_CODES[code]
  if (!name) return s.trim()
  return code === s.trim() ? `${code} - ${name}` : s.trim()
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
  const doc = new jsPDF() // A4 portrait (210 × 297 mm)
  const pw = 210
  const ph = 297
  const margin = 14
  const rx = pw - margin
  const contentW = pw - margin * 2

  const navy: [number, number, number] = [13, 34, 59]     // #0D223B
  const teal: [number, number, number] = [41, 151, 135]   // #299787
  const midGray = [100, 116, 139] as const
  const lightBg = [246, 248, 250] as const
  const border = [214, 220, 228] as const

  const isBill = data.documentType === 'bill'
  const showGst = !isBill && data.items.some(i => i.gstRate && i.gstRate > 0)

  // ── Derive line finances from items (authoritative — never trust passed totals) ──
  const derivedItems = data.items.map(item => {
    const lineTotal = Math.round(item.price * item.qty)
    const rate = item.gstRate || 0
    const taxable = rate > 0 ? Math.round(lineTotal * 100 / (100 + rate)) : lineTotal
    const gstAmt = lineTotal - taxable
    const cgst = Math.round(gstAmt / 2)
    const sgst = gstAmt - cgst
    return { ...item, lineTotal, taxable, gstAmt, cgst, sgst }
  })
  const grossSubtotal = derivedItems.reduce((s, i) => s + i.lineTotal, 0)
  const taxableTotal = derivedItems.reduce((s, i) => s + i.taxable, 0)
  const cgstTotal = derivedItems.reduce((s, i) => s + i.cgst, 0)
  const sgstTotal = derivedItems.reduce((s, i) => s + i.sgst, 0)
  const gstTotal = cgstTotal + sgstTotal
  const discount = Math.max(0, data.discount || 0)
  const invoiceTotal = Math.max(0, grossSubtotal - discount)
  const received = Math.max(0, data.amountReceived || 0)
  const balance = Math.max(0, invoiceTotal - received)

  // Interstate vs intrastate classification — show IGST OR CGST+SGST, never both.
  const merchantCode = data.businessGstin ? data.businessGstin.slice(0, 2) : undefined
  const supplyCode = data.placeOfSupply ? data.placeOfSupply.trim().slice(0, 2) : undefined
  const interState = showGst && Boolean(merchantCode && supplyCode && merchantCode !== supplyCode)

  function money(n: number): string {
    return `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function fmtDate(iso?: string, fallback = ''): string {
    if (!iso) return fallback
    const d = new Date(iso)
    if (isNaN(d.getTime())) return fallback
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function fmtTime(iso?: string): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    let h = d.getHours()
    const m = d.getMinutes().toString().padStart(2, '0')
    const ap = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    return `${h}:${m} ${ap}`
  }

  let y = margin

  // ══ HEADER — merchant identity (left), TAX INVOICE (dominant, right) ══
  let logoRight = margin
  if (data.logo) {
    try {
      doc.addImage(data.logo, 'PNG', margin, y - 3, 11, 11)
      logoRight = margin + 14
    } catch { /* logo optional */ }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(21)
  doc.setTextColor(...navy)
  doc.text(data.businessName, logoRight, y, { maxWidth: contentW * 0.53 })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(...navy)
  doc.text(isBill ? 'BILL' : 'TAX INVOICE', rx, y, { align: 'right' })

  // Invoice metadata pod — right-aligned under the document title (strong identity)
  const invMeta: [string, string][] = [
    ['Invoice No.', data.invoiceNumber],
    ['Date', fmtDate(data.createdAtIso, data.date)],
  ]
  if (data.createdAtIso) invMeta.push(['Time', fmtTime(data.createdAtIso)])
  if (showGst) {
    const code = data.placeOfSupply ? data.placeOfSupply.trim().slice(0, 2) : undefined
    const short = code ? (STATE_CODES[code] || data.placeOfSupply!.trim()) : data.placeOfSupply
    if (short) invMeta.push(['Place of Supply', short])
  }
  const metaLabelX = rx - 56
  const podTop = y + 9
  let podY = podTop
  doc.setFontSize(9.5)
  for (const [label, value] of invMeta) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...midGray)
    doc.text(label, metaLabelX, podY)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...navy)
    doc.text(String(value), rx, podY, { align: 'right', maxWidth: 56 })
    podY += 6.4
  }
  const podBottom = invMeta.length ? podY - 6.6 : podTop - 4

  // Merchant contact lines (left, under the business name)
  const merchantMeta: string[] = []
  if (data.businessAddress) merchantMeta.push(data.businessAddress)
  if (data.businessPhone) merchantMeta.push(`Phone: ${data.businessPhone}`)
  if (data.businessEmail) merchantMeta.push(`Email: ${data.businessEmail}`)
  if (showGst) {
    if (data.businessGstin) merchantMeta.push(`GSTIN: ${data.businessGstin}`)
    const merchantState = formatStatePlace(merchantCode)
    if (merchantState) merchantMeta.push(`State: ${merchantState}`)
    if (data.businessPan) merchantMeta.push(`PAN: ${data.businessPan}`)
  }
  let merchantY = podTop
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...midGray)
  for (const line of merchantMeta) {
    doc.text(line, logoRight, merchantY, { maxWidth: contentW * 0.5 })
    merchantY += 5.2
  }
  const merchantBottom = merchantMeta.length ? merchantY - 5.4 : podTop - 4

  // Brand accent rule below the tallest of the two columns
  y = Math.max(merchantBottom, podBottom) + 4
  doc.setDrawColor(...teal)
  doc.setLineWidth(0.7)
  doc.line(margin, y, rx, y)
  y += 8

  // ══ BILL TO — full width, prominent ══
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...midGray)
  doc.text('Bill To', margin, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...navy)
  doc.text(data.customerName, margin, y, { maxWidth: contentW * 0.7 })
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...midGray)
  const customerLines: string[] = []
  if (data.customerAddress) customerLines.push(data.customerAddress)
  if (data.customerPhone) customerLines.push(`Contact: ${data.customerPhone}`)
  if (showGst && data.customerGstin) customerLines.push(`GSTIN: ${data.customerGstin}`)
  for (const line of customerLines) {
    doc.text(line, margin, y, { maxWidth: contentW * 0.7 })
    y += 5
  }
  y += 3

  // ══ ITEMS TABLE — large, readable columns ══
  const showUnit = derivedItems.some(i => i.unit)
  const qtyIdx = showGst ? 3 : 2
  const unitIdx = showUnit ? (showGst ? 4 : 3) : -1
  const rateIdx = showUnit ? (showGst ? 5 : 4) : (showGst ? 4 : 3)
  const amtIdx = rateIdx + 1

  const tableHead = [
    '#',
    'Item',
    ...(showGst ? ['HSN/SAC'] : []),
    'Qty',
    ...(showUnit ? ['Unit'] : []),
    'Rate',
    'Amount',
  ]

  const tableBody = derivedItems.map((item, i) => [
    String(i + 1),
    item.name.substring(0, 36),
    ...(showGst ? [item.hsn || '—'] : []),
    String(item.qty),
    ...(showUnit ? [item.unit || ''] : []),
    money(item.price),
    money(item.lineTotal),
  ])

  const cellPad = { top: 2.5, bottom: 2.5, left: 2, right: 2 }
  autoTable(doc, {
    startY: y,
    head: [tableHead],
    body: tableBody,
    theme: 'plain',
    headStyles: {
      fillColor: navy as any,
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: cellPad as any,
    },
    bodyStyles: { fontSize: 9, textColor: navy as any, cellPadding: cellPad as any },
    alternateRowStyles: { fillColor: lightBg as any },
    tableLineColor: border as any,
    tableLineWidth: 0.35,
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { halign: 'left' },
      ...(showGst ? { 2: { cellWidth: 18, halign: 'center' } } : {}),
      [qtyIdx]: { cellWidth: 15, halign: 'right' },
      ...(showUnit ? { [unitIdx]: { cellWidth: 16, halign: 'center' } } : {}),
      [rateIdx]: { cellWidth: 32, halign: 'right' },
      [amtIdx]: { cellWidth: 36, halign: 'right' },
    } as any,
    margin: { left: margin, right: margin },
  })

  // @ts-ignore
  y = doc.lastAutoTable.finalY + 8
  if (y > 254) {
    doc.addPage()
    y = 14
  }

  // ══ DESCRIPTION (left) + TOTALS (right) ══
  const blockStartY = y
  const tlX = 124
  const dX = margin
  const dW = tlX - margin - 8

  let yT = blockStartY
  const totalsRow = (label: string, value: string, opts?: { bold?: boolean; size?: number; color?: [number, number, number] }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
    doc.setFontSize(opts?.size || 9.5)
    const tc = opts?.color ?? [...midGray]
    doc.setTextColor(tc[0], tc[1], tc[2])
    doc.text(label, tlX, yT)
    doc.text(value, rx, yT, { align: 'right' })
    yT += opts?.bold ? 8 : 5.6
  }

  totalsRow('Subtotal', money(grossSubtotal))
  if (discount > 0) totalsRow('Discount', `- ${money(discount)}`)
  if (showGst) totalsRow('Taxable Amount', money(taxableTotal))
  if (showGst) {
    if (interState) {
      totalsRow('IGST', money(gstTotal))
    } else {
      if (cgstTotal > 0) totalsRow('CGST', money(cgstTotal))
      if (sgstTotal > 0) totalsRow('SGST', money(sgstTotal))
    }
  } else if (gstTotal > 0) {
    totalsRow('Tax', money(gstTotal))
  }

  yT += 2
  doc.setDrawColor(...border)
  doc.setLineWidth(0.6)
  doc.line(tlX, yT, rx, yT)
  yT += 8
  totalsRow('Invoice Total', money(invoiceTotal), { bold: true, size: 16, color: navy })
  yT += 1.5
  totalsRow('Received', money(received))
  totalsRow('Balance', money(balance), { bold: true, color: navy })

  let yD = blockStartY
  if (data.description) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...midGray)
    doc.text('Description', dX, yD)
    yD += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...navy)
    const descLines = doc.splitTextToSize(data.description, dW) as string[]
    for (const line of descLines) {
      doc.text(line, dX, yD)
      yD += 4.4
    }
    yD += 4
  }

  y = Math.max(yT, yD) + 8
  if (y > 254) {
    doc.addPage()
    y = 14
  }

  // ══ AMOUNT IN WORDS — prominent box ══
  const wordsText = `Rupees ${numberToWords(Math.round(invoiceTotal))} Only`
  doc.setFillColor(...lightBg)
  doc.roundedRect(margin, y, contentW, 14, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...midGray)
  doc.text('Invoice Amount in Words', margin + 5, y + 4.5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...navy)
  doc.text(wordsText, margin + 5, y + 10.5, { maxWidth: contentW - 10 })
  doc.setDrawColor(...border)
  doc.setLineWidth(0.4)
  doc.roundedRect(margin, y, contentW, 14, 2, 2, 'S')
  y += 17
  if (y > 258) {
    doc.addPage()
    y = 14
  }

  // ══ PAY TO / TERMS (left) + QR / SIGNATURE (right) ══
  const bottomTop = y
  let yLeft = bottomTop
  const payX = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...midGray)
  doc.text('Pay To', payX, yLeft)
  yLeft += 6

  const bk = data.bankDetails
  const bankRows: [string, string][] = []
  if (bk?.accountHolder) bankRows.push(['A/c Holder', bk.accountHolder])
  if (bk?.bankName) bankRows.push(['Bank', bk.bankName])
  if (bk?.branch) bankRows.push(['Branch', bk.branch])
  if (bk?.accountNumber) bankRows.push(['A/c No.', bk.accountNumber])
  if (bk?.ifsc) bankRows.push(['IFSC', bk.ifsc])
  doc.setFontSize(9.5)
  for (const [label, value] of bankRows) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...midGray)
    doc.text(label, payX, yLeft)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...navy)
    doc.text(value, payX + 30, yLeft, { maxWidth: 60 })
    yLeft += 5.2
  }
  if (data.upiId) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...midGray)
    doc.text('UPI ID', payX, yLeft)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...navy)
    doc.text(data.upiId, payX + 30, yLeft, { maxWidth: 60 })
    yLeft += 5.2
  }

  yLeft = Math.max(yLeft + 3, bottomTop + 28)

  const termsText = data.terms || data.paymentTerms || 'Payment is due as per agreed terms.'
  const termsFull = `Thank you for doing business with us. ${termsText}`
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...midGray)
  doc.text('Terms & Conditions', payX, yLeft)
  yLeft += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...midGray)
  const termsLines = doc.splitTextToSize(termsFull, 100) as string[]
  for (const line of termsLines) {
    doc.text(line, payX, yLeft)
    yLeft += 3.8
  }

  // Right column — QR (only ever a real UPI payment intent) then signature
  let yRight = bottomTop
  if (data.upiId) {
    try {
      const upiQrStr = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.businessName)}&am=${invoiceTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(data.invoiceNumber)}`
      const qrDataUrl = await QRCode.toDataURL(upiQrStr, {
        width: 160,
        margin: 1,
        color: { dark: '#0D223B', light: '#ffffff' },
      })
      const qrSize = 23
      const boxX = rx - qrSize
      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(...border)
      doc.setLineWidth(0.5)
      doc.roundedRect(boxX - 6, yRight - 3, qrSize + 12, qrSize + 26, 2, 2, 'S')
      doc.addImage(qrDataUrl, 'PNG', boxX, yRight, qrSize, qrSize)
      yRight += qrSize + 5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(...navy)
      doc.text('Scan to Pay', rx, yRight, { align: 'right' })
      yRight += 5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...teal)
      doc.text(money(invoiceTotal), rx, yRight, { align: 'right' })
      yRight += 5.5
      if (!data.whiteLabel) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(6.5)
        doc.setTextColor(...midGray)
        doc.text('Payment powered by BillZo', rx, yRight, { align: 'right' })
        yRight += 4
      }
      yRight += 4
    } catch { /* QR optional */ }
  }

  yRight = Math.max(yRight + 3, bottomTop + 12)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...navy)
  doc.text(`For ${data.businessName}`, rx, yRight, { align: 'right', maxWidth: 86 })
  yRight += 11
  doc.setDrawColor(...midGray)
  doc.setLineWidth(0.4)
  doc.line(rx - 50, yRight, rx, yRight)
  yRight += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...midGray)
  doc.text('Authorized Signatory', rx, yRight, { align: 'right' })

  y = Math.max(yLeft, yRight) + 2
  if (y > 280) {
    doc.addPage()
    y = 14
  }

  // ══ FOOTER — subtle BillZo branding, never a watermark ══
  const footerY = 276
  doc.setDrawColor(...teal)
  doc.setLineWidth(0.4)
  doc.line(margin + 6, footerY, rx - 6, footerY)

  let fy = footerY + 5
  if (!data.whiteLabel) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...midGray)
    doc.text('Generated by BillZo', pw / 2, fy, { align: 'center' })
    fy += 4
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(6.5)
    doc.setTextColor(...midGray)
    doc.text('Simple invoicing • Smarter payment recovery', pw / 2, fy, { align: 'center' })
    fy += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text('billzo.app', pw / 2, fy, { align: 'center' })
    fy += 5
  }
  if (data.invoiceFooter) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(6.5)
    doc.setTextColor(...midGray)
    doc.text(data.invoiceFooter, pw / 2, fy, { align: 'center' })
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
