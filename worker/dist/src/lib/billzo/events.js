"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventType = void 0;
exports.emitEvent = emitEvent;
exports.emitPaymentCompleted = emitPaymentCompleted;
exports.emitRecoveryReminderSent = emitRecoveryReminderSent;
exports.emitRecoveryCompleted = emitRecoveryCompleted;
exports.emitPaymentReconciled = emitPaymentReconciled;
exports.logStructuredError = logStructuredError;
const outbox_1 = require("./outbox");
const idempotency_1 = require("./idempotency");
// ============================================================
// EVENT TAXONOMY — Business-significant events only
// ============================================================
exports.EventType = {
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
    // Analytics
    ANALYTICS_SNAPSHOT_GENERATED: 'analytics.snapshot.generated',
    // Experiments
    EXPERIMENT_ASSIGNED: 'experiment.assigned',
    EXPERIMENT_COMPLETED: 'experiment.completed',
};
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
        type: exports.EventType.PAYMENT_COMPLETED,
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
        type: exports.EventType.RECOVERY_REMINDER_SENT,
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
        type: exports.EventType.RECOVERY_COMPLETED,
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
        type: exports.EventType.PAYMENT_RECONCILED,
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