import { Worker, Job, Queue } from 'bullmq'
import { getRedis, createRedisConnection } from '../lib/redis'
import { pollOutboxEvents, markEventProcessing, markEventCompleted, markEventFailed, writeOutboxEvent } from '../src/lib/billzo/outbox'
import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { withLock } from '../lib/lock'
import { logWorkerEvent, logWorkerError } from '../lib/logging'
import { createQueueLogger } from '../lib/queue-logger'
import { startBaileysSocket, disconnectBaileys } from '../lib/baileys-socket'
import { sendPushNotification } from '../src/lib/billzo/notifications'
import { TRANSPORT_PRECEDENCE } from '../src/lib/billzo/engagement'
import { interpretProjectionDelta } from '../src/lib/billzo/observation-interpreter'
import { materializeObservation } from '../src/lib/billzo/behavioral-materializer'
import { attributeRecovery } from '../src/lib/billzo/attribution'
import type { ProjectionTransportState, ProjectionDeliveryHealth, ProjectionDelta } from '@billzo/shared'
import { EventType, generateEventSequence } from '@billzo/shared'
import { tryHandleSendMessageIntent } from '../src/lib/billzo/send-message-handler'
import { enqueueCognitionJob } from './cognition'
import { transitionCase } from '../src/lib/recovery/case-machine'
import type { CurrentCase, SignalEvent } from '../src/lib/recovery/case-machine'
import type { InternalAuthorityClient } from '../src/lib/authority/internal-authority'
import { spineDiagnostics } from '../src/lib/spine-diagnostics'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'
const logger = createQueueLogger('outbox')

// Phase 0 probe: per-entity last-seen sequence number for out-of-order detection
const lastEntitySequence = new Map<string, number>()

let _authorityClient: InternalAuthorityClient | null = null

export function createOutboxWorker(authority?: InternalAuthorityClient) {
  if (authority) _authorityClient = authority
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
    logger.info({ jobId: job.id, result: job.returnvalue }, 'Job completed')
  })

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Job failed')
  })

  return worker
}

type HandlerLane = 'transport' | 'behavior' | 'recovery' | 'cognition' | 'attribution' | 'notification'

interface LaneHandler {
  lane: HandlerLane
  priority: number
  handle(event: any): Promise<void>
  name: string
}

// Lane ordering: transport → behavior → attribution → notification
// Within each lane, handlers execute by priority (lower = first)
const HANDLER_LANES: LaneHandler[] = [
  // TRANSPORT LANE — Physical delivery truth
  { lane: 'transport', priority: 0, name: 'tryHandleSendMessageIntent', handle: tryHandleSendMessageIntent },
  { lane: 'transport', priority: 1, name: 'tryHandleTransportProjection', handle: tryHandleTransportProjection },

  // BEHAVIOR LANE — Observation interpretation → behavioral memory
  { lane: 'behavior', priority: 1, name: 'tryHandleObservationInterpreter', handle: tryHandleObservationInterpreter },
  { lane: 'behavior', priority: 2, name: 'tryHandleBehavioralMaterializer', handle: tryHandleBehavioralMaterializer },
  { lane: 'behavior', priority: 3, name: 'tryHandleRecoveryCaseProjection', handle: tryHandleRecoveryCaseProjection },

  // RECOVERY LANE — Canonical state machine for customer collection position
  { lane: 'recovery', priority: 1, name: 'tryHandleRecoveryCaseStateMachine', handle: tryHandleRecoveryCaseStateMachine },

  // COGNITION LANE — Trigger attention pipeline recompute on relevant events
  { lane: 'cognition', priority: 1, name: 'tryHandleCognitionTrigger', handle: tryHandleCognitionTrigger },

  // ATTRIBUTION LANE — Economic causality
  { lane: 'attribution', priority: 1, name: 'tryHandleAttribution', handle: tryHandleAttribution },
  { lane: 'attribution', priority: 2, name: 'tryHandleEscalation', handle: tryHandleEscalation },

  // NOTIFICATION LANE — Presentation layer
  { lane: 'notification', priority: 1, name: 'tryHandleNotifications', handle: tryHandleNotifications },
  { lane: 'notification', priority: 2, name: 'tryHandleBaileysLifecycle', handle: tryHandleBaileysLifecycle },
  { lane: 'notification', priority: 3, name: 'tryHandleRedisPublish', handle: tryHandleRedisPublish },
]

export async function processOutboxEvent(event: any): Promise<void> {
  // Phase 0 probe: detect missing causation_id
  if (!event.causationId && event.type !== 'invoice.created') {
    spineDiagnostics.missingCausationId(event.type)
  }

  // Phase 0 probe: detect missing external references
  if (event.type?.startsWith('whatsapp.') || event.type?.startsWith('payment.')) {
    const payload = event.payload || {}
    if (!payload.providerMessageId && !payload.providerPaymentId && !payload.billzoMessageId) {
      spineDiagnostics.missingExternalRefs(event.type, event.entityId)
    }
  }

  // Phase 0 probe: detect out-of-order events via sequence tracking
  if (event.entityId) {
    const lastSeq = lastEntitySequence.get(event.entityId)
    if (lastSeq !== undefined && event.sequence_no !== undefined && event.sequence_no <= lastSeq) {
      spineDiagnostics.outOfOrderEvent(event.entityId, lastSeq + 1, event.sequence_no)
    }
    if (event.sequence_no !== undefined) {
      lastEntitySequence.set(event.entityId, event.sequence_no)
    }
  }

  // Execute handlers in lane order (transport → behavior → attribution → notification)
  // Each handler catches its own errors — a failure in one concern does not block others.
  const laneOrder: HandlerLane[] = ['transport', 'behavior', 'recovery', 'cognition', 'attribution', 'notification']

  for (const lane of laneOrder) {
    const laneHandlers = HANDLER_LANES
      .filter(h => h.lane === lane)
      .sort((a, b) => a.priority - b.priority)

    for (const handler of laneHandlers) {
      try {
        await handler.handle(event)
      } catch (err: any) {
        logger.error({ handler: handler.name, lane: handler.lane, eventType: event.type, err: err.message }, 'Handler failed')
      }
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
      .select('id, customer_id, total')
      .eq('id', invoiceId)
      .single()

    if (!invoice || !invoice.customer_id) return

    if (_authorityClient) {
      const result = await _authorityClient.submit({
        intentType: 'recovery.upsert_case',
        intentVersion: 1,
        tenantId,
        actor: 'system:outbox',
        payload: {
          customerId: invoice.customer_id,
          invoiceId: invoice.id,
          totalOutstanding: invoice.total || 0,
        },
      }, 'trusted_sync')
      if (!result.accepted) {
        logger.error({ tenantId, err: result.error }, 'Authority rejected recovery case upsert')
      }
      return
    }

    // authority:fallback recovery.upsert_case
    spineDiagnostics.dualWrite('outbox:tryHandleRecoveryCaseProjection', 'recovery_cases')
    const now = new Date().toISOString()
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
// RECOVERY CASE STATE MACHINE — Canonical collection position
// ============================================================
// Drives the RecoveryCase truth spine from domain events.
// Runs AFTER behavioral materialization (engagement computed)
// but BEFORE cognition (pipeline reads fresh RecoveryCase state).
//
// Idempotency: every source event is tracked in
// recovery_case_event_consumptions. Duplicate events are silently
// skipped.

const RECOVERY_STATE_EVENTS = new Set([
  'invoice.created',
  'invoice.overdue',
  'payment.completed',
  'payment.reconciled',
  'recovery.reminder.sent',
  'recovery.reminder.delivered',
  'recovery.reminder.failed',
  'whatsapp.status.updated',
  'customer.called',
  'merchant.snoozed',
  'merchant.payment_reported',
  'recovery.completed',
])

async function tryHandleRecoveryCaseStateMachine(event: any): Promise<void> {
  console.log('[StateMachine] Ingesting event:', event.type, event.entityId);
  if (!RECOVERY_STATE_EVENTS.has(event.type)) {
    console.log('[StateMachine] Event type ignored:', event.type);
    return;
  }

  const tenantId = event.tenantId
  if (!tenantId) return

  // Resolve customer_id: from payload (merchant actions) or from invoice (system events)
  let customerId: string | undefined = event.payload?.customerId
  if (!customerId) {
    const invoiceId = event.entityId
    if (!invoiceId) return
    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('customer_id')
      .eq('id', invoiceId)
      .single()
    customerId = invoice?.customer_id
  }
  if (!customerId) return

  // 2. Read current RecoveryCase for this (tenant, customer)
  const { data: existing } = await supabaseAdmin
    .from('recovery_cases')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .limit(1)
    .single()

  const current: CurrentCase | null = existing
    ? {
        id: existing.id,
        tenantId: existing.tenant_id,
        customerId: existing.customer_id,
        invoiceCount: existing.invoice_count || 0,
        openInvoiceCount: existing.open_invoice_count || 0,
        overdueInvoiceCount: existing.overdue_invoice_count || 0,
        disputedInvoiceCount: existing.disputed_invoice_count || 0,
        promisedInvoiceCount: existing.promised_invoice_count || 0,
        totalOutstanding: existing.total_outstanding || 0,
        totalOverdue: existing.total_overdue || 0,
        recoveryState: existing.recovery_state_v2 || 'active',
        engagementState: existing.engagement_state_v2 || 'unseen',
        nextActionType: existing.next_action_type || null,
        nextActionDueAt: existing.next_action_due_at || null,
        lastActivityAt: existing.last_activity_at || null,
        promiseToPayDate: existing.promise_to_pay_date || null,
        attentionScore: existing.attention_score || 0,
        version: existing.version || 1,
      }
    : null

  // 3. Check idempotency
  if (current?.id) {
    const { data: consumed } = await supabaseAdmin
      .from('recovery_case_event_consumptions')
      .select('processed_at')
      .eq('source_event_id', event.id)
      .eq('case_id', current.id)
      .single()
    if (consumed) return // already processed
  }

  // 4. Build signal event for the state machine
  const invoiceId = event.entityId || null
  const signal: SignalEvent = {
    type: event.type,
    id: event.id,
    tenantId,
    customerId,
    invoiceId,
    amount: event.payload?.amount || event.payload?.total || null,
    invoiceStatus: event.payload?.status || null,
    dueDate: event.payload?.due_date || null,
    reminderStage: event.payload?.reminderStage || event.payload?.stage || null,
    deliveryStatus: event.payload?.deliveryStatus || event.payload?.status || null,
    failureCount: event.payload?.failureCount || event.payload?.consecutive_failures || null,
    merchantAction: event.payload?.merchantAction || event.payload?.reason || null,
    snoozeDuration: event.payload?.snoozeDuration || null,
    occurredAt: event.created_at || new Date().toISOString(),
  }

  // 5. Compute transition
  // Phase 0 probe: detect non-deterministic states (handleMerchantSnoozed uses Date.now())
  if (event.type === 'merchant.snoozed') {
    spineDiagnostics.dateNowInDomain('case-machine:handleMerchantSnoozed')
    spineDiagnostics.nonDeterministicUuid('case-machine:handleMerchantSnoozed')
  }
  const result = transitionCase(current, signal)
  console.log('[StateMachine] Transition result:', { 
    type: signal.type, 
    resultExists: !!result, 
    recoveryState: result?.recoveryState 
  });
  
  if (!result) {
    // No-op transition (e.g., first/second reminder failure)
    // Still record consumption if there's a case to prevent re-processing
    if (current?.id) {
      await supabaseAdmin
        .from('recovery_case_event_consumptions')
        .insert({ source_event_id: event.id, case_id: current.id })
        .then(() => {}, () => {})
    }
    return
  }

  // 6. Upsert case row with new state
  const caseId = current?.id || crypto.randomUUID()
  const now = new Date().toISOString()
  
  console.log('[StateMachine] Upserting case:', caseId, 'to state:', result.recoveryState || current?.recoveryState);

  const { error: upsertError } = await supabaseAdmin
    .from('recovery_cases')
    .upsert({
      id: caseId,
      tenant_id: tenantId,
      customer_id: customerId,
      // v2 state columns
      recovery_state_v2: result.recoveryState || current?.recoveryState || 'active',
      engagement_state_v2: result.engagementState || current?.engagementState || 'unseen',
      next_action_type: result.nextActionType || null,
      next_action_due_at: result.nextActionDueAt || null,
      attention_score: result.attentionScore ?? current?.attentionScore ?? 0,
      version: result.version,
      // Counts from current (updated by backfill/migration, maintained here)
      invoice_count: current?.invoiceCount || 1,
      open_invoice_count: current?.openInvoiceCount || 1,
      overdue_invoice_count: current?.overdueInvoiceCount || 0,
      disputed_invoice_count: current?.disputedInvoiceCount || 0,
      promised_invoice_count: current?.promisedInvoiceCount || 0,
      total_outstanding: current?.totalOutstanding || signal.amount || 0,
      total_overdue: current?.totalOverdue || 0,
      // Activity
      last_activity_at: now,
      updated_at: now,
    }, { onConflict: 'id' })

  if (upsertError) {
    logger.error({ tenantId, caseId, err: upsertError.message }, 'Failed to upsert recovery case')
    return
  } else {
    console.log('[StateMachine] Upsert successful for case:', caseId);
  }

  // 7. Insert recovery_case_event (append-only decision log)
  const { error: eventError } = await supabaseAdmin
    .from('recovery_case_events')
    .insert({
      case_id: caseId,
      event_type: result.event.eventType,
      from_recovery_state: result.event.fromRecoveryState,
      to_recovery_state: result.event.toRecoveryState,
      from_engagement_state: result.event.fromEngagementState,
      to_engagement_state: result.event.toEngagementState,
      reason: result.event.reason,
      trigger: result.event.trigger,
    })

  if (eventError) {
    logger.error({ tenantId, caseId, err: eventError.message }, 'Failed to insert recovery case event')
  }

  // 8. Record idempotency
  await supabaseAdmin
    .from('recovery_case_event_consumptions')
    .insert({ source_event_id: event.id, case_id: caseId })
    .then(() => {}, () => {})
}

// ============================================================
// COGNITION TRIGGER — Recompute attention pipeline on relevant events
// ============================================================
const COGNITION_TRIGGER_EVENTS = new Set([
  'payment.completed',
  'payment.reconciled',
  'invoice.created',
  'invoice.updated',
  'invoice.overdue',
  'recovery.reminder.sent',
  'recovery.reminder.delivered',
  'recovery.reminder.failed',
  'whatsapp.status.updated',
  'whatsapp.upi_clicked',
  'customer.called',
  'merchant.snoozed',
  'merchant.payment_reported',
  'recovery.completed',
])

async function tryHandleCognitionTrigger(event: any): Promise<void> {
  if (!COGNITION_TRIGGER_EVENTS.has(event.type)) return
  await enqueueCognitionJob(event.tenantId)
}

// ============================================================
// 6. OBSERVATION INTERPRETER — Transport delta → behavioral observation
// ============================================================
async function tryHandleObservationInterpreter(event: any): Promise<void> {
  if (event.type === EventType.PROJECTION_DELTA) {
    const delta: ProjectionDelta = {
      tenantId: event.tenantId,
      customerId: event.payload?.customerId,
      invoiceId: event.entityId,
      billzoMessageId: event.payload?.billzoMessageId,
      transportState: event.payload?.transportState,
      deliveryHealth: event.payload?.deliveryHealth,
      prevTransportState: event.payload?.prevTransportState,
      prevDeliveryHealth: event.payload?.prevDeliveryHealth,
      occurredAt: event.payload?.occurredAt,
      prevOccurredAt: event.payload?.prevOccurredAt || null,
    }

    if (!delta.customerId) return

    const observation = interpretProjectionDelta(delta)
    if (!observation) return

    await writeOutboxEvent({
      type: EventType.BEHAVIORAL_OBSERVATION,
      version: 1,
      tenantId: delta.tenantId,
      entityId: delta.customerId,
      payload: observation as unknown as Record<string, unknown>,
      causationId: event.id,
      correlationId: event.correlationId || '',
      idempotencyKey: null,
    })
  }
}

// ============================================================
// 7. BEHAVIORAL MATERIALIZER — Observation → behavioral memory
// ============================================================
async function tryHandleBehavioralMaterializer(event: any): Promise<void> {
  if (event.type === EventType.BEHAVIORAL_OBSERVATION) {
    const observation = event.payload
    if (!observation?.customerId) return

    await materializeObservation(observation, event.id)
  }
}

// ============================================================
// 8. REDIS PUBLISH — Real-time pub/sub (best-effort)
// ============================================================
async function tryHandleRedisPublish(event: any): Promise<void> {
  // Redis publish is non-critical; already handled inline in each handler.
  // This is a placeholder for future pub/sub fan-out.
}

async function publishToRedis(tenantId: string, type: string, data: any): Promise<void> {
  try {
    const pub = getRedis()
    await pub.publish(`events:${tenantId}`, JSON.stringify({ type, data, timestamp: Date.now() }))
  } catch {
    // non-critical
  }
}

async function handlePaymentEvent(event: any): Promise<void> {
  const invoiceId = event.entityId
  const tenantId = event.tenantId

  if (!invoiceId || !tenantId) return

  await attributeRecovery({
    invoiceId,
    tenantId,
    paymentId: event.payload?.paymentId,
    paymentTimestamp: event.createdAt,
  })

  // Re-run decision engine with fresh outstanding
  const { rerunDecisionEngine } = await import('../src/lib/recovery/rerun-engine')
  await rerunDecisionEngine(invoiceId, tenantId).catch((err: any) => {
    logger.error({ invoiceId, tenantId, err: err.message }, 'Failed to re-run decision engine after payment')
  })

  // Update customer reputation + auto-assign tier
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('customer_id')
    .eq('id', invoiceId)
    .single()
  if (invoice?.customer_id) {
    const { computeCustomerReputation } = await import('../src/lib/recovery/reputation')
    await computeCustomerReputation(tenantId, invoice.customer_id).catch((err: any) => {
      logger.error({ tenantId, customerId: invoice.customer_id, err: err.message }, 'Failed to compute reputation')
    })
  }

  await publishToRedis(tenantId, 'payment.completed', {
    invoiceId,
    amount: event.payload?.amount,
    provider: event.payload?.provider,
  })
}

async function handleReminderEvent(event: any): Promise<void> {
  logger.info({ entityId: event.entityId }, 'Reminder sent')
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

  logger.info({ tenantId }, 'Starting Baileys pairing')
  await startBaileysSocket(tenantId)
}

async function handleWhatsAppUnpaired(event: any): Promise<void> {
  const tenantId = event.tenantId
  if (!tenantId) return

  logger.info({ tenantId }, 'Disconnecting Baileys')
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
  customerId?: string
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

  // Resolve billzo_message_id from provider_message_id if not provided directly
  let resolvedBillzoMessageId = billzoMessageId
  if (!resolvedBillzoMessageId && providerMessageId) {
    const { data: existing } = await supabaseAdmin
      .from('whatsapp_events')
      .select('billzo_message_id')
      .or(`provider_message_id.eq.${providerMessageId},billzo_message_id.eq.${providerMessageId}`)
      .limit(1)
      .maybeSingle()
    resolvedBillzoMessageId = existing?.billzo_message_id || null
  }

  // Record the status event in the append-only stream (this IS the transport domain's mutation authority)
  let eventId: string | null = null
  if (resolvedBillzoMessageId) {
    const { data: latest } = await supabaseAdmin
      .from('whatsapp_events')
      .select('id, invoice_id, tenant_id')
      .eq('billzo_message_id', resolvedBillzoMessageId)
      .order('event_sequence', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latest) {
      const now = new Date().toISOString()
      eventId = crypto.randomUUID()
      await supabaseAdmin
        .from('whatsapp_events')
        .insert({
          id: eventId,
          billzo_message_id: resolvedBillzoMessageId,
          event_sequence: Number(generateEventSequence()),
          status,
          occurred_at: new Date(event.payload?.timestamp || now).toISOString(),
          created_at: now,
          invoice_id: latest.invoice_id || null,
          tenant_id: latest.tenant_id || tenantId,
          provider: provider || 'baileys',
          provider_message_id: providerMessageId,
          direction: 'outbound',
          event_layer: 'transport',
          sync_status: 'synced',
        })
    }
  }

  // Fetch customerId for projection delta
  let customerId: string | undefined

  if (resolvedBillzoMessageId) {
    // Read latest event state from the append-only stream
    const { data: latestEvent } = await supabaseAdmin
      .from('whatsapp_events')
      .select('id, status, event_sequence, occurred_at, invoice_id')
      .eq('billzo_message_id', resolvedBillzoMessageId)
      .order('event_sequence', { ascending: false })
      .limit(1)
      .single()

    if (latestEvent) {
      // Resolve customerId if we have an invoice
      if (latestEvent.invoice_id) {
        const { data: invoice } = await supabaseAdmin
          .from('invoices')
          .select('customer_id')
          .eq('id', latestEvent.invoice_id)
          .maybeSingle()
        customerId = invoice?.customer_id
      }

      const state: MessageProjectionState = {
        billzoMessageId: resolvedBillzoMessageId,
        latestStatus: latestEvent.status,
        latestEventSequence: latestEvent.event_sequence,
        latestOccurredAt: latestEvent.occurred_at,
        provider,
        providerMessageId,
        invoiceId: latestEvent.invoice_id || null,
        tenantId,
        eventId: latestEvent.id,
        customerId,
      }

      // Publish to Redis for real-time subscribers
      await publishToRedis(tenantId, 'whatsapp.status.updated', {
        invoiceId: latestEvent.invoice_id,
        status: state.latestStatus,
        billzoMessageId: resolvedBillzoMessageId,
      })

      return state
    }
  }

  return null
}

// ============================================================
// MESSAGE PROJECTION — Fast read model for transport state
// ============================================================
async function updateMessageProjection(state: MessageProjectionState): Promise<void> {
  if (!state.billzoMessageId) return

  // Capture previous state before CAS for delta computation
  const { data: prevProjection } = await supabaseAdmin
    .from('whatsapp_message_projection')
    .select('transport_state, delivery_health, causal_occurred_at')
    .eq('billzo_message_id', state.billzoMessageId)
    .maybeSingle()

  const prevTransportState = prevProjection?.transport_state || null
  const prevDeliveryHealth = prevProjection?.delivery_health || null
  const prevOccurredAt = prevProjection?.causal_occurred_at || null

  const mapping = mapStatusToProjection(state.latestStatus)
  if (!mapping) return

  const { transportState, deliveryHealth } = mapping
  const precedence = TRANSPORT_PRECEDENCE[transportState]
  const delivered = transportState === 'delivered' || transportState === 'read'
  const read = transportState === 'read'
  const failed = transportState === 'failed_terminal'

  const { data: casResult, error } = await supabaseAdmin.rpc('cas_upsert_projection', {
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
    logger.error({ billzoMessageId: state.billzoMessageId, error }, 'CAS RPC failed')
    return
  }

  // Emit projection.delta only on successful CAS (inserted or updated)
  if (casResult === 'inserted' || casResult === 'updated') {
    await emitProjectionDelta(state, transportState, deliveryHealth, prevTransportState, prevDeliveryHealth, prevOccurredAt)
  }
}

async function emitProjectionDelta(
  state: MessageProjectionState,
  transportState: string,
  deliveryHealth: string,
  prevTransportState: string | null,
  prevDeliveryHealth: string | null,
  prevOccurredAt: string | null,
): Promise<void> {
  if (!state.customerId) {
    return
  }

  // authority:exempt derived_state
  // Write to projection_delta_log for reinterpretation replay
  try {
    await supabaseAdmin.from('projection_delta_log').insert({
      tenant_id: state.tenantId,
      customer_id: state.customerId,
      invoice_id: state.invoiceId,
      billzo_message_id: state.billzoMessageId,
      transport_state: transportState,
      delivery_health: deliveryHealth,
      prev_transport_state: prevTransportState,
      prev_delivery_health: prevDeliveryHealth,
      occurred_at: state.latestOccurredAt,
    })
  } catch (err: any) {
    logger.error({ err: err.message }, 'Delta log insert failed')
  }

  // Write outbox event for the observation interpreter
  try {
    await writeOutboxEvent({
      type: EventType.PROJECTION_DELTA,
      version: 1,
      tenantId: state.tenantId,
      entityId: state.invoiceId,
      payload: {
        tenantId: state.tenantId,
        customerId: state.customerId,
        invoiceId: state.invoiceId,
        billzoMessageId: state.billzoMessageId,
        transportState,
        deliveryHealth,
        prevTransportState,
        prevDeliveryHealth,
        occurredAt: state.latestOccurredAt,
        prevOccurredAt,
      } as unknown as Record<string, unknown>,
      causationId: null,
      correlationId: '',
      idempotencyKey: `projection:delta:${state.billzoMessageId}:${transportState}`,
    })
  } catch (err: any) {
    logger.error({ err: err.message }, 'Delta outbox write failed')
  }
}

async function handleWhatsAppCircuitOpen(event: any): Promise<void> {
  const tenantId = event.tenantId
  if (!tenantId) return

  logger.warn({ tenantId }, 'Circuit opened for tenant')

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
    if (_authorityClient) {
      const now = new Date().toISOString()
      const result = await _authorityClient.submit({
        intentType: 'invoice.update_recovery_state',
        intentVersion: 1,
        tenantId,
        actor: 'system:outbox',
        payload: { invoiceId, lastWhatsappStatus: 'clicked_upi', lastWhatsappAt: now },
      }, 'trusted_sync')
      if (!result.accepted) {
        logger.error({ invoiceId, err: result.error }, 'Authority rejected recovery state update (UPI)')
      }
    } else {
      // authority:fallback invoice.update_recovery_state
      spineDiagnostics.dualWrite('outbox:handleUpiClicked', 'invoices')
      const now = new Date().toISOString()
      await supabaseAdmin
        .from('invoices')
        .update({ last_whatsapp_status: 'clicked_upi', last_whatsapp_at: now })
        .eq('id', invoiceId)
    }
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

  if (_authorityClient) {
    const result = await _authorityClient.submit({
      intentType: 'invoice.update_recovery_state',
      intentVersion: 1,
      tenantId,
      actor: 'system:outbox',
      payload: { invoiceId, recoveryFlag: 'call_customer' },
    }, 'trusted_sync')
    if (!result.accepted) {
      logger.error({ invoiceId, err: result.error }, 'Authority rejected recovery state update (escalation)')
    }
  } else {
    // authority:fallback invoice.update_recovery_state
    spineDiagnostics.dualWrite('outbox:handleEscalationSuggested', 'invoices')
    await supabaseAdmin
      .from('invoices')
      .update({ recovery_flag: 'call_customer' })
      .eq('id', invoiceId)
  }

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
    logger.info({ invoiceId, stage }, 'Enqueued reminder for overdue invoice')
  } finally {
    await queue.close()
  }
}
