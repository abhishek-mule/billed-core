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
export interface PaymentRecord {
    id: string;
    tenantId: string;
    invoiceId: string;
    amount: number;
    paymentMode: string;
    source: PaymentSource;
    status: string;
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
    actor: PaymentActor;
    evidence?: PaymentEvidence;
    notes?: string;
}
//# sourceMappingURL=payment-types.d.ts.map