"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const buildDashboardView_1 = require("./buildDashboardView");
(0, vitest_1.describe)('buildDashboardView', () => {
    (0, vitest_1.it)('passes through work, cash, and activity unchanged', () => {
        const primaryAction = {
            type: 'receive_payment',
            label: 'Receive Payment',
            target: { entity: 'payment', id: 'p1' },
        };
        const work = [{
                id: 'w1',
                customerId: 'c1',
                customerName: 'A',
                headline: 'Test',
                reason: 'Test reason',
                severity: 'normal',
                primaryAction,
                moneyImpact: 100,
            }];
        const input = {
            work,
            cash: { outstanding: 100, collectedToday: 50, expectedToday: 100, customerCount: 1 },
            activity: [{ occurredAt: '2026-06-30T10:00:00Z', label: 'Payment', detail: '₹5,000' }],
        };
        const result = (0, buildDashboardView_1.buildDashboardView)(input);
        (0, vitest_1.expect)(result.work).toBe(input.work);
        (0, vitest_1.expect)(result.cash).toBe(input.cash);
        (0, vitest_1.expect)(result.activity).toBe(input.activity);
    });
});
//# sourceMappingURL=buildDashboardView.test.js.map