// ============================================================
// PLAN LIMITS — Single source of truth for recovery-reminder
// allowances. Shared by the worker (dispatch gate + metering)
// and the frontend (pricing page, usage UI) so the advertised
// numbers can never drift from what is actually enforced.
// ============================================================

export type BillzoPlan = 'starter' | 'pro' | 'business' | 'enterprise'

/**
 * Monthly recovery-reminder allowance per plan.
 * -1 = unlimited (higher tiers only; consumer tiers are finite
 * so the merchant never sees "unlimited WhatsApp").
 */
export const REMINDER_MONTHLY_ALLOWANCE: Record<BillzoPlan, number> = {
  starter: 5,
  pro: 500,
  business: -1,
  enterprise: -1,
}

/** Normalize a DB/tenant plan string to a BillzoPlan (unknown → starter). */
export function billzoPlanOf(value?: string | null): BillzoPlan {
  if (value === 'pro' || value === 'business' || value === 'enterprise') return value
  return 'starter'
}

/** Monthly reminder allowance for a plan (falls back to starter). */
export function reminderMonthlyAllowance(plan: BillzoPlan): number {
  return REMINDER_MONTHLY_ALLOWANCE[plan] ?? REMINDER_MONTHLY_ALLOWANCE.starter
}