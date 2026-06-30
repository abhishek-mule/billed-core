export declare const PAYMENT_SOURCES: readonly ["cash", "razorpay", "bank_transfer", "cheque", "adjustment", "upi"];
export type PaymentSource = (typeof PAYMENT_SOURCES)[number];
export type PaymentActor = 'customer' | 'merchant' | 'razorpay_auto' | 'system';
export interface PaymentEvidence {
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
    utr?: string;
    chequeNumber?: string;
    bankReference?: string;
    notes?: string;
}
export declare const PAYMENT_LIFECYCLE_STATUSES: readonly ["created", "synced", "processed", "projected", "visible"];
export type PaymentLifecycleStatus = (typeof PAYMENT_LIFECYCLE_STATUSES)[number];
export interface PaymentRecord {
    id: string;
    tenantId: string;
    invoiceId: string;
    amount: number;
    paymentMode: string;
    source: PaymentSource;
    sourceId?: string;
    status: string;
    lifecycleStatus: PaymentLifecycleStatus;
    actor: PaymentActor;
    evidence: PaymentEvidence;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}
export interface RecordPaymentInput {
    tenantId: string;
    invoiceId: string;
    amount: number;
    source: PaymentSource;
    sourceId?: string;
    actor: PaymentActor;
    existingPaymentId?: string;
    evidence?: PaymentEvidence;
    notes?: string;
}
//# sourceMappingURL=payment-types.d.ts.map