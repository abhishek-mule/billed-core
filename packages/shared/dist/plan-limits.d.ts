export type BillzoPlan = 'starter' | 'pro' | 'business' | 'enterprise';
/**
 * Monthly recovery-reminder allowance per plan.
 * -1 = unlimited (higher tiers only; consumer tiers are finite
 * so the merchant never sees "unlimited WhatsApp").
 */
export declare const REMINDER_MONTHLY_ALLOWANCE: Record<BillzoPlan, number>;
/** Normalize a DB/tenant plan string to a BillzoPlan (unknown → starter). */
export declare function billzoPlanOf(value?: string | null): BillzoPlan;
/** Monthly reminder allowance for a plan (falls back to starter). */
export declare function reminderMonthlyAllowance(plan: BillzoPlan): number;
//# sourceMappingURL=plan-limits.d.ts.map