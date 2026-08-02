export declare const RECOVERY_EVENT_TYPES: readonly ["case_opened", "case_closed", "invoice_sent", "reminder_scheduled", "reminder_sent", "reminder_delivered", "reminder_read", "reminder_failed", "merchant_called", "call_outcome", "promise_received", "promise_fulfilled", "promise_broken", "customer_viewed", "payment_link_opened", "payment_received", "customer_payment_reported", "payment_confirmed", "payment_failed", "note_added", "escalated", "disputed"];
export type RecoveryEventType = (typeof RECOVERY_EVENT_TYPES)[number];
export declare const RECOVERY_ACTOR_TYPES: readonly ["merchant", "system", "customer"];
export type RecoveryActorType = (typeof RECOVERY_ACTOR_TYPES)[number];
export interface RecoveryEvent {
    id: string;
    tenantId: string;
    caseId?: string;
    customerId?: string;
    invoiceId: string;
    type: RecoveryEventType;
    actorType: RecoveryActorType;
    actorId?: string;
    metadata: Record<string, unknown>;
    createdAt: string;
}
//# sourceMappingURL=normalized-event.d.ts.map