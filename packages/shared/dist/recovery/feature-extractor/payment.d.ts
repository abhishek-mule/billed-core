import type { NormalizedRecoveryEvent } from '../normalized-event';
export interface PaymentFeatures {
    avgSettlementDelayHours: number;
    avgPaymentAmount: number;
    partialPaymentRate: number;
    promiseKeepingRate: number;
    earlyPaymentRate: number;
    latePaymentRate: number;
    paymentCount: number;
    promiseCount: number;
}
export declare function extractPaymentFeatures(events: NormalizedRecoveryEvent[]): PaymentFeatures;
//# sourceMappingURL=payment.d.ts.map