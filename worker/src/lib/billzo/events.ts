import crypto from 'crypto'
import { writeOutboxEvent, type OutboxWriteOptions } from './outbox'
import { generateCorrelationId } from './idempotency'
import { EventType, type BillzoEvent } from '@billzo/shared'
import { SpineWriter } from '../spine/spine-writer'
import type { SpineEventInput } from '@billzo/shared'
import { spineDiagnostics } from '../spine-diagnostics'

const spineWriter = new SpineWriter()

function billzoEventToSpineInput(event: Omit<BillzoEvent, 'version'>): SpineEventInput {
  const entityType = event.type.startsWith('invoice.') ? 'invoice'
    : event.type.startsWith('payment.') ? 'payment'
    : event.type.startsWith('recovery.') ? 'recovery_case'
    : event.type.startsWith('customer.') ? 'customer'
    : event.type.startsWith('whatsapp.') ? 'whatsapp_message'
    : event.type.startsWith('send_message.') ? 'whatsapp_message'
    : event.type.startsWith('projection.') || event.type.startsWith('behavioral.') || event.type.startsWith('profile.') ? 'whatsapp_message'
    : event.type.startsWith('orchestration.') ? 'tenant'
    : event.type.startsWith('inventory.') ? 'product'
    : event.type.startsWith('experiment.') ? 'tenant'
    : event.type.startsWith('sync.') ? 'tenant'
    : event.type.startsWith('analytics.') ? 'tenant'
    : event.type.startsWith('reminder.') ? 'recovery_case'
    : 'unknown'

  const sourceSystem = event.producer === 'api' ? 'api'
    : event.producer === 'worker' ? 'worker'
    : event.producer === 'webhook' ? 'webhook'
    : event.producer === 'cron' ? 'cron'
    : event.producer === 'client' ? 'client'
    : 'system'

  const externalRefs: Record<string, string | null> = {}
  if (event.payload) {
    if (event.payload['providerPaymentId']) externalRefs['razorpay_payment_id'] = event.payload['providerPaymentId'] as string
    if (event.payload['providerMessageId']) externalRefs['provider_message_id'] = event.payload['providerMessageId'] as string
    if (event.payload['billzoMessageId']) externalRefs['whatsapp_message_id'] = event.payload['billzoMessageId'] as string
    if (event.payload['messageId']) externalRefs['whatsapp_message_id'] = event.payload['messageId'] as string
  }

  return {
    entity_type: entityType,
    entity_id: event.entityId ?? event.tenantId,
    causal_id: event.causationId,
    correlation_id: event.correlationId,
    source_system: sourceSystem,
    idempotency_key: event.idempotencyKey ?? `auto:${event.type}:${event.entityId ?? event.tenantId}:${Date.now()}`,
    tenant_id: event.tenantId,
    payload: event.payload ?? {},
    external_refs: Object.keys(externalRefs).length > 0 ? externalRefs : undefined,
  }
}

// ============================================================
// EVENT EMISSION
// ============================================================

/**
 * Emit a business event to the outbox.
 * This writes the event in the same transaction context as the business state change.
 *
 * Usage:
 *   await emitEvent({
 *     type: EventType.INVOICE_PAID,
 *     tenantId: '...',
 *     entityId: invoiceId,
 *     payload: { amount: 5000, status: 'paid' },
 *     causationId: previousEventId,
 *     correlationId: generateCorrelationId(invoiceId),
 *   })
 */
export async function emitEvent(event: Omit<BillzoEvent, 'version'>): Promise<string> {
  // Phase 0 probe: detect missing causationId (unless root event)
  if (!event.causationId && event.type !== EventType.INVOICE_CREATED && event.type !== EventType.WHATSAPP_PAIR_REQUESTED) {
    spineDiagnostics.missingCausationId(event.type)
  }

  // Phase 0 probe: detect events without external identity references
  const transportPayloadKeys = ['providerMessageId', 'providerPaymentId', 'billzoMessageId', 'whatsapp_message_id']
  const hasExternalRef = transportPayloadKeys.some(k => event.payload && event.payload[k] != null)
  if (!hasExternalRef && (event.type.startsWith('whatsapp.') || event.type.startsWith('payment.'))) {
    spineDiagnostics.missingExternalRefs(event.type, event.entityId)
  }

  // Phase 2: dual-write — spine first, then outbox
  const spineInput = billzoEventToSpineInput(event)
  const spineResult = await spineWriter.append(spineInput)
  if (!spineResult.accepted) {
    spineDiagnostics.dateNowInDomain(`spine-writer:rejected:${event.type}`)
  }

  const options: OutboxWriteOptions = {
    type: event.type,
    tenantId: event.tenantId,
    entityId: event.entityId,
    payload: event.payload,
    causationId: spineResult.accepted ? spineResult.event_id : event.causationId,
    correlationId: event.correlationId,
    idempotencyKey: event.idempotencyKey,
    version: 1,
  }

  const eventId = await writeOutboxEvent(options)

  logStructuredEvent({
    eventId,
    spineEventId: spineResult.accepted ? spineResult.event_id : undefined,
    type: event.type,
    tenantId: event.tenantId,
    entityId: event.entityId,
    correlationId: event.correlationId,
    causationId: event.causationId,
    producer: event.producer,
  })

  return eventId
}

/**
 * Emit a payment completed event with recovery attribution context.
 */
export async function emitPaymentCompleted(params: {
  invoiceId: string
  tenantId: string
  customerId: string
  amount: number
  paymentId?: string
  provider?: string
  providerPaymentId?: string
  causationId?: string | null
  matchedBy?: 'payment_link' | 'fuzzy' | 'exact'
}): Promise<string> {
  const correlationId = generateCorrelationId(params.invoiceId)

  return emitEvent({
    type: EventType.PAYMENT_COMPLETED,
    tenantId: params.tenantId,
    entityId: params.invoiceId,
    payload: {
      customerId: params.customerId,
      amount: params.amount,
      paymentId: params.paymentId,
      provider: params.provider,
      providerPaymentId: params.providerPaymentId,
      matchedBy: params.matchedBy,
    },
    causationId: params.causationId || null,
    correlationId,
    producer: 'webhook',
    idempotencyKey: params.paymentId
      ? `payment:completed:${params.invoiceId}:${params.provider}:${params.providerPaymentId}`
      : null,
    retentionDays: 365,
  })
}

/**
 * Emit a recovery reminder sent event.
 */
export async function emitRecoveryReminderSent(params: {
  invoiceId: string
  tenantId: string
  customerId: string
  stage: string
  channel: string
  messageId?: string
  causationId?: string | null
}): Promise<string> {
  const correlationId = generateCorrelationId(params.invoiceId)

  return emitEvent({
    type: EventType.RECOVERY_REMINDER_SENT,
    tenantId: params.tenantId,
    entityId: params.invoiceId,
    payload: {
      customerId: params.customerId,
      stage: params.stage,
      channel: params.channel,
      messageId: params.messageId,
    },
    causationId: params.causationId || null,
    correlationId,
    producer: 'worker',
    idempotencyKey: `reminder:sent:${params.invoiceId}:${params.stage}:${new Date().toISOString().slice(0, 10)}`,
    retentionDays: 90,
  })
}

/**
 * Emit a recovery completed event (payment attributed to reminder).
 */
export async function emitRecoveryCompleted(params: {
  invoiceId: string
  tenantId: string
  customerId: string
  amount: number
  reminderEventId?: string
  attributionType?: string
  confidenceScore?: number
  causationId?: string | null
}): Promise<string> {
  const correlationId = generateCorrelationId(params.invoiceId)

  return emitEvent({
    type: EventType.RECOVERY_COMPLETED,
    tenantId: params.tenantId,
    entityId: params.invoiceId,
    payload: {
      customerId: params.customerId,
      amount: params.amount,
      reminderEventId: params.reminderEventId,
      attributionType: params.attributionType || 'last_touch',
      confidenceScore: params.confidenceScore || 1.0,
    },
    causationId: params.causationId || null,
    correlationId,
    producer: 'worker',
    idempotencyKey: `recovery:completed:${params.invoiceId}:${new Date().toISOString().slice(0, 10)}`,
    retentionDays: 365,
  })
}

/**
 * Emit a payment reconciled event.
 */
export async function emitPaymentReconciled(params: {
  invoiceId: string
  tenantId: string
  customerId: string
  amount: number
  provider: string
  providerPaymentId: string
  matchedBy: 'payment_link' | 'fuzzy' | 'exact'
  causationId?: string | null
}): Promise<string> {
  const correlationId = generateCorrelationId(params.invoiceId)

  return emitEvent({
    type: EventType.PAYMENT_RECONCILED,
    tenantId: params.tenantId,
    entityId: params.invoiceId,
    payload: {
      customerId: params.customerId,
      amount: params.amount,
      provider: params.provider,
      providerPaymentId: params.providerPaymentId,
      matchedBy: params.matchedBy,
    },
    causationId: params.causationId || null,
    correlationId,
    producer: 'webhook',
    idempotencyKey: `payment:reconciled:${params.invoiceId}:${params.provider}:${params.providerPaymentId}`,
    retentionDays: 365,
  })
}

// ============================================================
// STRUCTURED LOGGING
// ============================================================

interface StructuredLogEntry {
  eventId: string
  spineEventId?: string
  type: string
  tenantId: string
  entityId: string | null
  correlationId: string
  causationId: string | null
  producer: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
}

function logStructuredEvent(entry: Omit<StructuredLogEntry, 'timestamp' | 'level'>) {
  const logEntry: StructuredLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    level: 'info',
  }

  console.log(JSON.stringify(logEntry))
}

/**
 * Emit a WhatsApp pair request event.
 */
export async function emitWhatsAppPairRequested(params: {
  tenantId: string
  causationId?: string | null
}): Promise<string> {
  return emitEvent({
    type: EventType.WHATSAPP_PAIR_REQUESTED,
    tenantId: params.tenantId,
    entityId: null,
    payload: {},
    causationId: params.causationId || null,
    correlationId: `pair:${params.tenantId}:${Date.now()}`,
    producer: 'api',
    idempotencyKey: `whatsapp:pair:${params.tenantId}:${new Date().toISOString().slice(0, 10)}`,
    retentionDays: 7,
  })
}

/**
 * Emit a WhatsApp status updated event (from webhook or delivery receipt).
 */
export async function emitWhatsAppStatusUpdated(params: {
  billzoMessageId?: string | null
  invoiceId?: string | null
  tenantId: string
  status: string
  provider: string
  providerMessageId: string | null
  timestamp: string
  causationId?: string | null
}): Promise<string> {
  const eventId = crypto.randomUUID()
  const correlationId = generateCorrelationId(params.invoiceId || params.tenantId)

  return emitEvent({
    type: EventType.WHATSAPP_STATUS_UPDATED,
    tenantId: params.tenantId,
    entityId: params.invoiceId || null,
    payload: {
      eventId,
      billzoMessageId: params.billzoMessageId || null,
      status: params.status,
      provider: params.provider,
      providerMessageId: params.providerMessageId,
      timestamp: params.timestamp,
    },
    causationId: params.causationId || null,
    correlationId,
    producer: 'webhook',
    idempotencyKey: `whatsapp:status:${eventId}`,
    retentionDays: 90,
  })
}

/**
 * Emit a WhatsApp circuit open event.
 */
export async function emitWhatsAppCircuitOpen(params: {
  tenantId: string
  failures: number
  causationId?: string | null
}): Promise<string> {
  return emitEvent({
    type: EventType.WHATSAPP_CIRCUIT_OPEN,
    tenantId: params.tenantId,
    entityId: null,
    payload: { failures: params.failures },
    causationId: params.causationId || null,
    correlationId: `circuit:${params.tenantId}:${Date.now()}`,
    producer: 'worker',
    idempotencyKey: `whatsapp:circuit:${params.tenantId}:${new Date().toISOString().slice(0, 10)}`,
    retentionDays: 30,
  })
}

export function logStructuredError(error: Error, context: Record<string, unknown>) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'error' as const,
    message: error.message,
    stack: error.stack,
    ...context,
  }

  console.error(JSON.stringify(logEntry))
}
