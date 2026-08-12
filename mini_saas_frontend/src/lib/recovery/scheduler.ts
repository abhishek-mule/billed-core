// authority:exempt ephemeral_operational_state — Recovery Scheduler
// Runs every 5 minutes (cron). DUMB by design: it only finds due actions,
// validates them, emits a domain event to the outbox, and marks them
// in_progress. It never computes policy logic and never calls a transport API.
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { pollOutboxEvents, markEventProcessing, markEventCompleted, markEventFailed } from '@/lib/billzo/outbox'
import { EventType } from '@billzo/shared'
import { getAutoRecoveryGate } from './enforcement'

const MAX_ATTEMPTS = 5

export interface SchedulerResult {
  due: number
  dispatched: number
  skipped: number
  errors: number
}

/**
 * Execute all collection_actions that are due (status='scheduled' and
 * scheduled_at <= now). For each: validate the underlying invoice is still
 * unpaid, emit a transport-agnostic domain event, and mark in_progress.
 */
export async function runRecoveryScheduler(limit = 200): Promise<SchedulerResult> {
  const now = new Date().toISOString()

  const { data: due, error } = await supabaseAdmin
    .from('collection_actions')
    .select('id, tenant_id, customer_id, invoice_ids, action_type, template_name, channel, trigger_type, attempt_count, metadata, source')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[Scheduler] failed to load due actions', error)
    return { due: 0, dispatched: 0, skipped: 0, errors: 1 }
  }

  // Bulk load auto-recovery gates for every tenant touched (avoids N+1).
  const gateCache = new Map<string, { entitled: boolean; enabled: boolean; blocked: boolean }>()
  const tenantIds = [...new Set((due || []).map((a: any) => a.tenant_id).filter(Boolean))] as string[]
  await Promise.all(tenantIds.map(async (tid) => {
    gateCache.set(tid, await getAutoRecoveryGate(tid))
  }))

  let dispatched = 0
  let skipped = 0
  let errors = 0

  for (const action of due || []) {
    try {
      // Enforcement gate: automatic (source='system') actions must not dispatch
      // for tenants without auto_recovery entitlement or with the toggle OFF.
      // Manual merchant actions always dispatch.
      if (action.source === 'system') {
        const gate = gateCache.get(action.tenant_id)
        if (gate?.blocked) {
          await cancelAction(action.id, 'auto_recovery_env_blocked')
          skipped++
          continue
        }
      }

      const valid = await validateAction(action)
      if (!valid) {
        await cancelAction(action.id, 'invoice_paid_or_cancelled')
        skipped++
        continue
      }

      // Emit a domain event the existing transport workers consume.
      const eventType =
        action.action_type === 'call' ? EventType.SEND_MESSAGE_INTENDED : EventType.RECOVERY_REMINDER_SENT

      await supabaseAdmin.from('outbox').insert({
        type: eventType,
        tenant_id: action.tenant_id,
        entity_id: action.id,
        payload: {
          collectionActionId: action.id,
          customerId: action.customer_id,
          invoiceIds: action.invoice_ids,
          actionType: action.action_type,
          templateName: action.template_name,
          channel: action.channel,
          triggerType: action.trigger_type,
          consolidated: (action.invoice_ids?.length ?? 0) > 1,
        },
        correlation_id: `ca:${action.id}`,
        status: 'pending',
        next_attempt_at: now,
        attempts: 0,
      })

      // Mark in_progress + record lifecycle event.
      await supabaseAdmin
        .from('collection_actions')
        .update({
          status: 'in_progress',
          executed_at: now,
          attempt_count: (action.attempt_count ?? 0) + 1,
          last_attempt_at: now,
          updated_at: now,
        })
        .eq('id', action.id)

      await supabaseAdmin.from('collection_action_events').insert({
        action_id: action.id,
        event_type: 'processing',
        from_status: 'scheduled',
        to_status: 'in_progress',
        payload: { dispatchedAt: now },
      })

      dispatched++
    } catch (err) {
      console.error('[Scheduler] action failed', action.id, err)
      errors++
    }
  }

  return { due: (due || []).length, dispatched, skipped, errors }
}

/** Validate an action is still worth executing (invoice unpaid, not cancelled). */
async function validateAction(action: any): Promise<boolean> {
  const invoiceIds: string[] = action.invoice_ids || []
  if (invoiceIds.length === 0) return false

  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('status')
    .in('id', invoiceIds)

  if (!invoices || invoices.length === 0) return false
  // If every linked invoice is paid, the action is moot.
  const allPaid = invoices.every((i: any) => i.status === 'paid')
  return !allPaid
}

async function cancelAction(actionId: string, reason: string): Promise<void> {
  const now = new Date().toISOString()
  await supabaseAdmin
    .from('collection_actions')
    .update({ status: 'cancelled', cancelled_at: now, cancel_reason: reason, updated_at: now })
    .eq('id', actionId)
  await supabaseAdmin.from('collection_action_events').insert({
    action_id: actionId,
    event_type: 'cancelled',
    from_status: 'scheduled',
    to_status: 'cancelled',
    payload: { reason },
  })
}

/** Drain recovery domain events emitted by the scheduler (transport dispatch). */
export async function drainRecoveryOutbox(limit = 100): Promise<number> {
  const events = await pollOutboxEvents(limit)
  const recovery = events.filter(
    (e) => e.type === EventType.RECOVERY_REMINDER_SENT || e.type === EventType.SEND_MESSAGE_INTENDED,
  )
  for (const ev of recovery) {
    await markEventProcessing(ev.id)
    try {
      // The existing WhatsApp/call workers consume these event types and perform
      // the actual transport. Here we simply mark completion once emitted.
      await markEventCompleted(ev.id)
    } catch (err) {
      console.error('[Scheduler] outbox drain failed', ev.id, err)
      await markEventFailed(ev.id, ev.attempts + 1, MAX_ATTEMPTS)
    }
  }
  return recovery.length
}
