export declare const EventType: {
    readonly INVOICE_CREATED: "invoice.created";
    readonly INVOICE_UPDATED: "invoice.updated";
    readonly INVOICE_PAID: "invoice.paid";
    readonly INVOICE_OVERDUE: "invoice.overdue";
    readonly INVOICE_DELETED: "invoice.deleted";
    readonly PAYMENT_CREATED: "payment.created";
    readonly PAYMENT_FAILED: "payment.failed";
    readonly PAYMENT_COMPLETED: "payment.completed";
    readonly PAYMENT_LINK_GENERATED: "payment.link.generated";
    readonly PAYMENT_RECONCILED: "payment.reconciled";
    readonly RECOVERY_STARTED: "recovery.started";
    readonly RECOVERY_REMINDER_SENT: "recovery.reminder.sent";
    readonly RECOVERY_REMINDER_DELIVERED: "recovery.reminder.delivered";
    readonly RECOVERY_REMINDER_FAILED: "recovery.reminder.failed";
    readonly RECOVERY_COMPLETED: "recovery.completed";
    readonly RECOVERY_ESCALATED: "recovery.escalated";
    readonly RECOVERY_ATTRIBUTED: "recovery.attributed";
    readonly INVENTORY_LOW: "inventory.low";
    readonly INVENTORY_OUT: "inventory.out";
    readonly INVENTORY_ADJUSTED: "inventory.adjusted";
    readonly CUSTOMER_CREATED: "customer.created";
    readonly CUSTOMER_UPDATED: "customer.updated";
    readonly CUSTOMER_OPT_IN: "customer.opt_in";
    readonly WHATSAPP_SENT: "whatsapp.sent";
    readonly WHATSAPP_DELIVERED: "whatsapp.delivered";
    readonly WHATSAPP_FAILED: "whatsapp.failed";
    readonly WHATSAPP_INBOUND: "whatsapp.inbound";
    readonly SYNC_COMPLETED: "sync.completed";
    readonly SYNC_FAILED: "sync.failed";
    readonly SYNC_CONFLICT: "sync.conflict";
    readonly ANALYTICS_SNAPSHOT_GENERATED: "analytics.snapshot.generated";
    readonly EXPERIMENT_ASSIGNED: "experiment.assigned";
    readonly EXPERIMENT_COMPLETED: "experiment.completed";
};
export type EventType = (typeof EventType)[keyof typeof EventType];
export type EventProducer = 'api' | 'worker' | 'webhook' | 'cron' | 'client';
export interface BillzoEvent {
    type: EventType;
    version: number;
    tenantId: string;
    entityId: string | null;
    payload: Record<string, unknown>;
    causationId: string | null;
    correlationId: string;
    producer: EventProducer;
    idempotencyKey: string | null;
    retentionDays: number;
}
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
export declare function emitEvent(event: Omit<BillzoEvent, 'version'>): Promise<string>;
/**
 * Emit a payment completed event with recovery attribution context.
 */
export declare function emitPaymentCompleted(params: {
    invoiceId: string;
    tenantId: string;
    amount: number;
    paymentId?: string;
    provider?: string;
    providerPaymentId?: string;
    causationId?: string | null;
    matchedBy?: 'payment_link' | 'fuzzy' | 'exact';
}): Promise<string>;
/**
 * Emit a recovery reminder sent event.
 */
export declare function emitRecoveryReminderSent(params: {
    invoiceId: string;
    tenantId: string;
    customerId: string;
    stage: string;
    channel: string;
    messageId?: string;
    causationId?: string | null;
}): Promise<string>;
/**
 * Emit a recovery completed event (payment attributed to reminder).
 */
export declare function emitRecoveryCompleted(params: {
    invoiceId: string;
    tenantId: string;
    amount: number;
    reminderEventId?: string;
    attributionType?: string;
    confidenceScore?: number;
    causationId?: string | null;
}): Promise<string>;
/**
 * Emit a payment reconciled event.
 */
export declare function emitPaymentReconciled(params: {
    invoiceId: string;
    tenantId: string;
    amount: number;
    provider: string;
    providerPaymentId: string;
    matchedBy: 'payment_link' | 'fuzzy' | 'exact';
    causationId?: string | null;
}): Promise<string>;
export declare function logStructuredError(error: Error, context: Record<string, unknown>): void;
//# sourceMappingURL=events.d.ts.map