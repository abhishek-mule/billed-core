"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const types_1 = require("./types");
(0, vitest_1.describe)('normalizeStage', () => {
    (0, vitest_1.it)('returns the stage as-is when valid', () => {
        (0, vitest_1.expect)((0, types_1.normalizeStage)('t0_soft')).toBe('t0_soft');
        (0, vitest_1.expect)((0, types_1.normalizeStage)('t24_nudge')).toBe('t24_nudge');
        (0, vitest_1.expect)((0, types_1.normalizeStage)('t72_strong')).toBe('t72_strong');
        (0, vitest_1.expect)((0, types_1.normalizeStage)('t5_warning')).toBe('t5_warning');
    });
    (0, vitest_1.it)('returns t0_soft for invalid stages', () => {
        (0, vitest_1.expect)((0, types_1.normalizeStage)('invalid_stage')).toBe('t0_soft');
        (0, vitest_1.expect)((0, types_1.normalizeStage)('')).toBe('t0_soft');
        (0, vitest_1.expect)((0, types_1.normalizeStage)(null)).toBe('t0_soft');
        (0, vitest_1.expect)((0, types_1.normalizeStage)(undefined)).toBe('t0_soft');
    });
    (0, vitest_1.it)('returns default for wrong case', () => {
        (0, vitest_1.expect)((0, types_1.normalizeStage)('T0_SOFT')).toBe('t0_soft');
    });
});
(0, vitest_1.describe)('getNextStage', () => {
    (0, vitest_1.it)('returns the next stage in the cycle', () => {
        (0, vitest_1.expect)((0, types_1.getNextStage)('t0_soft')).toBe('t24_nudge');
        (0, vitest_1.expect)((0, types_1.getNextStage)('t24_nudge')).toBe('t72_strong');
        (0, vitest_1.expect)((0, types_1.getNextStage)('t72_strong')).toBe('t5_warning');
    });
    (0, vitest_1.it)('returns the same stage for the last stage', () => {
        (0, vitest_1.expect)((0, types_1.getNextStage)('t5_warning')).toBe('t5_warning');
    });
});
(0, vitest_1.describe)('REMINDER_STAGES', () => {
    (0, vitest_1.it)('contains exactly 4 stages', () => {
        (0, vitest_1.expect)(types_1.REMINDER_STAGES).toHaveLength(4);
        (0, vitest_1.expect)(types_1.REMINDER_STAGES).toEqual(['t0_soft', 't24_nudge', 't72_strong', 't5_warning']);
    });
});
(0, vitest_1.describe)('STAGE_LABELS', () => {
    (0, vitest_1.it)('has labels for all stages', () => {
        for (const stage of types_1.REMINDER_STAGES) {
            (0, vitest_1.expect)(types_1.STAGE_LABELS[stage]).toBeDefined();
            (0, vitest_1.expect)(typeof types_1.STAGE_LABELS[stage]).toBe('string');
        }
    });
});
(0, vitest_1.describe)('generateBillzoMessageId', () => {
    (0, vitest_1.it)('returns a string starting with bmsg_', () => {
        const id = (0, types_1.generateBillzoMessageId)();
        (0, vitest_1.expect)(id).toMatch(/^bmsg_[0-9a-z]+$/);
    });
    (0, vitest_1.it)('produces unique IDs on sequential calls', () => {
        const ids = new Set(Array.from({ length: 100 }, () => (0, types_1.generateBillzoMessageId)()));
        (0, vitest_1.expect)(ids.size).toBe(100);
    });
});
(0, vitest_1.describe)('generateEventSequence', () => {
    (0, vitest_1.it)('returns a BigInt', () => {
        const seq = (0, types_1.generateEventSequence)();
        (0, vitest_1.expect)(typeof seq).toBe('bigint');
    });
    (0, vitest_1.it)('produces increasing values on sequential calls', () => {
        const a = (0, types_1.generateEventSequence)();
        const b = (0, types_1.generateEventSequence)();
        (0, vitest_1.expect)(b > a).toBe(true);
    });
});
(0, vitest_1.describe)('computeTransportHash', () => {
    (0, vitest_1.it)('returns a 32-char hex string', () => {
        const hash = (0, types_1.computeTransportHash)({
            phone: '+919876543210',
            message: 'Hello',
            invoiceId: 'inv_123',
            amount: 500,
            reminderStage: 't0_soft',
            attemptNumber: 1,
        });
        (0, vitest_1.expect)(hash).toMatch(/^[0-9a-f]{32}$/);
    });
    (0, vitest_1.it)('produces deterministic output for same inputs', () => {
        const params = {
            phone: '+919876543210',
            message: 'Test message',
            invoiceId: 'inv_456',
            amount: 1000,
            reminderStage: 't24_nudge',
            attemptNumber: 2,
        };
        const a = (0, types_1.computeTransportHash)(params);
        const b = (0, types_1.computeTransportHash)(params);
        (0, vitest_1.expect)(a).toBe(b);
    });
    (0, vitest_1.it)('produces different output for different attempts', () => {
        const a = (0, types_1.computeTransportHash)({ phone: '+91', message: 'hi', attemptNumber: 1 });
        const b = (0, types_1.computeTransportHash)({ phone: '+91', message: 'hi', attemptNumber: 2 });
        (0, vitest_1.expect)(a).not.toBe(b);
    });
    (0, vitest_1.it)('handles minimal params', () => {
        const hash = (0, types_1.computeTransportHash)({ phone: '+91', message: 'test' });
        (0, vitest_1.expect)(hash).toMatch(/^[0-9a-f]{32}$/);
    });
});
//# sourceMappingURL=types.test.js.map