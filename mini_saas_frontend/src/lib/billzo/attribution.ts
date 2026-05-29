import crypto from 'crypto'
import { supabaseAdmin } from './supabase-admin'
import { emitRecoveryCompleted } from './events'
import { submitIntent } from '@/lib/authority/transport'

export interface AttributionResult {
  attributed: boolean
  reminderEventId: string | null
  attributionType: string
  confidenceScore: number
  hoursBetweenReminderAndPayment: number | null
}

/**
 * Last-touch attribution: find the most recent reminder sent before payment.
 * Attribution window: 48 hours by default.
 */
export async function attributeRecovery(params: {
  invoiceId: string
  tenantId: string
  paymentId?: string
  paymentTimestamp: string
  attributionWindowHours?: number
}): Promise<AttributionResult> {
  const {
    invoiceId,
    tenantId,
    paymentId,
    paymentTimestamp,
    attributionWindowHours = 48,
  } = params

  const paymentDate = new Date(paymentTimestamp)
  const windowStart = new Date(paymentDate.getTime() - attributionWindowHours * 60 * 60 * 1000)

  // Find the most recent reminder sent within the attribution window
  const { data: reminderEvents, error } = await supabaseAdmin
    .from('outbox')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('entity_id', invoiceId)
    .eq('type', 'recovery.reminder.sent')
    .gte('created_at', windowStart.toISOString())
    .lte('created_at', paymentDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !reminderEvents || reminderEvents.length === 0) {
    // No reminder found within attribution window
    return {
      attributed: false,
      reminderEventId: null,
      attributionType: 'none',
      confidenceScore: 0,
      hoursBetweenReminderAndPayment: null,
    }
  }

  const reminder = reminderEvents[0]
  const reminderDate = new Date(reminder.created_at)
  const hoursBetween = (paymentDate.getTime() - reminderDate.getTime()) / (1000 * 60 * 60)

  // Calculate confidence score based on time proximity
  let confidenceScore = 1.0
  if (hoursBetween > 24) {
    confidenceScore = 0.7
  } else if (hoursBetween > 12) {
    confidenceScore = 0.85
  } else if (hoursBetween > 6) {
    confidenceScore = 0.95
  }

  // authority:governed recovery.record_attribution
  const intentResult = await submitIntent({
    intentId: crypto.randomUUID(),
    intentType: 'recovery.record_attribution',
    intentVersion: 1,
    tenantId,
    actor: 'system:attribution',
    source: 'app',
    timestamp: new Date().toISOString(),
    causationId: null,
    correlationId: null,
    payload: {
      invoiceId,
      paymentId: paymentId ?? null,
      reminderEventId: reminder.id,
      attributionType: 'last_touch',
      attributionWindowHours,
      confidenceScore,
    },
    nonce: crypto.randomUUID(),
  }, 'app')

  if (!intentResult.accepted) {
    console.error('[Attribution] Authority rejected attribution:', intentResult.error)
  }

  // Emit recovery completed event
  await emitRecoveryCompleted({
    invoiceId,
    tenantId,
    amount: 0, // Will be updated by caller
    reminderEventId: reminder.id,
    attributionType: 'last_touch',
    confidenceScore,
    causationId: reminder.causation_id,
  })

  console.log('[Attribution] Recovery attributed to reminder:', {
    invoiceId,
    reminderEventId: reminder.id,
    hoursBetween,
    confidenceScore,
  })

  return {
    attributed: true,
    reminderEventId: reminder.id,
    attributionType: 'last_touch',
    confidenceScore,
    hoursBetweenReminderAndPayment: hoursBetween,
  }
}

/**
 * Get recovery attributions for an invoice.
 * Returns the timeline of reminders and payments.
 */
export async function getInvoiceRecoveryTimeline(invoiceId: string): Promise<{
  events: Array<{ id: string; type: string; timestamp: string; payload: Record<string, unknown> | null }>
  attributions: any[]
}> {
  // Get all outbox events for this invoice
  const { data: events, error } = await supabaseAdmin
    .from('outbox')
    .select('*')
    .eq('entity_id', invoiceId)
    .in('type', [
      'recovery.reminder.sent',
      'recovery.reminder.delivered',
      'recovery.reminder.failed',
      'payment.completed',
      'payment.reconciled',
      'recovery.completed',
    ])
    .order('created_at', { ascending: true })

  if (error || !events) return { events: [], attributions: [] }

  // Get attributions for this invoice
  const { data: attributions } = await supabaseAdmin
    .from('recovery_attributions')
    .select('*')
    .eq('invoice_id', invoiceId)

  return {
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      timestamp: e.created_at,
      payload: e.payload,
    })),
    attributions: attributions || [],
  }
}

/**
 * Get recovery metrics for a tenant.
 */
export async function getTenantRecoveryMetrics(tenantId: string): Promise<{
  totalRecovered: number
  recoveryEfficiencyRate: number
  averageTimeToRecovery: number
  totalOutstanding: number
  recoveredViaAutomation: number
}> {
  // Get total outstanding
  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('total, paid_amount, status')
    .eq('tenant_id', tenantId)

  if (!invoices || invoices.length === 0) {
    return {
      totalRecovered: 0,
      recoveryEfficiencyRate: 0,
      averageTimeToRecovery: 0,
      totalOutstanding: 0,
      recoveredViaAutomation: 0,
    }
  }

  const totalOutstanding = invoices
    .filter((inv) => inv.status !== 'paid')
    .reduce((sum, inv) => sum + (inv.total - inv.paid_amount), 0)

  const totalRecovered = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.paid_amount, 0)

  // Get recovery attributions
  const { data: attributions } = await supabaseAdmin
    .from('recovery_attributions')
    .select('*, invoices!inner(total)')
    .eq('invoices.tenant_id', tenantId)

  const recoveredViaAutomation = attributions?.length || 0

  // Calculate average time to recovery
  const { data: paidInvoices } = await supabaseAdmin
    .from('invoices')
    .select('due_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'paid')
    .not('due_at', 'is', null)

  let averageTimeToRecovery = 0
  if (paidInvoices && paidInvoices.length > 0) {
    const totalDays = paidInvoices.reduce((sum, inv) => {
      const dueDate = new Date(inv.due_at)
      const paidDate = new Date(inv.updated_at)
      return sum + (paidDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    }, 0)
    averageTimeToRecovery = totalDays / paidInvoices.length
  }

  const recoveryEfficiencyRate = totalOutstanding > 0
    ? (totalRecovered / (totalRecovered + totalOutstanding)) * 100
    : 0

  return {
    totalRecovered,
    recoveryEfficiencyRate: Math.round(recoveryEfficiencyRate * 10) / 10,
    averageTimeToRecovery: Math.round(averageTimeToRecovery * 10) / 10,
    totalOutstanding,
    recoveredViaAutomation,
  }
}
