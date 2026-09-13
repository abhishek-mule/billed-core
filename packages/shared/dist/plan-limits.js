"use strict";
// ============================================================
// PLAN LIMITS — Single source of truth for recovery-reminder
// allowances. Shared by the worker (dispatch gate + metering)
// and the frontend (pricing page, usage UI) so the advertised
// numbers can never drift from what is actually enforced.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECOVERY_CREDIT_PACKETS = exports.RECOVERY_CREDIT_MONTHLY_ALLOWANCE = exports.REMINDER_MONTHLY_ALLOWANCE = void 0;
exports.billzoPlanOf = billzoPlanOf;
exports.reminderMonthlyAllowance = reminderMonthlyAllowance;
exports.recoveryCreditMonthlyAllowance = recoveryCreditMonthlyAllowance;
exports.recoveryCreditPacketByCode = recoveryCreditPacketByCode;
/**
 * Monthly recovery-reminder allowance per plan.
 * -1 = unlimited (higher tiers only; consumer tiers are finite
 * so the merchant never sees "unlimited WhatsApp").
 */
exports.REMINDER_MONTHLY_ALLOWANCE = {
    starter: 5,
    pro: 500,
    business: -1,
    enterprise: -1,
};
/** Normalize a DB/tenant plan string to a BillzoPlan (unknown → starter). */
function billzoPlanOf(value) {
    if (value === 'pro' || value === 'business' || value === 'enterprise')
        return value;
    return 'starter';
}
/** Monthly reminder allowance for a plan (falls back to starter). */
function reminderMonthlyAllowance(plan) {
    return exports.REMINDER_MONTHLY_ALLOWANCE[plan] ?? exports.REMINDER_MONTHLY_ALLOWANCE.starter;
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
exports.RECOVERY_CREDIT_MONTHLY_ALLOWANCE = {
    starter: 50,
    pro: 200,
    business: 750,
    enterprise: 750,
};
exports.RECOVERY_CREDIT_PACKETS = [
    { code: 'credits_50', credits: 50, pricePaise: 22900 },
    { code: 'credits_250', credits: 250, pricePaise: 99900 },
    { code: 'credits_500', credits: 500, pricePaise: 179900 },
];
const RECOVERY_CREDIT_PACKET_BY_CODE = new Map(exports.RECOVERY_CREDIT_PACKETS.map((p) => [p.code, p]));
/** Monthly included allowance for a plan (falls back to starter). */
function recoveryCreditMonthlyAllowance(plan) {
    return exports.RECOVERY_CREDIT_MONTHLY_ALLOWANCE[plan] ?? exports.RECOVERY_CREDIT_MONTHLY_ALLOWANCE.starter;
}
/** Look up a packet by code. Null = unknown packet (never accept it). */
function recoveryCreditPacketByCode(code) {
    if (!code)
        return null;
    return RECOVERY_CREDIT_PACKET_BY_CODE.get(code) ?? null;
}
//# sourceMappingURL=plan-limits.js.map