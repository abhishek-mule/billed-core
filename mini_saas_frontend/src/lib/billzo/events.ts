import { writeOutboxEvent, type OutboxWriteOptions } from './outbox'
import { generateCorrelationId } from './idempotency'
import { EventType, type EventProducer, type BillzoEvent } from '@billzo/shared'

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
  const options: OutboxWriteOptions = {
    type: event.type,
    tenantId: event.tenantId,
    entityId: event.entityId,
    payload: event.payload,
    causationId: event.causationId,
    correlationId: event.correlationId,
    idempotencyKey: event.idempotencyKey,
    version: 1,
  }

  const eventId = await writeOutboxEvent(options)

  // Structured log
  logStructuredEvent({
    eventId,
    type: event.type,
    tenantId: event.tenantId,
    entityId: event.entityId,
    correlationId: event.correlationId,
    causationId: event.causationId,
    producer: 'api',
  })

  return eventId
}

/**
 * Emit a payment completed event with recovery attribution context.
 */
export async function emitPaymentCompleted(params: {
  invoiceId: string
  tenantId: string
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
 * Emit a WhatsApp status updated event (from webhook or delivery receipt).
 */
export async function emitWhatsAppStatusUpdated(params: {
  eventId: string
  billzoMessageId: string | null
  invoiceId: string | null
  tenantId: string
  status: string
  provider: string
  providerMessageId: string | null
  timestamp: string
  causationId?: string | null
}): Promise<string> {
  const correlationId = generateCorrelationId(params.invoiceId || params.tenantId)

  return emitEvent({
    type: EventType.WHATSAPP_STATUS_UPDATED,
    tenantId: params.tenantId,
    entityId: params.invoiceId,
    payload: {
      eventId: params.eventId,
      billzoMessageId: params.billzoMessageId,
      status: params.status,
      provider: params.provider,
      providerMessageId: params.providerMessageId,
      timestamp: params.timestamp,
    },
    causationId: params.causationId || null,
    correlationId,
    producer: 'webhook',
    idempotencyKey: `whatsapp:status:${params.eventId}:${params.status}`,
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
