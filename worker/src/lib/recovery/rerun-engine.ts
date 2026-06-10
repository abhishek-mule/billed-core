import { supabaseAdmin } from '../billzo/supabase-admin'
import { emitEvent } from '../billzo/events'
import { canSendReminder } from './decision-engine'
import { EventType } from '@billzo/shared'

export async function rerunDecisionEngine(invoiceId: string, tenantId: string): Promise<void> {
  const [invoiceResult, customerResult] = await Promise.all([
    supabaseAdmin.from('invoices').select('*').eq('id', invoiceId).single(),
    supabaseAdmin.from('customers').select('*').eq('tenant_id', tenantId).maybeSingle(),
  ])

  if (invoiceResult.error || !invoiceResult.data) return

  const invoice = invoiceResult.data
  const customer = customerResult.data

  // Fetch active promise if any
  const { data: activePromise } = await supabaseAdmin
    .from('payment_promises')
    .select('promise_date')
    .eq('invoice_id', invoiceId)
    .eq('status', 'active')
    .gte('promise_date', new Date().toISOString())
    .limit(1)
    .maybeSingle()

  const decisionResult = canSendReminder({
    invoice: {
      id: invoiceId,
      total: invoice.total || 0,
      outstanding: invoice.outstanding_amount ?? invoice.total ?? 0,
      recoveryStage: invoice.recovery_stage || 't0_soft',
      nextRecoveryAt: invoice.next_recovery_at || null,
      isSnoozed: invoice.is_snoozed || false,
      snoozeUntil: invoice.snooze_until || null,
      isDisputed: invoice.is_disputed || false,
      manualInteractionAt: invoice.manual_interaction_at || null,
      overrideSend: invoice.override_send || false,
      overrideAt: invoice.override_at || null,
      overrideReason: invoice.override_reason || null,
    },
    customer: {
      id: customer?.id || '',
      phone: customer?.phone || null,
      customerTier: customer?.customer_tier || 'regular',
      automationMode: customer?.automation_mode || 'full_auto',
      phoneVerification: customer?.phone_verification || 'unknown',
      reputationScore: customer?.reputation_score ?? 50,
    },
    activePromiseDate: activePromise?.promise_date || null,
  })

  // Emit RECOVERY_RECOMMENDATION with fresh state
  const blockedBy = decisionResult.rules.find(r => !r.passed)
  await emitEvent({
    type: EventType.RECOVERY_RECOMMENDATION,
    tenantId,
    entityId: invoiceId,
    payload: {
      allowed: decisionResult.allowed,
      decision: decisionResult.decision,
      reason: decisionResult.reason,
      checksPassed: decisionResult.checksPassed,
      totalChecks: decisionResult.totalChecks,
      confidence: decisionResult.confidence,
      nextReviewAt: decisionResult.nextReviewAt,
      blockedBy: blockedBy?.rule || null,
      rules: decisionResult.rules.map(r => ({ rule: r.rule, passed: r.passed })),
      trigger: 'payment_recorded',
    },
    causationId: null,
    correlationId: `rerun:${invoiceId}:${Date.now()}`,
    producer: 'worker',
    idempotencyKey: null,
    retentionDays: 90,
  })
}
