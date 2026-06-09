"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const spine_1 = require("./spine");
const validInput = {
    entity_type: 'invoice',
    entity_id: 'inv-123',
    source_system: 'worker',
    idempotency_key: 'tenant:invoice:inv-123:created:hash',
};
(0, vitest_1.describe)('uuidv7', () => {
    (0, vitest_1.it)('generates a valid v7 UUID format', () => {
        const id = (0, spine_1.uuidv7)();
        (0, vitest_1.expect)(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
    (0, vitest_1.it)('generates time-ordered UUIDs', () => {
        const ids = Array.from({ length: 10 }, () => (0, spine_1.uuidv7)());
        const timestamps = ids.map(spine_1.uuidv7Timestamp);
        for (let i = 1; i < timestamps.length; i++) {
            (0, vitest_1.expect)(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
        }
    });
    (0, vitest_1.it)('generates unique IDs', () => {
        const ids = new Set(Array.from({ length: 1000 }, () => (0, spine_1.uuidv7)()));
        (0, vitest_1.expect)(ids.size).toBe(1000);
    });
});
(0, vitest_1.describe)('validateSpineEventInput', () => {
    (0, vitest_1.it)('accepts a valid input', () => {
        (0, vitest_1.expect)((0, spine_1.validateSpineEventInput)(validInput)).toEqual([]);
    });
    (0, vitest_1.it)('rejects null input', () => {
        const errors = (0, spine_1.validateSpineEventInput)(null);
        (0, vitest_1.expect)(errors.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(errors[0].field).toBe('root');
    });
    (0, vitest_1.it)('rejects missing entity_type', () => {
        const errors = (0, spine_1.validateSpineEventInput)({ ...validInput, entity_type: undefined });
        (0, vitest_1.expect)(errors.some(e => e.field === 'entity_type')).toBe(true);
    });
    (0, vitest_1.it)('rejects invalid entity_type', () => {
        const errors = (0, spine_1.validateSpineEventInput)({ ...validInput, entity_type: 'foo' });
        (0, vitest_1.expect)(errors.some(e => e.field === 'entity_type')).toBe(true);
    });
    (0, vitest_1.it)('rejects missing entity_id', () => {
        const errors = (0, spine_1.validateSpineEventInput)({ ...validInput, entity_id: '' });
        (0, vitest_1.expect)(errors.some(e => e.field === 'entity_id')).toBe(true);
    });
    (0, vitest_1.it)('rejects missing source_system', () => {
        const errors = (0, spine_1.validateSpineEventInput)({ ...validInput, source_system: undefined });
        (0, vitest_1.expect)(errors.some(e => e.field === 'source_system')).toBe(true);
    });
    (0, vitest_1.it)('rejects invalid source_system', () => {
        const errors = (0, spine_1.validateSpineEventInput)({ ...validInput, source_system: 'hacker' });
        (0, vitest_1.expect)(errors.some(e => e.field === 'source_system')).toBe(true);
    });
    (0, vitest_1.it)('rejects missing idempotency_key', () => {
        const errors = (0, spine_1.validateSpineEventInput)({ ...validInput, idempotency_key: '' });
        (0, vitest_1.expect)(errors.some(e => e.field === 'idempotency_key')).toBe(true);
    });
    (0, vitest_1.it)('accepts null causal_id', () => {
        (0, vitest_1.expect)((0, spine_1.validateSpineEventInput)({ ...validInput, causal_id: null })).toEqual([]);
    });
    (0, vitest_1.it)('rejects non-string causal_id', () => {
        const errors = (0, spine_1.validateSpineEventInput)({ ...validInput, causal_id: 123 });
        (0, vitest_1.expect)(errors.some(e => e.field === 'causal_id')).toBe(true);
    });
    (0, vitest_1.it)('accepts with all optional fields', () => {
        const full = {
            entity_type: 'payment',
            entity_id: 'pay-456',
            causal_id: 'evt-001',
            correlation_id: 'corr-789',
            occurred_at: '2026-06-09T12:00:00Z',
            source_system: 'webhook',
            idempotency_key: 'razorpay:pay_abc123',
            payload: { amount: 5000 },
            external_refs: {
                razorpay_payment_id: 'pay_abc123',
            },
        };
        (0, vitest_1.expect)((0, spine_1.validateSpineEventInput)(full)).toEqual([]);
    });
    (0, vitest_1.it)('rejects external_refs with wrong type', () => {
        const errors = (0, spine_1.validateSpineEventInput)({ ...validInput, external_refs: 'not-an-object' });
        (0, vitest_1.expect)(errors.some(e => e.field === 'external_refs')).toBe(true);
    });
});
(0, vitest_1.describe)('inferEntityType', () => {
    (0, vitest_1.it)('maps invoice.created to invoice', () => {
        (0, vitest_1.expect)((0, spine_1.inferEntityType)('invoice.created')).toBe('invoice');
    });
    (0, vitest_1.it)('maps payment.completed to payment', () => {
        (0, vitest_1.expect)((0, spine_1.inferEntityType)('payment.completed')).toBe('payment');
    });
    (0, vitest_1.it)('maps recovery.reminder.sent to recovery_case', () => {
        (0, vitest_1.expect)((0, spine_1.inferEntityType)('recovery.reminder.sent')).toBe('recovery_case');
    });
    (0, vitest_1.it)('maps whatsapp.sent to whatsapp_message', () => {
        (0, vitest_1.expect)((0, spine_1.inferEntityType)('whatsapp.sent')).toBe('whatsapp_message');
    });
    (0, vitest_1.it)('maps unknown types to unknown', () => {
        (0, vitest_1.expect)((0, spine_1.inferEntityType)('foo.bar')).toBe('unknown');
    });
});
//# sourceMappingURL=spine.test.js.map