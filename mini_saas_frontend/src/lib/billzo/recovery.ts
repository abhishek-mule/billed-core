import type { Invoice, RecoveryAttempt, RecoveryStage, WhatsAppStatus } from './types'
import { uuid } from './db'

const stageOrder: RecoveryStage[] = ['t0_soft', 't24_nudge', 't72_strong', 't5_warning']

export function nextRecoveryStage(stage: RecoveryStage): RecoveryStage {
  return stageOrder[Math.min(stageOrder.indexOf(stage) + 1, stageOrder.length - 1)]
}

export function nextRecoveryAt(stage: RecoveryStage, readStatus: WhatsAppStatus, base = new Date()) {
  const hoursByStage: Record<RecoveryStage, number> = {
    t0_soft: readStatus === 'read' ? 12 : 24,
    t24_nudge: readStatus === 'read' ? 36 : 72,
    t72_strong: 48,
    t5_warning: 120,
  }
  const date = new Date(base)
  date.setHours(date.getHours() + hoursByStage[stage])
  return date.toISOString()
}

export function buildRecoveryMessage(invoice: Invoice, stage: RecoveryStage) {
  const amount = `Rs ${(invoice.total - invoice.paidAmount).toLocaleString('en-IN')}`
  const lines: Record<RecoveryStage, string> = {
    t0_soft: `Namaste ${invoice.customerName}, ${amount} pending for your Billzo invoice. PDF: ${invoice.pdfUrl}`,
    t24_nudge: `Reminder: ${amount} is still pending. Please clear today. Invoice PDF: ${invoice.pdfUrl}`,
    t72_strong: `${invoice.customerName}, payment of ${amount} is overdue. Please pay now to avoid follow-up. PDF: ${invoice.pdfUrl}`,
    t5_warning: `Final reminder: ${amount} overdue for 5 days. Please settle now. Trusted invoice PDF: ${invoice.pdfUrl}`,
  }
  return lines[stage]
}

const stageToTone: Record<RecoveryStage, 'soft' | 'nudge' | 'strong' | 'warning'> = {
  t0_soft: 'soft',
  t24_nudge: 'nudge',
  t72_strong: 'strong',
  t5_warning: 'warning',
}

export async function createRecoveryAttemptWithAI(
  invoice: Invoice,
  stage = invoice.recoveryStage,
  options?: {
    language?: 'hindi' | 'hinglish' | 'english'
    pastPayments?: { amount: number; paidAt: string }[]
    lastMessageRead?: boolean
    businessName?: string
  }
): Promise<RecoveryAttempt> {
  const current = new Date().toISOString()
  const tone = stageToTone[stage]

  const { generateSmartMessage } = await import('./gemini')

  const daysOverdue = Math.max(0, Math.floor(
    (new Date().getTime() - new Date(invoice.dueAt).getTime()) / (1000 * 60 * 60 * 24)
  ))

  const generated = await generateSmartMessage({
    customerName: invoice.customerName,
    amount: invoice.total - invoice.paidAmount,
    invoiceDate: invoice.createdAt,
    daysOverdue,
    stage: tone,
    language: options?.language || 'hinglish',
    pastPayments: options?.pastPayments,
    lastMessageRead: options?.lastMessageRead,
    businessName: options?.businessName || 'BillZo',
    invoiceId: invoice.id,
  })

  return {
    id: uuid(),
    tenantId: invoice.tenantId,
    invoiceId: invoice.id,
    stage,
    tone,
    message: generated.message,
    pdfUrl: invoice.pdfUrl,
    scheduledAt: current,
    status: 'queued',
    createdAt: current,
    updatedAt: current,
  }
}

export function createRecoveryAttempt(invoice: Invoice, stage = invoice.recoveryStage): RecoveryAttempt {
  const current = new Date().toISOString()
  const toneByStage: Record<RecoveryStage, RecoveryAttempt['tone']> = {
    t0_soft: 'soft',
    t24_nudge: 'nudge',
    t72_strong: 'strong',
    t5_warning: 'warning',
  }
  return {
    id: uuid(),
    tenantId: invoice.tenantId,
    invoiceId: invoice.id,
    stage,
    tone: toneByStage[stage],
    message: buildRecoveryMessage(invoice, stage),
    pdfUrl: invoice.pdfUrl,
    scheduledAt: current,
    status: 'queued',
    createdAt: current,
    updatedAt: current,
  }
}
