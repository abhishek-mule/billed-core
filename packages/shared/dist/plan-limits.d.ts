export type BillzoPlan = 'starter' | 'pro' | 'business' | 'enterprise';
/**
 * Monthly recovery-reminder allowance per plan.
 *
 * PILOT SAFETY CAP, NOT A FINAL COMMERCIAL ENTITLEMENT: Business and Enterprise
 * have a finite allowance (750/mo), not unlimited. No plan advertises "unlimited"
 * recovery actions; higher tiers buy more capacity, not infinity. Commercial
 * entitlements are reassessed before go-live.
 */
export declare const REMINDER_MONTHLY_ALLOWANCE: Record<BillzoPlan, number>;
/** Normalize a DB/tenant plan string to a BillzoPlan (unknown → starter). */
export declare function billzoPlanOf(value?: string | null): BillzoPlan;
/** Monthly reminder allowance for a plan (falls back to starter). */
export declare function reminderMonthlyAllowance(plan: BillzoPlan): number;
/**
 * Monthly INCLUDED recovery-credit allowance per plan.
 * Applies only when the tenant is credit-enabled (tenants.
 * recovery_credits_enabled = true). Legacy unlimited subscribers
 * keep their current behaviour until an explicit rollout policy
 * flag is set — they are never silently converted.
 */
export declare const RECOVERY_CREDIT_MONTHLY_ALLOWANCE: Record<BillzoPlan, number>;
export type RecoveryCreditPool = 'included' | 'purchased';
/**
 * Top-up packets. Prices are server-authoritative: the API computes the
 * Razorpay amount from this table and NEVER trusts a client-supplied amount.
 *
 * PRICING STATUS — EXPERIMENTAL, not final. The values below are provisional
 * placeholders. Before go-live they must be derived from the blended cost per
 * credit: Gupshup send cost + Razorpay fee + infra + support + desired gross
 * margin. Changing these numbers is a config-only edit; orders always charge
 * the amount re-read from this catalog at order time.
 */
export interface RecoveryCreditPacket {
    /** Stable packet code stored on the order/ledger rows. */
    code: string;
    /** Number of credits granted. */
    credits: number;
    /** Amount charged, in paise. */
    pricePaise: number;
}
export declare const RECOVERY_CREDIT_PACKETS: RecoveryCreditPacket[];
/** Monthly included allowance for a plan (falls back to starter). */
export declare function recoveryCreditMonthlyAllowance(plan: BillzoPlan): number;
/** Look up a packet by code. Null = unknown packet (never accept it). */
export declare function recoveryCreditPacketByCode(code?: string | null): RecoveryCreditPacket | null;
//# sourceMappingURL=plan-limits.d.ts.map