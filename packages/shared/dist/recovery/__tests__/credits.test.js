"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const credits_1 = require("../credits");
const plan_limits_1 = require("../../plan-limits");
(0, vitest_1.describe)('recovery credit math', () => {
    (0, vitest_1.it)('sums both pools for the available balance', () => {
        (0, vitest_1.expect)((0, credits_1.recoveryCreditsAvailable)({ included: 12, purchased: 30 })).toBe(42);
        (0, vitest_1.expect)((0, credits_1.recoveryCreditsAvailable)({ included: 0, purchased: 0 })).toBe(0);
    });
    (0, vitest_1.it)('is exhausted only when there is nothing spendable left', () => {
        (0, vitest_1.expect)((0, credits_1.recoveryCreditsExhausted)({ included: 0, purchased: 0 })).toBe(true);
        (0, vitest_1.expect)((0, credits_1.recoveryCreditsExhausted)({ included: 1, purchased: 0 })).toBe(false);
        (0, vitest_1.expect)((0, credits_1.recoveryCreditsExhausted)({ included: 0, purchased: 500 })).toBe(false);
    });
    (0, vitest_1.it)('spends the included pool first, then purchased', () => {
        (0, vitest_1.expect)((0, credits_1.selectPoolForConsumption)({ included: 5, purchased: 5 })).toBe('included');
        (0, vitest_1.expect)((0, credits_1.selectPoolForConsumption)({ included: 0, purchased: 5 })).toBe('purchased');
        (0, vitest_1.expect)((0, credits_1.selectPoolForConsumption)({ included: 0, purchased: 0 })).toBeNull();
    });
    (0, vitest_1.it)('decrements the included pool but never goes negative', () => {
        (0, vitest_1.expect)((0, credits_1.includedBalanceAfterConsumption)({ included: 5, purchased: 9 })).toBe(4);
        (0, vitest_1.expect)((0, credits_1.includedBalanceAfterConsumption)({ included: 0, purchased: 9 })).toBe(0);
    });
    (0, vitest_1.it)('audits period boundaries as expire-all + fresh allocation', () => {
        const withResidual = (0, credits_1.recoveryCreditPeriodPlan)(23, 200);
        (0, vitest_1.expect)(withResidual.expiryQuantity).toBe(23);
        (0, vitest_1.expect)(withResidual.allocationQuantity).toBe(200);
        const clean = (0, credits_1.recoveryCreditPeriodPlan)(0, 200);
        (0, vitest_1.expect)(clean.expiryQuantity).toBe(0);
        (0, vitest_1.expect)(clean.allocationQuantity).toBe(200);
    });
    (0, vitest_1.it)('uses a stable, immutable deferral reason string', () => {
        (0, vitest_1.expect)(credits_1.RECOVERY_CREDITS_DEFERRED_REASON).toBe('deferred_due_to_credits');
    });
});
(0, vitest_1.describe)('credit catalog', () => {
    (0, vitest_1.it)('ships the four published plans', () => {
        (0, vitest_1.expect)(plan_limits_1.RECOVERY_CREDIT_MONTHLY_ALLOWANCE).toEqual({
            starter: 50,
            pro: 200,
            business: 750,
            enterprise: 750,
        });
    });
    (0, vitest_1.it)('resolves allowance through billzoPlanOf without throwing on legacy input', () => {
        (0, vitest_1.expect)((0, plan_limits_1.recoveryCreditMonthlyAllowance)((0, plan_limits_1.billzoPlanOf)('starter'))).toBe(50);
        (0, vitest_1.expect)((0, plan_limits_1.recoveryCreditMonthlyAllowance)((0, plan_limits_1.billzoPlanOf)('pro'))).toBe(200);
        (0, vitest_1.expect)((0, plan_limits_1.recoveryCreditMonthlyAllowance)((0, plan_limits_1.billzoPlanOf)('business'))).toBe(750);
        (0, vitest_1.expect)((0, plan_limits_1.recoveryCreditMonthlyAllowance)((0, plan_limits_1.billzoPlanOf)('enterprise'))).toBe(750);
    });
    (0, vitest_1.it)('looks up packets server-side by code and rejects unknown codes', () => {
        (0, vitest_1.expect)((0, plan_limits_1.recoveryCreditPacketByCode)('credits_50')).toEqual(plan_limits_1.RECOVERY_CREDIT_PACKETS[0]);
        (0, vitest_1.expect)((0, plan_limits_1.recoveryCreditPacketByCode)('credits_250')?.credits).toBe(250);
        (0, vitest_1.expect)((0, plan_limits_1.recoveryCreditPacketByCode)('credits_nope')).toBeNull();
    });
    (0, vitest_1.it)('keeps packets distinct with strictly positive pricing', () => {
        const codes = new Set(plan_limits_1.RECOVERY_CREDIT_PACKETS.map((p) => p.code));
        (0, vitest_1.expect)(codes.size).toBe(plan_limits_1.RECOVERY_CREDIT_PACKETS.length);
        for (const p of plan_limits_1.RECOVERY_CREDIT_PACKETS) {
            (0, vitest_1.expect)(p.credits).toBeGreaterThan(0);
            (0, vitest_1.expect)(p.pricePaise).toBeGreaterThan(0);
        }
    });
});
//# sourceMappingURL=credits.test.js.map