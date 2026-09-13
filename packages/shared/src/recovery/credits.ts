import type { RecoveryCreditPool } from '../plan-limits'

// ============================================================
// RECOVERY CREDITS — shared math (pure, framework-free).
// Used identically by the worker (consumption + deferral) and
// the frontend (reconcile + purchase) so balances can never
// drift between layers. No I/O here — all DB concerns live in
// the per-runtime ledger adapters.
// ============================================================

/** Immutable reason the scheduler writes to collection_actions.metadata. */
export const RECOVERY_CREDITS_DEFERRED_REASON = 'deferred_due_to_credits'

export interface RecoveryCreditBalances {
  /** Included pool, expires at period end. */
  included: number
  /** Purchased pool, carries forward forever. */
  purchased: number
}

export interface RecoveryCreditPeriodPlan {
  /** Quantity to expire from the included pool (0 when there is nothing to expire). */
  expiryQuantity: number
  /** Fresh included allowance for the new period. */
  allocationQuantity: number
}

/** Total spendable credits across both pools. */
export function recoveryCreditsAvailable(balances: RecoveryCreditBalances): number {
  return balances.included + balances.purchased
}

/** True when no billable automated action may be dispatched. */
export function recoveryCreditsExhausted(balances: RecoveryCreditBalances): boolean {
  return recoveryCreditsAvailable(balances) <= 0
}

/**
 * Pool consumed by the next successful automated action. Included credits are
 * spent first (they expire at period end); only when the included pool is
 * empty is a purchased credit spent. Returns null when there is nothing to
 * spend — the caller must defer rather than send.
 */
export function selectPoolForConsumption(
  balances: RecoveryCreditBalances,
): RecoveryCreditPool | null {
  if (balances.included > 0) return 'included'
  if (balances.purchased > 0) return 'purchased'
  return null
}

/** Included-pool balance after spending one credit from that pool. */
export function includedBalanceAfterConsumption(balances: RecoveryCreditBalances): number {
  return Math.max(balances.included - 1, 0)
}

/**
 * Period-boundary plan: the entire residual included balance is expired
 * (audited as a signed negative 'expiry' entry) and the fresh monthly
 * allowance is allocated for the new period. Purchased credits are never
 * touched by a boundary.
 */
export function recoveryCreditPeriodPlan(
  prevIncludedBalance: number,
  includedAllowance: number,
): RecoveryCreditPeriodPlan {
  return {
    expiryQuantity: prevIncludedBalance > 0 ? prevIncludedBalance : 0,
    allocationQuantity: includedAllowance,
  }
}