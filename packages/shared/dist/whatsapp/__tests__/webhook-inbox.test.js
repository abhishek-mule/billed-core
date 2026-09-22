"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const __1 = require("..");
const payload = (row) => row.payload;
(0, vitest_1.describe)('buildInboxRows — row shaping for webhook_inbox', () => {
    (0, vitest_1.it)('turns a Gupshup message event into one durable inbox row', () => {
        const rows = (0, __1.buildInboxRows)([
            {
                eventType: 'customer_message',
                phoneNumberId: 'ph_1',
                messages: [{ id: 'm1', from: '919999999999', text: 'hi', timestamp: '1700000000' }],
            },
        ], 'gupshup');
        (0, vitest_1.expect)(rows).toHaveLength(1);
        (0, vitest_1.expect)(rows[0]).toMatchObject({
            provider: 'gupshup',
            provider_event_id: 'm1',
            provider_event_type: 'customer_message',
            phone_number_id: 'ph_1',
            status: 'queued',
        });
        (0, vitest_1.expect)(payload(rows[0]).messages[0].id).toBe('m1');
        (0, vitest_1.expect)(payload(rows[0]).eventType).toBe('customer_message');
        (0, vitest_1.expect)(rows[0].payload_raw).toBeNull();
    });
    (0, vitest_1.it)('flattens multiple messages into multiple rows', () => {
        const rows = (0, __1.buildInboxRows)([
            {
                eventType: 'customer_message',
                phoneNumberId: 'ph_1',
                messages: [
                    { id: 'm1', from: '91', text: 'a' },
                    { id: 'm2', from: '92', text: 'b' },
                ],
            },
        ], 'gupshup');
        (0, vitest_1.expect)(rows.map((r) => r.provider_event_id)).toEqual(['m1', 'm2']);
    });
    (0, vitest_1.it)('uses messageId:status as the idempotency key for status events', () => {
        const rows = (0, __1.buildInboxRows)([
            {
                eventType: 'status',
                phoneNumberId: 'ph_1',
                statuses: [{ id: 's1', status: 'delivered', timestamp: '1700000000' }],
            },
        ], 'gupshup');
        (0, vitest_1.expect)(rows[0]).toMatchObject({
            provider_event_id: 's1:delivered',
            provider_event_type: 'status',
            phone_number_id: 'ph_1',
        });
        (0, vitest_1.expect)(payload(rows[0]).statuses[0]).toMatchObject({ id: 's1', status: 'delivered' });
    });
    (0, vitest_1.it)('keeps the delivered/read pair on the same message distinct', () => {
        const rows = (0, __1.buildInboxRows)([
            {
                eventType: 'status',
                phoneNumberId: 'ph_1',
                statuses: [
                    { id: 's1', status: 'delivered' },
                    { id: 's1', status: 'read' },
                ],
            },
        ], 'gupshup');
        (0, vitest_1.expect)(rows.map((r) => r.provider_event_id)).toEqual(['s1:delivered', 's1:read']);
    });
    (0, vitest_1.it)('never produces a NULL idempotency key for a status without a provider id', () => {
        const rows = (0, __1.buildInboxRows)([{ eventType: 'status', phoneNumberId: 'ph_1', statuses: [{ status: 'failed' }] }], 'meta');
        (0, vitest_1.expect)(rows[0].provider_event_id).toBe('no-id:failed');
    });
    (0, vitest_1.it)('never produces a NULL idempotency key for a message without a provider id', () => {
        const rows = (0, __1.buildInboxRows)([{ eventType: 'customer_message', phoneNumberId: 'ph_1', messages: [{ from: '91' }] }], 'gupshup');
        (0, vitest_1.expect)(rows[0].provider_event_id).toBe('no-id');
    });
    (0, vitest_1.it)('maps merchant echoes to merchant_echo events', () => {
        const rows = (0, __1.buildInboxRows)([{ eventType: 'merchant_echo', phoneNumberId: 'ph_1', messages: [{ id: 'e1', to: '91' }] }], 'gupshup');
        (0, vitest_1.expect)(rows[0]).toMatchObject({
            provider_event_type: 'merchant_echo',
            provider_event_id: 'e1',
        });
    });
    (0, vitest_1.it)('propagates the provider identity', () => {
        const rows = (0, __1.buildInboxRows)([{ eventType: 'customer_message', phoneNumberId: 'ph_1', messages: [{ id: 'm1' }] }], 'meta');
        (0, vitest_1.expect)(rows[0].provider).toBe('meta');
    });
});
(0, vitest_1.describe)('buildInboxRows — sanitized payload contract', () => {
    const event = (extra = {}) => ({
        eventType: 'customer_message',
        phoneNumberId: 'ph_1',
        messages: [{ id: 'm1', from: '91', text: 'hi', api_token: 'nope' }],
        ...extra,
    });
    (0, vitest_1.it)('redacts credential-shaped keys from the reproduction payload', () => {
        const [row] = (0, __1.buildInboxRows)([event()], 'gupshup');
        (0, vitest_1.expect)(payload(row).messages[0].api_token).toBe('[redacted]');
        (0, vitest_1.expect)(JSON.stringify(payload(row))).not.toContain('nope');
    });
    (0, vitest_1.it)('truncates long strings within the payload', () => {
        const [row] = (0, __1.buildInboxRows)([event({ messages: [{ id: 'm1', from: '91', text: 'x'.repeat(600) }] })], 'gupshup');
        (0, vitest_1.expect)(payload(row).messages[0].text).toHaveLength(500 + 1);
    });
    (0, vitest_1.it)('sanitizes the forensic raw envelope the same way', () => {
        const raw = { event: 'message', api_key: 'SHOULD-NOT-PERSIST', data: { phone_number_id: 'ph_1' } };
        const [row] = (0, __1.buildInboxRows)([event()], 'gupshup', raw);
        (0, vitest_1.expect)(row.payload_raw.api_key).toBe('[redacted]');
        (0, vitest_1.expect)(JSON.stringify(row.payload_raw)).not.toContain('SHOULD-NOT-PERSIST');
    });
});
(0, vitest_1.describe)('sanitizeRaw boundary (as frozen in the domain suite)', () => {
    (0, vitest_1.it)('binds arrays to 20 items', () => {
        const out = (0, __1.sanitizeRaw)({ many: Array.from({ length: 30 }, (_, i) => i) });
        (0, vitest_1.expect)(out.many).toHaveLength(20);
    });
    (0, vitest_1.it)('caps aggregate serialized size to 16,000 bytes', () => {
        const out = (0, __1.sanitizeRaw)(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'x'.repeat(2000)])));
        (0, vitest_1.expect)(out).toMatchObject({ truncated: true });
        (0, vitest_1.expect)(out.head.length).toBe(16000);
    });
});
//# sourceMappingURL=webhook-inbox.test.js.map