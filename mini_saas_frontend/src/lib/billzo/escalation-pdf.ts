// ============================================================
// escalation-pdf.ts — Recovery Case PDF (Phase C Domain B export)
// ============================================================
//
// Renders the Recovery Case evidence pack from the immutable snapshot
// (recovery_escalations.snapshot). The snapshot is the single source of
// truth: this renderer NEVER re-queries or re-computes evidence, so the
// document cannot diverge from what the merchant saw at prepare-time.
//
// House style mirrors pdf.ts (navy/teal, A4, autoTable, BillZo footer).
// ============================================================

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { RecoveryCaseSnapshot, PackInvoice } from './recovery-escalation'
import { recoveryFormatRupees } from '@billzo/shared'

const NAVY: [number, number, number] = [13, 34, 59]
const TEAL: [number, number, number] = [41, 151, 135]
const MID_GRAY: [number, number, number] = [100, 116, 139]
const LIGHT_BG: [number, number, number] = [246, 248, 250]

interface RenderContext {
  doc: jsPDF
  y: number
  margin: number
  contentW: number
  rx: number
}

function ensureSpace(ctx: RenderContext, needed: number): void {
  if (ctx.y + needed <= 271) return
  ctx.doc.addPage()
  ctx.y = 18
}

function sectionLabel(ctx: RenderContext, label: string): void {
  ensureSpace(ctx, 16)
  ctx.doc.setFont('helvetica', 'bold')
  ctx.doc.setFontSize(10)
  ctx.doc.setTextColor(...NAVY)
  ctx.doc.text(label, ctx.margin, ctx.y)
  ctx.doc.setDrawColor(...TEAL)
  ctx.doc.setLineWidth(0.5)
  ctx.doc.line(ctx.margin, ctx.y + 1.6, ctx.rx, ctx.y + 1.6)
  ctx.y += 7
}

function metaRows(ctx: RenderContext, rows: Array<[string, string]>): void {
  for (const [label, value] of rows) {
    ctx.doc.setFont('helvetica', 'normal')
    ctx.doc.setFontSize(9)
    ctx.doc.setTextColor(...MID_GRAY)
    ctx.doc.text(label, ctx.margin, ctx.y)
    ctx.doc.setFont('helvetica', 'bold')
    ctx.doc.setTextColor(...NAVY)
    const valueLines = ctx.doc.splitTextToSize(value, ctx.contentW - 58) as string[]
    ctx.doc.text(valueLines, ctx.margin + 58, ctx.y)
    ctx.y += 5 + (valueLines.length - 1) * 4
  }
  ctx.y += 3
}

function renderInvoices(ctx: RenderContext, invoices: PackInvoice[]): void {
  if (invoices.length === 0) return
  ensureSpace(ctx, 40)
  const body = invoices.map((inv) => [
    inv.number,
    new Date(inv.due ?? '').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) || '—',
    recoveryFormatRupees(inv.amount),
    recoveryFormatRupees(inv.paid),
    recoveryFormatRupees(inv.outstanding),
    inv.status || '—',
  ])
  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [['Invoice', 'Due', 'Amount', 'Paid', 'Outstanding', 'Status']],
    body,
    theme: 'plain',
    headStyles: { fillColor: NAVY as any, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold', halign: 'center', cellPadding: 2.5 as any },
    bodyStyles: { fontSize: 8.5, textColor: NAVY as any, cellPadding: 2.5 as any },
    alternateRowStyles: { fillColor: LIGHT_BG as any },
    tableLineColor: [214, 220, 228] as any,
    tableLineWidth: 0.3,
    columnStyles: {
      0: { cellWidth: 42, halign: 'left' },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 34, halign: 'right' },
      5: { cellWidth: 24, halign: 'center' },
    } as any,
    margin: { left: ctx.margin, right: ctx.margin },
  })
  // @ts-ignore
  ctx.y = (ctx.doc as any).lastAutoTable.finalY + 8
}

function renderCommunications(ctx: RenderContext, snapshot: RecoveryCaseSnapshot): void {
  const rows = snapshot.evidence.communications
  if (!rows.length) {
    ctx.doc.setFont('helvetica', 'italic')
    ctx.doc.setFontSize(8.5)
    ctx.doc.setTextColor(...MID_GRAY)
    ctx.doc.text('No communication evidence linked to this case.', ctx.margin, ctx.y)
    ctx.y += 7
    return
  }
  ensureSpace(ctx, 30)
  const body = rows.map((c) => [
    c.fidelity === 'verified' && c.customerName ? `${c.customerName} (${c.customerPhone ?? 'no phone'})` : c.fidelity === 'provider' ? 'Provider (reached device, identity unproven)' : 'Unknown (no action_id stored)',
    c.summary,
    c.occurredAt ? new Date(c.occurredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  ])
  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [['Attribution', 'Message', 'Date']],
    body,
    theme: 'plain',
    headStyles: { fillColor: NAVY as any, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold', cellPadding: 2.5 as any },
    bodyStyles: { fontSize: 8.5, textColor: NAVY as any, cellPadding: 2.5 as any },
    alternateRowStyles: { fillColor: LIGHT_BG as any },
    tableLineColor: [214, 220, 228] as any,
    tableLineWidth: 0.3,
    columnStyles: { 0: { cellWidth: 72, halign: 'left' }, 1: { cellWidth: 90, halign: 'left' }, 2: { cellWidth: 28, halign: 'center' } } as any,
    margin: { left: ctx.margin, right: ctx.margin },
  })
  // @ts-ignore
  ctx.y = (ctx.doc as any).lastAutoTable.finalY + 8
}

function renderPromises(ctx: RenderContext, snapshot: RecoveryCaseSnapshot): void {
  const rows = snapshot.evidence.promises
  if (!rows.length) {
    ctx.doc.setFont('helvetica', 'italic')
    ctx.doc.setFontSize(8.5)
    ctx.doc.setTextColor(...MID_GRAY)
    ctx.doc.text('No payment promises recorded.', ctx.margin, ctx.y)
    ctx.y += 7
    return
  }
  ensureSpace(ctx, 30)
  const body = rows.map((p) => [
    p.promiseDate ? new Date(p.promiseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    recoveryFormatRupees(p.amount),
    p.status ?? '—',
  ])
  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [['Promise Date', 'Amount', 'Status']],
    body,
    theme: 'plain',
    headStyles: { fillColor: NAVY as any, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold', cellPadding: 2.5 as any },
    bodyStyles: { fontSize: 8.5, textColor: NAVY as any, cellPadding: 2.5 as any },
    alternateRowStyles: { fillColor: LIGHT_BG as any },
    tableLineColor: [214, 220, 228] as any,
    tableLineWidth: 0.3,
    margin: { left: ctx.margin, right: ctx.margin },
  })
  // @ts-ignore
  ctx.y = (ctx.doc as any).lastAutoTable.finalY + 8
}

function renderPayments(ctx: RenderContext, snapshot: RecoveryCaseSnapshot): void {
  const rows = snapshot.evidence.payments
  if (!rows.length) {
    ctx.doc.setFont('helvetica', 'italic')
    ctx.doc.setFontSize(8.5)
    ctx.doc.setTextColor(...MID_GRAY)
    ctx.doc.text('No payments received.', ctx.margin, ctx.y)
    ctx.y += 7
    return
  }
  ensureSpace(ctx, 30)
  const body = rows.map((pay) => [
    pay.paidAt ? new Date(pay.paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    recoveryFormatRupees(pay.amount),
    pay.method ?? '—',
  ])
  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [['Paid On', 'Amount', 'Method']],
    body,
    theme: 'plain',
    headStyles: { fillColor: NAVY as any, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold', cellPadding: 2.5 as any },
    bodyStyles: { fontSize: 8.5, textColor: NAVY as any, cellPadding: 2.5 as any },
    alternateRowStyles: { fillColor: LIGHT_BG as any },
    tableLineColor: [214, 220, 228] as any,
    tableLineWidth: 0.3,
    margin: { left: ctx.margin, right: ctx.margin },
  })
  // @ts-ignore
  ctx.y = (ctx.doc as any).lastAutoTable.finalY + 8
}

function footer(doc: jsPDF): void {
  const footerY = 282
  doc.setDrawColor(...TEAL)
  doc.setLineWidth(0.4)
  doc.line(20, footerY, 190, footerY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...MID_GRAY)
  doc.text('Generated by BillZo — evidence snapshot, do not alter', 105, footerY + 4, { align: 'center' })
}

export interface RecoveryCasePdfOptions {
  merchantNote?: string | null
}

export const ESCALATION_PDF_MIME = 'application/pdf'

/**
 * Render the Recovery Case pack to a PDF. Strictly source-of-truth: only the
 * snapshot is read; no live recompute. sink: () blocks allocation the caller
 * owns (mirrors what's already tested in pdf.ts invoice flows).
 */
export async function renderRecoveryCasePDF(
  snapshot: RecoveryCaseSnapshot,
  opts: RecoveryCasePdfOptions = {},
): Promise<jsPDF> {
  const doc = new jsPDF()
  const margin = 14
  const pw = 210
  const ctx: RenderContext = {
    doc,
    y: margin,
    margin,
    contentW: pw - margin * 2,
    rx: pw - margin,
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(21)
  doc.setTextColor(...NAVY)
  doc.text('Recovery Case', ctx.margin, ctx.y)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...TEAL)
  doc.text(snapshot.caseNumber, ctx.rx, ctx.y, { align: 'right' })
  ctx.y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MID_GRAY)
  doc.text(`As of ${new Date(snapshot.asOf).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, ctx.margin, ctx.y)
  ctx.y += 2

  doc.setDrawColor(...TEAL)
  doc.setLineWidth(0.7)
  doc.line(ctx.margin, ctx.y + 1, ctx.rx, ctx.y + 1)
  ctx.y += 9

  // Merchant + customer identity
  sectionLabel(ctx, 'Customer')
  metaRows(ctx, [
    ['Customer', snapshot.customer.name || '—'],
    ['Phone', snapshot.customer.phone || '—'],
    ['Merchant', snapshot.merchantName || '—'],
  ])

  // Outstanding + effort summary
  sectionLabel(ctx, 'Summary')
  const effort = snapshot.effort
  metaRows(ctx, [
    ['Outstanding', recoveryFormatRupees(snapshot.outstanding)],
    ['Invoices', String(snapshot.invoiceCount)],
    ['Max Overdue', `${snapshot.maxOverdueDays} days`],
    ['Recovery Effort', effort.noise],
    ['Result', effort.result],
  ])

  // Invoice ledger
  sectionLabel(ctx, 'Invoices')
  renderInvoices(ctx, snapshot.invoices)

  // Evidence: communication fidelity must be rendered as-is (never upgraded).
  sectionLabel(ctx, 'Communication Evidence')
  renderCommunications(ctx, snapshot)

  sectionLabel(ctx, 'Payment Promises')
  renderPromises(ctx, snapshot)

  sectionLabel(ctx, 'Payments Received')
  renderPayments(ctx, snapshot)

  if (opts.merchantNote) {
    sectionLabel(ctx, 'Merchant Note')
    ensureSpace(ctx, 20)
    ctx.doc.setFont('helvetica', 'normal')
    ctx.doc.setFontSize(9)
    ctx.doc.setTextColor(...NAVY)
    const lines = ctx.doc.splitTextToSize(opts.merchantNote, ctx.contentW) as string[]
    ctx.doc.text(lines, ctx.margin, ctx.y)
    ctx.y += lines.length * 4.4 + 2
  }

  // Completeness + attribution note (the no-causal-evidence plain-speak).
  sectionLabel(ctx, 'Completeness & Attribution')
  const comp = snapshot.completeness
  ctx.doc.setFont('helvetica', 'normal')
  ctx.doc.setFontSize(8.5)
  ctx.doc.setTextColor(...NAVY)
  const compText = [
    `Invoices: ${comp.invoices ? 'complete' : 'missing'} · Payments: ${comp.payments ? 'present' : 'none'} · WhatsApp: ${comp.whatsapp ? 'present' : 'none'} · Promises: ${comp.promises ? 'present' : 'none'} · Calls: ${comp.calls ? 'present' : 'none'} · Timeline: ${comp.timeline ? 'present' : 'none'}`,
  ]
  ctx.doc.text(compText, ctx.margin, ctx.y)
  ctx.y += 6
  ctx.doc.setFont('helvetica', 'italic')
  ctx.doc.setTextColor(...MID_GRAY)
  const noteLines = ctx.doc.splitTextToSize(snapshot.attributionNote, ctx.contentW) as string[]
  ctx.doc.text(noteLines, ctx.margin, ctx.y)
  ctx.y += noteLines.length * 4 + 4

  // Timeline
  sectionLabel(ctx, 'Timeline')
  if (snapshot.timeline.length) {
    ensureSpace(ctx, 24)
    autoTable(ctx.doc, {
      startY: ctx.y,
      head: [['Event', 'Date']],
      body: snapshot.timeline.map((t) => [
        t.eventType.replace(/_/g, ' '),
        new Date(t.occurredAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || '—',
      ]),
      theme: 'plain',
      headStyles: { fillColor: NAVY as any, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold', cellPadding: 2.5 as any },
      bodyStyles: { fontSize: 8.5, textColor: NAVY as any, cellPadding: 2.5 as any },
      alternateRowStyles: { fillColor: LIGHT_BG as any },
      tableLineColor: [214, 220, 228] as any,
      tableLineWidth: 0.3,
      columnStyles: { 0: { cellWidth: 110, halign: 'left' }, 1: { cellWidth: 70, halign: 'center' } } as any,
      margin: { left: ctx.margin, right: ctx.margin },
    })
    // @ts-ignore
    ctx.y = (ctx.doc as any).lastAutoTable.finalY + 8
  } else {
    ctx.doc.setFont('helvetica', 'italic')
    ctx.doc.setFontSize(8.5)
    ctx.doc.setTextColor(...MID_GRAY)
    ctx.doc.text('No recovery timeline recorded.', ctx.margin, ctx.y)
    ctx.y += 7
  }

  footer(doc)
  return doc
}

export async function downloadRecoveryCasePDF(snapshot: RecoveryCaseSnapshot, opts?: RecoveryCasePdfOptions): Promise<void> {
  const doc = await renderRecoveryCasePDF(snapshot, opts)
  doc.save(`${snapshot.caseNumber.replace(/[^\w-]/g, '-')}.pdf`)
}

export async function printRecoveryCasePDF(snapshot: RecoveryCaseSnapshot, opts?: RecoveryCasePdfOptions): Promise<void> {
  const doc = await renderRecoveryCasePDF(snapshot, opts)
  const blob = (doc as any).output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}