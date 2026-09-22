// ============================================================
// PLAN LIMITS — Single source of truth for recovery-reminder
// allowances. Shared by the worker (dispatch gate + metering)
// and the frontend (pricing page, usage UI) so the advertised
// numbers can never drift from what is actually enforced.
// ============================================================

export type BillzoPlan = 'starter' | 'pro' | 'business' | 'enterprise'

/**
 * Monthly recovery-reminder allowance per plan.
 *
 * PILOT SAFETY CAP, NOT A FINAL COMMERCIAL ENTITLEMENT: Business and Enterprise
 * have a finite allowance (750/mo), not unlimited. No plan advertises "unlimited"
 * recovery actions; higher tiers buy more capacity, not infinity. Commercial
 * entitlements are reassessed before go-live.
 */
export const REMINDER_MONTHLY_ALLOWANCE: Record<BillzoPlan, number> = {
  starter: 5,
  pro: 500,
  business: 750,
  enterprise: 750,
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

// ============================================================
// RECOVERY CREDITS — Phase B of the Recovery Credits feature.
// A credit is one successful billable automated recovery action
// (WhatsApp reminder / follow-up) on a credit-enabled tenant.
//   * Included credits are allocated monthly per plan and expire
//     at period end (audited via 'expiry' ledger entries).
//   * Purchased credits (Razorpay top-up) carry forward forever.
//   * Consumption is a signed ledger entry AFTER a successful
//     automated send — never before, never client-side.
//   * Excess automation is deferred (never cancelled) and never
//     auto-resumes after a purchase.
// ============================================================

/**
 * Monthly INCLUDED recovery-credit allowance per plan.
 * Applies only when the tenant is credit-enabled (tenants.
 * recovery_credits_enabled = true). Legacy unlimited subscribers
 * keep their current behaviour until an explicit rollout policy
 * flag is set — they are never silently converted.
 */
export const RECOVERY_CREDIT_MONTHLY_ALLOWANCE: Record<BillzoPlan, number> = {
  starter: 50,
  pro: 200,
  business: 750,
  enterprise: 750,
}

export type RecoveryCreditPool = 'included' | 'purchased'

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
  code: string
  /** Number of credits granted. */
  credits: number
  /** Amount charged, in paise. */
  pricePaise: number
}

export const RECOVERY_CREDIT_PACKETS: RecoveryCreditPacket[] = [
  { code: 'credits_50', credits: 50, pricePaise: 22900 },
  { code: 'credits_250', credits: 250, pricePaise: 99900 },
  { code: 'credits_500', credits: 500, pricePaise: 179900 },
]

const RECOVERY_CREDIT_PACKET_BY_CODE = new Map(
  RECOVERY_CREDIT_PACKETS.map((p) => [p.code, p]),
)

/** Monthly included allowance for a plan (falls back to starter). */
export function recoveryCreditMonthlyAllowance(plan: BillzoPlan): number {
  return RECOVERY_CREDIT_MONTHLY_ALLOWANCE[plan] ?? RECOVERY_CREDIT_MONTHLY_ALLOWANCE.starter
}

/** Look up a packet by code. Null = unknown packet (never accept it). */
export function recoveryCreditPacketByCode(code?: string | null): RecoveryCreditPacket | null {
  if (!code) return null
  return RECOVERY_CREDIT_PACKET_BY_CODE.get(code) ?? null
}