import { type BillzoEvent } from '@billzo/shared';
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
/**
 * Emit a WhatsApp pair request event.
 */
export declare function emitWhatsAppPairRequested(params: {
    tenantId: string;
    causationId?: string | null;
}): Promise<string>;
/**
 * Emit a WhatsApp status updated event (from webhook or delivery receipt).
 */
export declare function emitWhatsAppStatusUpdated(params: {
    eventId: string;
    billzoMessageId: string | null;
    invoiceId: string | null;
    tenantId: string;
    status: string;
    provider: string;
    providerMessageId: string | null;
    timestamp: string;
    causationId?: string | null;
}): Promise<string>;
/**
 * Emit a WhatsApp circuit open event.
 */
export declare function emitWhatsAppCircuitOpen(params: {
    tenantId: string;
    failures: number;
    causationId?: string | null;
}): Promise<string>;
export declare function logStructuredError(error: Error, context: Record<string, unknown>): void;
//# sourceMappingURL=events.d.ts.map