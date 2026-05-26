import { Worker, Job, Queue } from 'bullmq'
import { createRedisConnection } from '../lib/redis'
import { pollOutboxEvents, markEventProcessing, markEventCompleted, markEventFailed } from '../src/lib/billzo/outbox'
import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { withLock } from '../lib/lock'
import { logWorkerEvent, logWorkerError } from '../lib/logging'
import { startBaileysSocket, disconnectBaileys } from '../lib/baileys-socket'
import { sendPushNotification } from '../src/lib/billzo/notifications'
import { TRANSPORT_PRECEDENCE } from '../src/lib/billzo/engagement'
import type { ProjectionTransportState, ProjectionDeliveryHealth } from '@billzo/shared'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'

export function createOutboxWorker() {
  const connection = createRedisConnection()

  const worker = new Worker(
    'outbox',
    async (job: Job) => {
      const startTime = Date.now()

      try {
        const events = await pollOutboxEvents(50)

        if (events.length === 0) {
          return { processed: 0 }
        }

        let processed = 0

        for (const event of events) {
          const eventStartTime = Date.now()

          const lockKey = `outbox:${event.id}`
          const result = await withLock(lockKey, 30000, async () => {
            await markEventProcessing(event.id)

            try {
              await processOutboxEvent(event)
              await markEventCompleted(event.id)

              const duration = Date.now() - eventStartTime
              logWorkerEvent({
                event_id: event.id,
                tenant_id: event.tenantId,
                entity_id: event.entityId,
                correlation_id: event.correlationId,
                queue_name: 'outbox',
                attempt: event.attempts,
                status: 'success',
                duration_ms: duration,
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `Processed event: ${event.type}`,
              })

              return true
            } catch (err: any) {
              const duration = Date.now() - eventStartTime
              logWorkerError(err as Error, {
                event_id: event.id,
                tenant_id: event.tenantId,
                entity_id: event.entityId,
                queue_name: 'outbox',
                attempt: event.attempts,
                duration_ms: duration,
                message: `Failed to process event: ${event.type}`,
              })

              await markEventFailed(event.id, event.attempts + 1)
              return false
            }
          })

          if (result !== null) {
            processed++
          }
        }

        return { processed }
      } catch (err: any) {
        logWorkerError(err as Error, {
          tenant_id: 'unknown',
          queue_name: 'outbox',
          attempt: 0,
          duration_ms: Date.now() - startTime,
          status: 'failed',
          message: 'Outbox worker error',
        })
        throw err
      }
    },
    {
      connection,
      concurrency: 5,
    }
  )

  worker.on('completed', (job) => {
    console.log(`[OutboxWorker] Job ${job.id} completed:`, job.returnvalue)
  })

  worker.on('failed', (job, err) => {
    console.error(`[OutboxWorker] Job ${job?.id} failed:`, err.message)
  })

  return worker
}

async function processOutboxEvent(event: any): Promise<void> {
  // Isolated projection handlers — each catches its own errors
  // so a failure in one concern does not block others.
  const projections = [
    tryHandleTransportProjection,
    tryHandleAttribution,
    tryHandleEscalation,
    tryHandleRecoveryCaseProjection,
    tryHandleNotifications,
    tryHandleBaileysLifecycle,
    tryHandleRedisPublish,
  ]

  for (const projection of projections) {
    try {
      await projection(event)
    } catch (err: any) {
      console.error(`[Outbox] Projection ${projection.name} failed for ${event.type}:`, err.message)
    }
  }
}

// ============================================================
// RECOVERY CASE PROJECTION — Invoice collection behavioral entity
// ============================================================
async function tryHandleRecoveryCaseProjection(event: any): Promise<void> {
  // Create recovery case on first reminder; update activity timestamp on subsequent events
  if (event.type === 'whatsapp.status.updated' || event.type === 'recovery.reminder.sent') {
    const invoiceId = event.entityId
    const tenantId = event.tenantId
    if (!invoiceId || !tenantId) return

    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('customer_id, total')
      .eq('id', invoiceId)
      .single()

    if (!invoice || !invoice.customer_id) return

    const now = new Date().toISOString()

    // Find existing open recovery case for this tenant + customer
    const { data: existing } = await supabaseAdmin
      .from('recovery_cases')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('customer_id', invoice.customer_id)
      .eq('status', 'open')
      .limit(1)
      .single()

    if (existing) {
      await supabaseAdmin
        .from('recovery_cases')
        .update({ last_activity_at: now, updated_at: now })
        .eq('id', existing.id)
    } else {
      await supabaseAdmin
        .from('recovery_cases')
        .insert({
          tenant_id: tenantId,
          customer_id: invoice.customer_id,
          status: 'open',
          total_outstanding: invoice.total || 0,
          invoice_count: 1,
          last_activity_at: now,
        })
    }
  }
}

// ============================================================
// 1. TRANSPORT PROJECTION — WhatsApp status → invoice state
// ============================================================
async function tryHandleTransportProjection(event: any): Promise<void> {
  if (event.type === 'whatsapp.status.updated') {
    const state = await handleWhatsAppStatusUpdated(event)
    if (state && state.billzoMessageId) {
      await updateMessageProjection(state)
    }
  }
  if (event.type === 'whatsapp.upi_clicked') {
    await handleUpiClicked(event)
  }
}

// ============================================================
// 2. ATTRIBUTION — Payment → recovery attribution
// ============================================================
async function tryHandleAttribution(event: any): Promise<void> {
  if (event.type === 'payment.completed' || event.type === 'payment.reconciled') {
    await handlePaymentEvent(event)
  }
}

// ============================================================
// 3. ESCALATION — Recovery escalation signals
// ============================================================
async function tryHandleEscalation(event: any): Promise<void> {
  if (event.type === 'recovery.escalation.suggested') {
    await handleEscalationSuggested(event)
  }
  if (event.type === 'recovery.reminder.sent') {
    await handleReminderEvent(event)
  }
}

// ============================================================
// 4. NOTIFICATIONS — Push notifications
// ============================================================
async function tryHandleNotifications(event: any): Promise<void> {
  if (event.type === 'whatsapp.circuit_open') {
    await handleWhatsAppCircuitOpen(event)
  }
  if (event.type === 'invoice.overdue') {
    await handleOverdueEvent(event)
  }
}

// ============================================================
// 5. BAILEYS LIFECYCLE — Socket management
// ============================================================
async function tryHandleBaileysLifecycle(event: any): Promise<void> {
  if (event.type === 'whatsapp.pair.requested') {
    await handleWhatsAppPairRequested(event)
  }
  if (event.type === 'whatsapp.unpaired') {
    await handleWhatsAppUnpaired(event)
  }
}

// ============================================================
// 6. REDIS PUBLISH — Real-time pub/sub (best-effort)
// ============================================================
async function tryHandleRedisPublish(event: any): Promise<void> {
  // Redis publish is non-critical; already handled inline in each handler.
  // This is a placeholder for future pub/sub fan-out.
}

async function publishToRedis(tenantId: string, type: string, data: any): Promise<void> {
  try {
    const pub = createRedisConnection()
    await pub.publish(`events:${tenantId}`, JSON.stringify({ type, data, timestamp: Date.now() }))
    pub.disconnect()
  } catch {
    // non-critical
  }
}

async function handlePaymentEvent(event: any): Promise<void> {
  const { attributeRecovery } = await import('../src/lib/billzo/attribution')

  const invoiceId = event.entityId
  const tenantId = event.tenantId

  if (!invoiceId || !tenantId) return

  await attributeRecovery({
    invoiceId,
    tenantId,
    paymentId: event.payload?.paymentId,
    paymentTimestamp: event.createdAt,
  })

  await publishToRedis(tenantId, 'payment.completed', {
    invoiceId,
    amount: event.payload?.amount,
    provider: event.payload?.provider,
  })
}

async function handleReminderEvent(event: any): Promise<void> {
  console.log(`[OutboxWorker] Reminder sent: ${event.entityId}`)
  if (event.tenantId) {
    await publishToRedis(event.tenantId, 'recovery.reminder.sent', {
      invoiceId: event.entityId,
      stage: event.payload?.stage,
    })
  }
}

async function handleWhatsAppPairRequested(event: any): Promise<void> {
  const tenantId = event.tenantId
  if (!tenantId) return

  console.log(`[OutboxWorker] Starting Baileys pairing for tenant ${tenantId}`)
  await startBaileysSocket(tenantId)
}

async function handleWhatsAppUnpaired(event: any): Promise<void> {
  const tenantId = event.tenantId
  if (!tenantId) return

  console.log(`[OutboxWorker] Disconnecting Baileys for tenant ${tenantId}`)
  await disconnectBaileys(tenantId)
}

interface MessageProjectionState {
  billzoMessageId: string | null
  latestStatus: string
  latestEventSequence: number
  latestOccurredAt: string
  provider: string | null
  providerMessageId: string | null
  invoiceId: string | null
  tenantId: string
  eventId: string
}

function mapStatusToProjection(
  status: string,
): { transportState: ProjectionTransportState; deliveryHealth: ProjectionDeliveryHealth } | null {
  switch (status) {
    case 'queued':
      return { transportState: 'queued', deliveryHealth: 'healthy' }
    case 'sent':
      return { transportState: 'sent', deliveryHealth: 'healthy' }
    case 'server_ack':
      return { transportState: 'server_ack', deliveryHealth: 'healthy' }
    case 'delivered':
      return { transportState: 'delivered', deliveryHealth: 'healthy' }
    case 'received':
      return { transportState: 'received', deliveryHealth: 'healthy' }
    case 'read':
      return { transportState: 'read', deliveryHealth: 'healthy' }
    case 'failed':
      return { transportState: 'failed_terminal', deliveryHealth: 'retrying' }
    case 'rate_limited':
      return { transportState: 'sent', deliveryHealth: 'degraded' }
    default:
      return null
  }
}

async function handleWhatsAppStatusUpdated(event: any): Promise<MessageProjectionState | null> {
  const invoiceId = event.entityId
  const tenantId = event.tenantId
  const billzoMessageId = event.payload?.billzoMessageId
  const status = event.payload?.status
  const provider = event.payload?.provider || null
  const providerMessageId = event.payload?.providerMessageId || null

  if (!tenantId || !status) return null

  if (billzoMessageId) {
    // Read latest event state from the append-only stream
    const { data: latest } = await supabaseAdmin
      .from('whatsapp_events')
      .select('id, status, event_sequence, occurred_at')
      .eq('billzo_message_id', billzoMessageId)
      .order('event_sequence', { ascending: false })
      .limit(1)
      .single()

    if (latest) {
      const state: MessageProjectionState = {
        billzoMessageId,
        latestStatus: latest.status,
        latestEventSequence: latest.event_sequence,
        latestOccurredAt: latest.occurred_at,
        provider,
        providerMessageId,
        invoiceId: invoiceId || null,
        tenantId,
        eventId: latest.id,
      }

      if (invoiceId) {
        await supabaseAdmin
          .from('invoices')
          .update({
            last_whatsapp_status: state.latestStatus,
            last_whatsapp_at: state.latestOccurredAt,
          })
          .eq('id', invoiceId)
      }

      // Publish to Redis for real-time subscribers
      await publishToRedis(tenantId, 'whatsapp.status.updated', {
        invoiceId,
        status: state.latestStatus,
        billzoMessageId,
      })

      return state
    }
  } else {
    // Fallback: update invoice using status from payload (legacy events without billzoMessageId)
    if (invoiceId) {
      await supabaseAdmin
        .from('invoices')
        .update({ last_whatsapp_status: status, last_whatsapp_at: new Date().toISOString() })
        .eq('id', invoiceId)
    }

    await publishToRedis(tenantId, 'whatsapp.status.updated', {
      invoiceId,
      status,
      billzoMessageId,
    })
  }

  return null
}

// ============================================================
// MESSAGE PROJECTION — Fast read model for transport state
// ============================================================
async function updateMessageProjection(state: MessageProjectionState): Promise<void> {
  if (!state.billzoMessageId) return

  const mapping = mapStatusToProjection(state.latestStatus)
  if (!mapping) return

  const { transportState, deliveryHealth } = mapping
  const precedence = TRANSPORT_PRECEDENCE[transportState]
  const delivered = transportState === 'delivered' || transportState === 'read'
  const read = transportState === 'read'
  const failed = transportState === 'failed_terminal'

  const { error } = await supabaseAdmin.rpc('cas_upsert_projection', {
    p_billzo_message_id: state.billzoMessageId,
    p_transport_state: transportState,
    p_delivery_health: deliveryHealth,
    p_transport_precedence: precedence,
    p_latest_event_sequence: state.latestEventSequence,
    p_causal_occurred_at: state.latestOccurredAt,
    p_last_event_id: state.eventId,
    p_delivered: delivered,
    p_read: read,
    p_failed: failed,
    p_delivered_at: delivered ? state.latestOccurredAt : null,
    p_read_at: read ? state.latestOccurredAt : null,
    p_failed_at: failed ? state.latestOccurredAt : null,
    p_provider: state.provider,
    p_provider_message_id: state.providerMessageId,
  })

  if (error) {
    console.error('[Projection] CAS RPC failed', {
      billzoMessageId: state.billzoMessageId,
      error,
    })
  }
}

async function handleWhatsAppCircuitOpen(event: any): Promise<void> {
  const tenantId = event.tenantId
  if (!tenantId) return

  console.log(`[OutboxWorker] Circuit opened for tenant ${tenantId}`)

  await sendPushNotification({
    tenantId,
    title: 'WhatsApp Disconnected',
    body: 'Reminders switched to backup provider. Reconnect in Settings to restore full automation.',
    type: 'whatsapp_alert',
    url: '/settings/whatsapp',
  })

  await publishToRedis(tenantId, 'whatsapp.circuit_open', { tenantId })
}

async function handleUpiClicked(event: any): Promise<void> {
  const invoiceId = event.entityId
  const tenantId = event.tenantId
  if (!tenantId) return

  if (invoiceId) {
    const now = new Date().toISOString()
    await supabaseAdmin
      .from('invoices')
      .update({ last_whatsapp_status: 'clicked_upi', last_whatsapp_at: now })
      .eq('id', invoiceId)
  }

  await publishToRedis(tenantId, 'whatsapp.upi_clicked', {
    invoiceId,
    amount: event.payload?.amount,
  })
}

async function handleEscalationSuggested(event: any): Promise<void> {
  const invoiceId = event.entityId
  const tenantId = event.tenantId
  if (!invoiceId || !tenantId) return

  await supabaseAdmin
    .from('invoices')
    .update({ recovery_flag: 'call_customer' })
    .eq('id', invoiceId)

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('total, customers!inner(name)')
    .eq('id', invoiceId)
    .single()

  const amount = invoice?.total || 0
  const customerName = (invoice as any)?.customers?.name || 'Customer'

  await sendPushNotification({
    tenantId,
    title: `Call ${customerName} Now`,
    body: `₹${amount.toLocaleString('en-IN')} at risk — 3 reminders ignored. Call this customer.`,
    type: 'escalation',
    url: `/invoices/${invoiceId}`,
  })

  await publishToRedis(tenantId, 'recovery.escalation.suggested', {
    invoiceId,
    amount,
    customerName,
  })
}

async function handleOverdueEvent(event: any): Promise<void> {
  const invoiceId = event.entityId
  const tenantId = event.tenantId
  if (!invoiceId || !tenantId) return

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('recovery_stage')
    .eq('id', invoiceId)
    .single()

  const stage = invoice?.recovery_stage || 't1_soft'
  const connection = createRedisConnection()
  const queue = new Queue('reminders', { connection })
  try {
    await queue.add(`reminder:${invoiceId}:${stage}`, { invoiceId, tenantId, stage }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
    })
    console.log(`[OutboxWorker] Enqueued ${stage} reminder for overdue invoice ${invoiceId}`)
  } finally {
    await queue.close()
  }
}
