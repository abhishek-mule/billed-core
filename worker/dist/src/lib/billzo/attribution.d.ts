export interface AttributionResult {
    attributed: boolean;
    reminderEventId: string | null;
    attributionType: string;
    confidenceScore: number;
    hoursBetweenReminderAndPayment: number | null;
}
/**
 * Last-touch attribution: find the most recent reminder sent before payment.
 * Attribution window: 48 hours by default.
 */
export declare function attributeRecovery(params: {
    invoiceId: string;
    tenantId: string;
    paymentId?: string;
    paymentTimestamp: string;
    attributionWindowHours?: number;
}): Promise<AttributionResult>;
/**
 * Get recovery attributions for an invoice.
 * Returns the timeline of reminders and payments.
 */
export declare function getInvoiceRecoveryTimeline(invoiceId: string): Promise<{
    events: any[];
    attributions: any[];
}>;
/**
 * Get recovery metrics for a tenant.
 */
export declare function getTenantRecoveryMetrics(tenantId: string): Promise<{
    totalRecovered: number;
    recoveryEfficiencyRate: number;
    averageTimeToRecovery: number;
    totalOutstanding: number;
    recoveredViaAutomation: number;
}>;
//# sourceMappingURL=attribution.d.ts.map