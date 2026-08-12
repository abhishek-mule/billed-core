"use strict";
// ============================================================
// PLAN LIMITS — Single source of truth for recovery-reminder
// allowances. Shared by the worker (dispatch gate + metering)
// and the frontend (pricing page, usage UI) so the advertised
// numbers can never drift from what is actually enforced.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.REMINDER_MONTHLY_ALLOWANCE = void 0;
exports.billzoPlanOf = billzoPlanOf;
exports.reminderMonthlyAllowance = reminderMonthlyAllowance;
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
//# sourceMappingURL=plan-limits.js.map