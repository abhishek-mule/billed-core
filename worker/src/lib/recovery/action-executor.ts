// ============================================================
// ACTION EXECUTOR — Load → validate → send → write result
// Handles a single scheduled action from collection_actions.
// Does NOT decide what to send or when — only executes.
// ============================================================

import { supabaseAdmin } from '../billzo/supabase-admin'
import { sendWhatsAppMessage } from '../../../lib/whatsapp-router'
import { writeOutboxEvent } from '../billzo/outbox'
import { createQueueLogger } from '../../../lib/queue-logger'
import { getAutoRecoveryGate } from './enforcement'
import { billzoPlanOf, reminderMonthlyAllowance } from '@billzo/shared'

const logger = createQueueLogger('action-executor')

export type ExecutionResult =
  | { status: 'completed'; messageId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'retry'; error: string }
  | { status: 'failed'; error: string }

interface ActionRow {
  id: string
  tenant_id: string
  customer_id: string | null
  invoice_ids: string[]
  action_type: string
  template_name: string | null
  status: string
  scheduled_at: string | null
  attempt_count: number
  max_attempts: number
  phone?: string
  source?: string | null
}

/**
 * Execute a single scheduled action end-to-end.
 */
export async function executeAction(actionId: string): Promise<ExecutionResult> {
  // 1. LOAD
  const action = await loadAction(actionId)
  if (!action) {
    return { status: 'skipped', reason: 'action_not_found' }
  }

  // 2. VALIDATE
  const validation = await validateAction(action)
  if (validation !== 'ok') {
    return { status: 'skipped', reason: validation }
  }

  // 3. ENFORCEMENT GATE (final safety check) — automatic (source='system')
  //    actions must not dispatch when auto recovery is disabled or the
  //    tenant has no entitlement. Manual merchant actions pass regardless.
  if (action.source === 'system') {
    const gate = await getAutoRecoveryGate(action.tenant_id)
    if (gate.blocked) {
      const reason = gate.entitled ? 'auto_recovery_disabled' : 'plan_requires_auto_recovery'
      logger.warn({ actionId, tenantId: action.tenant_id, reason }, 'Dispatch blocked by auto-recovery gate')
      await supabaseAdmin
        .from('collection_actions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', action.id)
      await writeActionEvent(action.id, 'cancelled', { reason })
      return { status: 'skipped', reason }
    }
  }

  // 3b. QUOTA GATE — every dispatched reminder (scheduled manual + automatic)
  //      counts against the plan's monthly allowance. Hard-disabled past 110%.
  if (await isReminderQuotaExceeded(action.tenant_id)) {
    const reason = 'monthly_reminder_quota_exceeded'
    logger.warn({ actionId, tenantId: action.tenant_id }, 'Dispatch blocked by monthly reminder quota')
    await supabaseAdmin
      .from('collection_actions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', action.id)
    await writeActionEvent(action.id, 'cancelled', { reason })
    return { status: 'skipped', reason }
  }

  // 4. RESOLVE CONTENT
  const invoiceId = action.invoice_ids[0]
  const invoice = await loadInvoice(invoiceId)
  if (!invoice) {
    return { status: 'skipped', reason: 'invoice_not_found' }
  }

  const customer = await loadCustomer(action.customer_id)
  if (!customer) {
    return { status: 'skipped', reason: 'customer_not_found' }
  }

  const phone = customer.phone
  if (!phone) {
    return { status: 'skipped', reason: 'customer_no_phone' }
  }

  const messageText = buildMessageText(action, invoice, customer)

  try {
    const sendResult = await sendWhatsAppMessage(
      action.tenant_id,
      phone,
      messageText,
      {
        invoiceId,
        customerId: action.customer_id,
        attemptNumber: action.attempt_count + 1,
        reminderStage: action.template_name,
        amount: Number(invoice.total || 0),
        recoveryAttemptId: action.id,
      },
    )

    // 5. WRITE AUDIT EVENT
    await writeActionEvent(action.id, 'sent', {
      message_id: sendResult.messageId,
      provider: sendResult.provider,
      invoice_id: invoiceId,
      phone,
    })

    // 6. UPDATE COLLECTION ACTION
    const updates: Record<string, any> = {
      status: 'completed',
      attempt_count: action.attempt_count + 1,
      last_attempt_at: new Date().toISOString(),
      executed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      provider: sendResult.provider,
      billzo_message_id: sendResult.messageId,
      updated_at: new Date().toISOString(),
    }

    await supabaseAdmin
      .from('collection_actions')
      .update(updates)
      .eq('id', action.id)

    // 6b. The collection_action is now complete — clear the derived
    //     next_recovery_at convenience field so it can't disagree with the
    //     completed action. The scheduler only reads collection_actions.
    await supabaseAdmin
      .from('invoices')
      .update({
        next_recovery_at: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', action.invoice_ids)
      .eq('tenant_id', action.tenant_id)

    // 7. EMIT REMINDER SENT EVENT
    await writeOutboxEvent({
      type: 'recovery.reminder.sent',
      tenantId: action.tenant_id,
      entityId: invoiceId,
      payload: {
        customerId: action.customer_id,
        stage: action.template_name || action.action_type,
        channel: sendResult.provider,
        messageId: sendResult.messageId,
        billzoMessageId: sendResult.messageId,
        actionId: action.id,
        recoveryAttemptId: action.id,
      } as Record<string, unknown>,
      causationId: null,
      correlationId: '',
      idempotencyKey: null,
    })

    // 7b. METER USAGE — billing worker increments tenant_usage.reminders_sent
    //      from this event. One event per successful dispatch (per action id).
    try {
      await writeOutboxEvent({
        type: 'billing.usage',
        tenantId: action.tenant_id,
        entityId: action.tenant_id,
        payload: { metric: 'reminders_sent', amount: 1 },
        causationId: null,
        correlationId: '',
        idempotencyKey: `reminders_sent:${action.id}`,
      })
    } catch (meterErr: any) {
      logger.warn({ actionId, tenantId: action.tenant_id, error: meterErr.message }, 'Failed to meter reminders_sent usage')
    }

    return { status: 'completed', messageId: sendResult.messageId }
  } catch (err: any) {
    const errorMessage = err.message || 'unknown_error'

    // 5b. WRITE AUDIT EVENT
    await writeActionEvent(action.id, 'retry', {
      error: errorMessage,
      attempt: action.attempt_count + 1,
      max_attempts: action.max_attempts,
    })

    const newAttemptCount = action.attempt_count + 1
    if (newAttemptCount >= action.max_attempts) {
      // Mark as failed — exhausted retries
      await supabaseAdmin
        .from('collection_actions')
        .update({
          status: 'failed',
          attempt_count: newAttemptCount,
          last_attempt_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', action.id)

      await writeActionEvent(action.id, 'failed', {
        error: errorMessage,
        attempts: newAttemptCount,
        max_attempts: action.max_attempts,
      })

      return { status: 'failed', error: errorMessage }
    }

    // Schedule retry — update count and keep status as 'scheduled'
    await supabaseAdmin
      .from('collection_actions')
      .update({
        attempt_count: newAttemptCount,
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', action.id)

    return { status: 'retry', error: errorMessage }
  }
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * True when a tenant has hard-exceeded its monthly recovery-reminder
 * allowance (used/limit ≥ 110%, mirroring the API soft-limit policy).
 * Reads are cheap and fail-open on metering errors so a transient DB
 * hiccup never silently stops recovery dispatch.
 */
async function isReminderQuotaExceeded(tenantId: string): Promise<boolean> {
  try {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('plan')
      .eq('id', tenantId)
      .maybeSingle()

    const limit = reminderMonthlyAllowance(billzoPlanOf(tenant?.plan as string | null))
    if (limit === -1) return false

    const month = currentMonth()
    const { data: usage } = await supabaseAdmin
      .from('tenant_usage')
      .select('reminders_sent')
      .eq('tenant_id', tenantId)
      .eq('month', month)
      .maybeSingle()

    const used = Number((usage as { reminders_sent?: number } | null)?.reminders_sent ?? 0)
    return (used / limit) * 100 >= 110
  } catch (err: any) {
    logger.warn({ tenantId, error: err.message }, 'Quota gate failed open')
    return false
  }
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function loadAction(actionId: string): Promise<ActionRow | null> {
  const { data, error } = await supabaseAdmin
    .from('collection_actions')
    .select('*')
    .eq('id', actionId)
    .single()

  if (error || !data) {
    logger.error({ actionId, error: error?.message }, 'Failed to load action')
    return null
  }

  return data as ActionRow
}

async function validateAction(action: ActionRow): Promise<string | 'ok'> {
  // Already completed, cancelled, or failed
  if (action.status !== 'scheduled' && action.status !== 'processing' && action.status !== 'in_progress') {
    return `action_status_${action.status}`
  }

  // Past max attempts
  if (action.attempt_count >= action.max_attempts) {
    return 'max_attempts_exceeded'
  }

  // Check that at least one invoice is still unpaid
  if (action.invoice_ids.length === 0) {
    return 'no_invoices'
  }

  const invoiceIds = action.invoice_ids
  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('id, customer_id')
    .in('id', invoiceIds)
    .gt('outstanding_amount', 0)

  if (!invoices || invoices.length === 0) {
    return 'all_invoices_paid'
  }

  // Check customer is active
  if (action.customer_id) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id, automation_mode')
      .eq('id', action.customer_id)
      .single()

    if (!customer) return 'customer_not_found'
    if (customer.automation_mode === 'muted' || customer.automation_mode === 'manual') {
      return `customer_${customer.automation_mode}`
    }
  }

  return 'ok'
}

async function loadInvoice(invoiceId: string): Promise<any | null> {
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('id, total, paid_amount, status, invoice_number, due_at')
    .eq('id', invoiceId)
    .single()

  if (error) return null
  return data
}

async function loadCustomer(customerId: string | null): Promise<any | null> {
  if (!customerId) return null
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, customer_name, phone, automation_mode')
    .eq('id', customerId)
    .single()

  if (error) return null
  return data
}

async function writeActionEvent(actionId: string, eventType: string, payload: Record<string, any>) {
  try {
    await supabaseAdmin
      .from('collection_action_events')
      .insert({
        action_id: actionId,
        event_type: eventType,
        payload,
      })
  } catch (err: any) {
    logger.error({ actionId, eventType, error: err.message }, 'Failed to write action event')
  }
}

function buildMessageText(action: ActionRow, invoice: any, customer: any): string {
  const customerName = customer?.customer_name || 'Customer'
  const amount = invoice?.total || 0
  const amountText = `₹${amount.toLocaleString('en-IN')}`
  const businessName = 'BillZo'

  switch (action.template_name) {
    case 'invoice_due':
      return `Dear ${customerName},\n\nJust a gentle reminder that ${amountText} is due today. Please make the payment at your earliest convenience.\n\nThank you,\n${businessName}`

    case 'payment_reminder':
      return `Dear ${customerName},\n\nQuick reminder: ${amountText} is still outstanding. We'd appreciate it if you could clear this at your earliest convenience.\n\nThank you,\n${businessName}`

    case 'promise_followup':
      return `Dear ${customerName},\n\nFollowing up on your promise to pay ${amountText}. Please remit the amount at the earliest.\n\nThank you,\n${businessName}`

    case 'final_reminder':
      return `Dear ${customerName},\n\nThis is a final notice regarding ${amountText}. If we do not receive payment within 3 days, we may need to escalate this matter.\n\nPlease contact us immediately if you have any questions.\n\n${businessName}`

    default:
      return `Dear ${customerName},\n\nReminder: ${amountText} is due. Please make the payment at your earliest convenience.\n\nThank you,\n${businessName}`
  }
}
