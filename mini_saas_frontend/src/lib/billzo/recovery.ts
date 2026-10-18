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

const toneForStage: Record<RecoveryStage, RecoveryAttempt['tone']> = {
  t0_soft: 'soft',
  t24_nudge: 'nudge',
  t72_strong: 'strong',
  t5_warning: 'warning',
}

export interface RecoveryMessageOptions {
  language?: 'hindi' | 'hinglish' | 'english'
  businessName?: string
}

/**
 * Deterministic, language-aware reminder text.
 * Replaced the removed Gemini generation path (2026-10-19). The strings are
 * byte-identical to what was already sent whenever the Gemini API key was
 * missing or the API call failed — i.e. the previous built-in fallback.
 */
function buildLocalizedRecoveryMessage(
  invoice: Invoice,
  stage: RecoveryStage,
  options: RecoveryMessageOptions,
): string {
  const amountStr = `Rs ${(invoice.total - invoice.paidAmount).toLocaleString('en-IN')}`
  const { customerName } = invoice
  const businessName = options.businessName || 'BillZo'
  const language = options.language || 'hinglish'

  const messages: Record<string, Record<string, string>> = {
    soft: {
      hindi: `नमस्ते ${customerName} ji, आपका ${amountStr} का भुगतान बकाया है। कृपया जल्द से जल्द भुगतान करें। - ${businessName}`,
      hinglish: `Namaste ${customerName} ji, aapka ${amountStr} ka payment baaki hai. PDF ke saath details mein check karein. - ${businessName}`,
      english: `Hi ${customerName}, a payment of ${amountStr} is pending. Please check the PDF for details. - ${businessName}`,
    },
    nudge: {
      hindi: `${customerName} ji, ${amountStr} का भुगतान अभी भी बकाया है। कृपया आज ही भुगतान करें।`,
      hinglish: `Hi ${customerName}, ${amountStr} abhi bhi baaki hai. Aaj hi payment karo yaar, please! 🙏 - ${businessName}`,
      english: `Hi ${customerName}, a reminder that ${amountStr} is still pending. Please clear it today. - ${businessName}`,
    },
    strong: {
      hindi: `${customerName} ji, ${amountStr} का भुगतान बहुत देर हो चुका है। कृपया अभी भुगतान करें।`,
      hinglish: `${customerName}, ${amountStr} ka payment bahut late ho gaya yaar! Aaj hi karo, please. 🙏 - ${businessName}`,
      english: `Dear ${customerName}, ${amountStr} payment is overdue. Please settle it now to avoid further follow-up. - ${businessName}`,
    },
    warning: {
      hindi: `${customerName} ji, अंतिम रिमाइंडर: ${amountStr} बकाया है। कृपया तुरंत भुगतान करें।`,
      hinglish: `${customerName} ji, last reminder! ${amountStr} baaki hai. Please aaj hi pay karo, kaafi ho gaya yaar 🙏 - ${businessName}`,
      english: `Final reminder, ${customerName}: ${amountStr} is overdue. Please pay immediately to avoid escalation. - ${businessName}`,
    },
  }

  const tone = toneForStage[stage]
  return messages[tone]?.[language] || messages[tone]?.hinglish || messages.soft.hinglish
}

export function createRecoveryAttempt(
  invoice: Invoice,
  stage = invoice.recoveryStage,
  messageOptions?: RecoveryMessageOptions,
): RecoveryAttempt {
  const current = new Date().toISOString()
  return {
    id: uuid(),
    tenantId: invoice.tenantId,
    invoiceId: invoice.id,
    stage,
    tone: toneForStage[stage],
    message: messageOptions
      ? buildLocalizedRecoveryMessage(invoice, stage, messageOptions)
      : buildRecoveryMessage(invoice, stage),
    pdfUrl: invoice.pdfUrl,
    scheduledAt: current,
    status: 'queued',
    createdAt: current,
    updatedAt: current,
  }
}
