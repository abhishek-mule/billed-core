"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitEvent = emitEvent;
exports.emitPaymentCompleted = emitPaymentCompleted;
exports.emitRecoveryReminderSent = emitRecoveryReminderSent;
exports.emitRecoveryCompleted = emitRecoveryCompleted;
exports.emitPaymentReconciled = emitPaymentReconciled;
exports.emitWhatsAppPairRequested = emitWhatsAppPairRequested;
exports.emitWhatsAppStatusUpdated = emitWhatsAppStatusUpdated;
exports.emitWhatsAppCircuitOpen = emitWhatsAppCircuitOpen;
exports.logStructuredError = logStructuredError;
const outbox_1 = require("./outbox");
const idempotency_1 = require("./idempotency");
const shared_1 = require("@billzo/shared");
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
async function emitEvent(event) {
    const options = {
        type: event.type,
        tenantId: event.tenantId,
        entityId: event.entityId,
        payload: event.payload,
        causationId: event.causationId,
        correlationId: event.correlationId,
        idempotencyKey: event.idempotencyKey,
        version: 1,
    };
    const eventId = await (0, outbox_1.writeOutboxEvent)(options);
    // Structured log
    logStructuredEvent({
        eventId,
        type: event.type,
        tenantId: event.tenantId,
        entityId: event.entityId,
        correlationId: event.correlationId,
        causationId: event.causationId,
        producer: event.producer,
    });
    return eventId;
}
/**
 * Emit a payment completed event with recovery attribution context.
 */
async function emitPaymentCompleted(params) {
    const correlationId = (0, idempotency_1.generateCorrelationId)(params.invoiceId);
    return emitEvent({
        type: shared_1.EventType.PAYMENT_COMPLETED,
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
    });
}
/**
 * Emit a recovery reminder sent event.
 */
async function emitRecoveryReminderSent(params) {
    const correlationId = (0, idempotency_1.generateCorrelationId)(params.invoiceId);
    return emitEvent({
        type: shared_1.EventType.RECOVERY_REMINDER_SENT,
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
    });
}
/**
 * Emit a recovery completed event (payment attributed to reminder).
 */
async function emitRecoveryCompleted(params) {
    const correlationId = (0, idempotency_1.generateCorrelationId)(params.invoiceId);
    return emitEvent({
        type: shared_1.EventType.RECOVERY_COMPLETED,
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
    });
}
/**
 * Emit a payment reconciled event.
 */
async function emitPaymentReconciled(params) {
    const correlationId = (0, idempotency_1.generateCorrelationId)(params.invoiceId);
    return emitEvent({
        type: shared_1.EventType.PAYMENT_RECONCILED,
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
    });
}
function logStructuredEvent(entry) {
    const logEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
        level: 'info',
    };
    console.log(JSON.stringify(logEntry));
}
/**
 * Emit a WhatsApp pair request event.
 */
async function emitWhatsAppPairRequested(params) {
    return emitEvent({
        type: shared_1.EventType.WHATSAPP_PAIR_REQUESTED,
        tenantId: params.tenantId,
        entityId: null,
        payload: {},
        causationId: params.causationId || null,
        correlationId: `pair:${params.tenantId}:${Date.now()}`,
        producer: 'api',
        idempotencyKey: `whatsapp:pair:${params.tenantId}:${new Date().toISOString().slice(0, 10)}`,
        retentionDays: 7,
    });
}
/**
 * Emit a WhatsApp status updated event (from webhook or delivery receipt).
 */
async function emitWhatsAppStatusUpdated(params) {
    const correlationId = (0, idempotency_1.generateCorrelationId)(params.invoiceId || params.tenantId);
    return emitEvent({
        type: shared_1.EventType.WHATSAPP_STATUS_UPDATED,
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
    });
}
/**
 * Emit a WhatsApp circuit open event.
 */
async function emitWhatsAppCircuitOpen(params) {
    return emitEvent({
        type: shared_1.EventType.WHATSAPP_CIRCUIT_OPEN,
        tenantId: params.tenantId,
        entityId: null,
        payload: { failures: params.failures },
        causationId: params.causationId || null,
        correlationId: `circuit:${params.tenantId}:${Date.now()}`,
        producer: 'worker',
        idempotencyKey: `whatsapp:circuit:${params.tenantId}:${new Date().toISOString().slice(0, 10)}`,
        retentionDays: 30,
    });
}
function logStructuredError(error, context) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: error.message,
        stack: error.stack,
        ...context,
    };
    console.error(JSON.stringify(logEntry));
}
//# sourceMappingURL=events.js.map