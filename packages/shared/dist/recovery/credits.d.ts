import type { RecoveryCreditPool } from '../plan-limits';
/** Immutable reason the scheduler writes to collection_actions.metadata. */
export declare const RECOVERY_CREDITS_DEFERRED_REASON = "deferred_due_to_credits";
export interface RecoveryCreditBalances {
    /** Included pool, expires at period end. */
    included: number;
    /** Purchased pool, carries forward forever. */
    purchased: number;
}
export interface RecoveryCreditPeriodPlan {
    /** Quantity to expire from the included pool (0 when there is nothing to expire). */
    expiryQuantity: number;
    /** Fresh included allowance for the new period. */
    allocationQuantity: number;
}
/** Total spendable credits across both pools. */
export declare function recoveryCreditsAvailable(balances: RecoveryCreditBalances): number;
/** True when no billable automated action may be dispatched. */
export declare function recoveryCreditsExhausted(balances: RecoveryCreditBalances): boolean;
/**
 * Pool consumed by the next successful automated action. Included credits are
 * spent first (they expire at period end); only when the included pool is
 * empty is a purchased credit spent. Returns null when there is nothing to
 * spend — the caller must defer rather than send.
 */
export declare function selectPoolForConsumption(balances: RecoveryCreditBalances): RecoveryCreditPool | null;
/** Included-pool balance after spending one credit from that pool. */
export declare function includedBalanceAfterConsumption(balances: RecoveryCreditBalances): number;
/**
 * Period-boundary plan: the entire residual included balance is expired
 * (audited as a signed negative 'expiry' entry) and the fresh monthly
 * allowance is allocated for the new period. Purchased credits are never
 * touched by a boundary.
 */
export declare function recoveryCreditPeriodPlan(prevIncludedBalance: number, includedAllowance: number): RecoveryCreditPeriodPlan;
//# sourceMappingURL=credits.d.ts.map