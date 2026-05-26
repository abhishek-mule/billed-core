import { writeOutboxEvent, type OutboxWriteOptions } from './outbox'
import { generateCorrelationId } from './idempotency'

// ============================================================
// EVENT TAXONOMY — Business-significant events only
// ============================================================

export const EventType = {
  // Billing
  INVOICE_CREATED: 'invoice.created',
  INVOICE_UPDATED: 'invoice.updated',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_OVERDUE: 'invoice.overdue',
  INVOICE_DELETED: 'invoice.deleted',

  // Payments
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_LINK_GENERATED: 'payment.link.generated',
  PAYMENT_RECONCILED: 'payment.reconciled',

  // Recovery
  RECOVERY_STARTED: 'recovery.started',
  RECOVERY_REMINDER_SENT: 'recovery.reminder.sent',
  RECOVERY_REMINDER_DELIVERED: 'recovery.reminder.delivered',
  RECOVERY_REMINDER_FAILED: 'recovery.reminder.failed',
  RECOVERY_COMPLETED: 'recovery.completed',
  RECOVERY_ESCALATED: 'recovery.escalated',
  RECOVERY_ATTRIBUTED: 'recovery.attributed',

  // Inventory
  INVENTORY_LOW: 'inventory.low',
  INVENTORY_OUT: 'inventory.out',
  INVENTORY_ADJUSTED: 'inventory.adjusted',

  // Customers
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
  CUSTOMER_OPT_IN: 'customer.opt_in',

  // Messaging
  WHATSAPP_SENT: 'whatsapp.sent',
  WHATSAPP_DELIVERED: 'whatsapp.delivered',
  WHATSAPP_FAILED: 'whatsapp.failed',
  WHATSAPP_INBOUND: 'whatsapp.inbound',

  // Sync
  SYNC_COMPLETED: 'sync.completed',
  SYNC_FAILED: 'sync.failed',
  SYNC_CONFLICT: 'sync.conflict',

  // WhatsApp
  WHATSAPP_PAIR_REQUESTED: 'whatsapp.pair.requested',
  WHATSAPP_PAIRED: 'whatsapp.paired',
  WHATSAPP_UNPAIRED: 'whatsapp.unpaired',

  // Analytics
  ANALYTICS_SNAPSHOT_GENERATED: 'analytics.snapshot.generated',

  // Experiments
  EXPERIMENT_ASSIGNED: 'experiment.assigned',
  EXPERIMENT_COMPLETED: 'experiment.completed',
} as const

export type EventType = (typeof EventType)[keyof typeof EventType]

// ============================================================
// EVENT PRODUCERS — Where events originate
// ============================================================

export type EventProducer = 'api' | 'worker' | 'webhook' | 'cron' | 'client'

// ============================================================
// EVENT INTERFACE
// ============================================================

export interface BillzoEvent {
  type: EventType
  version: number
  tenantId: string
  entityId: string | null
  payload: Record<string, unknown>
  causationId: string | null
  correlationId: string
  producer: EventProducer
  idempotencyKey: string | null
  retentionDays: number
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
