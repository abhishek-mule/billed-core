"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECOVERY_CREDITS_DEFERRED_REASON = void 0;
exports.recoveryCreditsAvailable = recoveryCreditsAvailable;
exports.recoveryCreditsExhausted = recoveryCreditsExhausted;
exports.selectPoolForConsumption = selectPoolForConsumption;
exports.includedBalanceAfterConsumption = includedBalanceAfterConsumption;
exports.recoveryCreditPeriodPlan = recoveryCreditPeriodPlan;
// ============================================================
// RECOVERY CREDITS — shared math (pure, framework-free).
// Used identically by the worker (consumption + deferral) and
// the frontend (reconcile + purchase) so balances can never
// drift between layers. No I/O here — all DB concerns live in
// the per-runtime ledger adapters.
// ============================================================
/** Immutable reason the scheduler writes to collection_actions.metadata. */
exports.RECOVERY_CREDITS_DEFERRED_REASON = 'deferred_due_to_credits';
/** Total spendable credits across both pools. */
function recoveryCreditsAvailable(balances) {
    return balances.included + balances.purchased;
}
/** True when no billable automated action may be dispatched. */
function recoveryCreditsExhausted(balances) {
    return recoveryCreditsAvailable(balances) <= 0;
}
/**
 * Pool consumed by the next successful automated action. Included credits are
 * spent first (they expire at period end); only when the included pool is
 * empty is a purchased credit spent. Returns null when there is nothing to
 * spend — the caller must defer rather than send.
 */
function selectPoolForConsumption(balances) {
    if (balances.included > 0)
        return 'included';
    if (balances.purchased > 0)
        return 'purchased';
    return null;
}
/** Included-pool balance after spending one credit from that pool. */
function includedBalanceAfterConsumption(balances) {
    return Math.max(balances.included - 1, 0);
}
/**
 * Period-boundary plan: the entire residual included balance is expired
 * (audited as a signed negative 'expiry' entry) and the fresh monthly
 * allowance is allocated for the new period. Purchased credits are never
 * touched by a boundary.
 */
function recoveryCreditPeriodPlan(prevIncludedBalance, includedAllowance) {
    return {
        expiryQuantity: prevIncludedBalance > 0 ? prevIncludedBalance : 0,
        allocationQuantity: includedAllowance,
    };
}
//# sourceMappingURL=credits.js.map