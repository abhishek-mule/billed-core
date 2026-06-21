import crypto from 'crypto'
import { supabaseAdmin } from './supabase-admin'
import { submitIntent } from '@/lib/authority/transport'
import { matchPaymentToInvoice, type MatchResult } from './matching'
import { executeIdempotent, IdempotencyPatterns } from './idempotency'
import { emitPaymentReconciled, emitPaymentCompleted, logStructuredError } from './events'

// ============================================================
// PAYMENT SIGNAL SOURCE INTERFACE
// Abstract interface for all payment ingestion sources.
// Start deterministic (Razorpay webhooks), design probabilistic (bank statements, SMS parsing).
// ============================================================

export interface PaymentSignal {
  amount: number
  currency: string
  phone: string | null
  upiReference: string | null
  customerName: string | null
  provider: string
  providerPaymentId: string
  paymentLinkId: string | null
  timestamp: string
  rawPayload: Record<string, unknown>
}

export interface PaymentReconciliationResult {
  matched: boolean
  invoiceId: string | null
  matchType: 'payment_link' | 'exact' | 'fuzzy' | null
  confidence: number
  invoice: Record<string, unknown> | null
}

export interface PaymentSignalSource {
  name: string
  ingest(payload: Record<string, unknown>): Promise<PaymentSignal | null>
}

// ============================================================
// RAZORPAY WEBHOOK SOURCE
// Deterministic payment ingestion from Razorpay webhooks.
// ============================================================

export class RazorpayWebhookSource implements PaymentSignalSource {
  name = 'razorpay_webhook'

  async ingest(payload: Record<string, unknown>): Promise<PaymentSignal | null> {
    const payment = payload.payment as Record<string, unknown> | undefined
    if (!payment) return null

    const entity = payment.entity as Record<string, unknown> | undefined
    if (!entity) return null

    const amount = (entity.amount as number) / 100 // Convert paise to rupees
    const notes = (entity.notes || {}) as Record<string, unknown>
    const acquirerData = (entity.acquirer_data || {}) as Record<string, unknown>
    const phone = (entity.contact as string) || (notes.phone as string) || null
    const upiReference = (acquirerData.upi_transaction_id as string)
      || (acquirerData.rrn as string)
      || null
    const customerName = (notes.customer_name as string)
      || (notes.name as string)
      || null
    const paymentLinkId = (entity.payment_link_id as string)
      || (notes.invoiceId as string)
      || null

    return {
      amount,
      currency: (entity.currency as string) || 'INR',
      phone,
      upiReference,
      customerName,
      provider: 'razorpay',
      providerPaymentId: entity.id as string,
      paymentLinkId,
      timestamp: entity.created_at as string || new Date().toISOString(),
      rawPayload: payload,
    }
  }
}

// ============================================================
// RECONCILIATION ENGINE
// Matches payment signals to unpaid invoices and updates state.
// ============================================================

export async function reconcilePayment(
  signal: PaymentSignal,
  tenantId: string
): Promise<PaymentReconciliationResult> {
  // Step 1: Try exact match via payment_link_id
  if (signal.paymentLinkId) {
    const match = await matchByPaymentLink(signal.paymentLinkId, tenantId)
    if (match) {
      return await finalizeReconciliation(signal, match, 'payment_link', tenantId)
    }
  }

  // Step 2: Try fuzzy match (amount + phone + customer name)
  const fuzzyMatch = await matchPaymentToInvoice(signal, tenantId)
  if (fuzzyMatch) {
    return await finalizeReconciliation(signal, fuzzyMatch, fuzzyMatch.matchType, tenantId)
  }

  // No match found
  console.log('[Reconciliation] No matching invoice found for payment:', {
    amount: signal.amount,
    phone: signal.phone,
    providerPaymentId: signal.providerPaymentId,
  })

  return {
    matched: false,
    invoiceId: null,
    matchType: null,
    confidence: 0,
    invoice: null,
  }
}

/**
 * Match payment by payment link ID (exact match).
 */
async function matchByPaymentLink(
  paymentLinkId: string,
  tenantId: string
): Promise<{ invoiceId: string; invoice: any } | null> {
  // Try matching by payment_link_id stored on invoice
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('payment_link_id', paymentLinkId)
    .eq('tenant_id', tenantId)
    .in('status', ['unpaid', 'partial', 'overdue'])
    .single()

  if (invoice) {
    return { invoiceId: invoice.id, invoice }
  }

  // Try matching by notes.invoiceId from Razorpay
  const { data: invoiceByNote } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', paymentLinkId)
    .eq('tenant_id', tenantId)
    .in('status', ['unpaid', 'partial', 'overdue'])
    .single()

  if (invoiceByNote) {
    return { invoiceId: invoiceByNote.id, invoice: invoiceByNote }
  }

  return null
}

/**
 * Finalize reconciliation: update invoice, emit events, record attribution.
 */
async function finalizeReconciliation(
  signal: PaymentSignal,
  match: { invoiceId: string; invoice: any },
  matchType: 'payment_link' | 'exact' | 'fuzzy',
  tenantId: string
): Promise<PaymentReconciliationResult> {
  const { invoiceId, invoice } = match

  // authority:governed invoice.mark_paid
  const now = new Date().toISOString()
  const intentResult = await submitIntent({
    intentId: crypto.randomUUID(),
    intentType: 'invoice.mark_paid',
    intentVersion: 1,
    tenantId,
    actor: 'system:reconciliation',
    source: 'app',
    timestamp: now,
    causationId: null,
    correlationId: null,
    payload: { invoiceId, status: 'paid', paidAmount: invoice.total || signal.amount },
    nonce: crypto.randomUUID(),
  }, 'app')

  if (!intentResult.accepted) {
    logStructuredError(new Error(intentResult.error || 'Authority rejected reconciliation'), {
      type: 'reconciliation_authority_rejected',
      invoiceId,
      tenantId,
    })
    throw new Error(intentResult.error || 'Authority rejected reconciliation')
  }

  // Record payment in unified ledger — trigger auto-maintains outstanding_amount
  try {
    const { recordPayment } = await import('./record-payment')
    const rawPayload = signal.rawPayload as any
    await recordPayment({
      tenantId,
      invoiceId,
      customerId: invoice.customer_id,
      amount: signal.amount,
      source: signal.provider === 'razorpay' ? 'razorpay' : 'cash',
      actor: 'customer',
      evidence: {
        razorpayPaymentId: signal.providerPaymentId,
        razorpayOrderId: rawPayload?.payment?.entity?.order_id,
        utr: signal.upiReference || undefined,
        notes: `Auto-reconciled via ${signal.provider} (${matchType})`,
      },
    })
  } catch (err: any) {
    console.error('[Reconciliation] Failed to record payment in ledger:', err.message)
  }

  // Emit payment reconciled event
  await emitPaymentReconciled({
    invoiceId,
    tenantId,
    customerId: invoice.customer_id,
    amount: signal.amount,
    provider: signal.provider,
    providerPaymentId: signal.providerPaymentId,
    matchedBy: matchType,
  })

  // Emit payment completed event
  await emitPaymentCompleted({
    invoiceId,
    tenantId,
    customerId: invoice.customer_id,
    amount: signal.amount,
    provider: signal.provider,
    providerPaymentId: signal.providerPaymentId,
    matchedBy: matchType,
  })

  console.log('[Reconciliation] Payment matched and invoice updated:', {
    invoiceId,
    matchType,
    amount: signal.amount,
    providerPaymentId: signal.providerPaymentId,
  })

  return {
    matched: true,
    invoiceId,
    matchType,
    confidence: matchType === 'payment_link' ? 1.0 : matchType === 'exact' ? 0.95 : 0.7,
    invoice,
  }
}

/**
 * Process a Razorpay webhook payment event with idempotency.
 */
export async function processRazorpayPaymentWebhook(
  webhookPayload: Record<string, unknown>,
  tenantId: string
): Promise<PaymentReconciliationResult> {
  const source = new RazorpayWebhookSource()
  const signal = await source.ingest(webhookPayload)

  if (!signal) {
    throw new Error('Invalid payment webhook payload')
  }

  const idempotencyKey = IdempotencyPatterns.paymentReconcile(
    signal.paymentLinkId || 'unknown',
    signal.provider,
    signal.providerPaymentId
  )

  return executeIdempotent(
    idempotencyKey,
    'payment_reconciliation',
    tenantId,
    async () => reconcilePayment(signal, tenantId)
  )
}
