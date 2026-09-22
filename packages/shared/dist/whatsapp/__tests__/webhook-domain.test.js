"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const __1 = require("..");
function makeFakeClient(state) {
    return {
        from: (table) => {
            const q = {};
            const chain = () => {
                q.select = chain;
                q.eq = chain;
                q.or = chain;
                q.limit = chain;
                q.not = chain;
                q.filter = chain;
                return q;
            };
            const terminal = (op) => async (payload) => {
                const step = state.steps.shift() ?? {};
                state.log.push({ op, table, payload: payload ?? null, result: step.result ?? null, error: step.error ?? null });
                return { data: step.result ?? null, error: step.error ?? null };
            };
            chain();
            q.maybeSingle = terminal('maybeSingle');
            q.single = terminal('single');
            q.insert = terminal('insert');
            q.upsert = terminal('upsert');
            q.update = (payload) => {
                state.log.push({ op: 'update', table, payload, result: null, error: null });
                return q;
            };
            return q;
        },
    };
}
const connection = { phone_number_id: 'ph_1' };
(0, vitest_1.describe)('normalizePayload — provider envelope normalization', () => {
    (0, vitest_1.it)('normalizes Meta passthrough messages', () => {
        const events = (0, __1.normalizePayload)({
            entry: [
                {
                    id: 'waba_1',
                    changes: [
                        {
                            value: {
                                metadata: { phone_number_id: 'ph_1' },
                                messages: [{ id: 'm1', from: '91', text: { body: 'hi' }, timestamp: '1700000000', context: { id: 'out_1' } }],
                            },
                        },
                    ],
                },
            ],
        });
        (0, vitest_1.expect)(events).toHaveLength(1);
        (0, vitest_1.expect)(events[0]).toMatchObject({ eventType: 'customer_message', phoneNumberId: 'ph_1', wabaId: 'waba_1' });
        (0, vitest_1.expect)(events[0].messages[0].context.id).toBe('out_1');
    });
    (0, vitest_1.it)('normalizes Meta passthrough statuses', () => {
        const events = (0, __1.normalizePayload)({
            entry: [
                {
                    id: 'waba_1',
                    changes: [
                        {
                            value: {
                                metadata: { phone_number_id: 'ph_1' },
                                statuses: [{ id: 's1', status: 'delivered', recipient_id: '91', timestamp: '1700000000' }],
                            },
                        },
                    ],
                },
            ],
        });
        (0, vitest_1.expect)(events[0]).toMatchObject({ eventType: 'status', phoneNumberId: 'ph_1' });
        (0, vitest_1.expect)(events[0].statuses[0].status).toBe('delivered');
    });
    (0, vitest_1.it)('normalizes the flat Gupshup message shape', () => {
        const events = (0, __1.normalizePayload)({
            event: 'message',
            data: { phone_number_id: 'ph_1', messages: [{ id: 'm2', from: '91', text: 'hi' }] },
        });
        (0, vitest_1.expect)(events[0]).toMatchObject({ eventType: 'customer_message', phoneNumberId: 'ph_1' });
        (0, vitest_1.expect)(events[0].messages[0].text).toBe('hi');
    });
    (0, vitest_1.it)('normalizes the flat Gupshup status shape', () => {
        const events = (0, __1.normalizePayload)({
            event: 'message_status',
            data: { phone_number_id: 'ph_1', statuses: [{ id: 's2', status: 'read' }] },
        });
        (0, vitest_1.expect)(events[0]).toMatchObject({ eventType: 'status', phoneNumberId: 'ph_1' });
    });
    (0, vitest_1.it)('normalizes smb_message_echoes into merchant_echo events', () => {
        const events = (0, __1.normalizePayload)({
            event: 'smb_message_echoes',
            data: { phone_number_id: 'ph_1', messages: [{ id: 'e1', to: '91', text: 'echo' }] },
        });
        (0, vitest_1.expect)(events[0]).toMatchObject({ eventType: 'merchant_echo', phoneNumberId: 'ph_1' });
    });
    (0, vitest_1.it)('returns [] for unrecognizable envelopes', () => {
        (0, vitest_1.expect)((0, __1.normalizePayload)({ hello: 'world' })).toEqual([]);
        (0, vitest_1.expect)((0, __1.normalizePayload)(null)).toEqual([]);
    });
});
(0, vitest_1.describe)('sanitizeRaw — PII/credential hygiene', () => {
    (0, vitest_1.it)('redacts credential-shaped keys at any depth', () => {
        const out = (0, __1.sanitizeRaw)({ apiKey: 'a', nested: { password: 'p', token: 't', secret: 's', ok: 'fine' } });
        (0, vitest_1.expect)(out).toMatchObject({ apiKey: '[redacted]', nested: { password: '[redacted]', token: '[redacted]', secret: '[redacted]', ok: 'fine' } });
    });
    (0, vitest_1.it)('truncates long strings and bounds arrays', () => {
        const out = (0, __1.sanitizeRaw)({ long: 'x'.repeat(600), many: Array.from({ length: 30 }, (_, i) => i) });
        (0, vitest_1.expect)(out.long).toHaveLength(500 + 1);
        (0, vitest_1.expect)(out.many).toHaveLength(20);
    });
    (0, vitest_1.it)('caps total serialized size', () => {
        const out = (0, __1.sanitizeRaw)(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'x'.repeat(2000)])));
        (0, vitest_1.expect)(out).toMatchObject({ truncated: true });
        (0, vitest_1.expect)(out.head.length).toBe(16000);
    });
});
(0, vitest_1.describe)('tsToIso', () => {
    (0, vitest_1.it)('converts epoch seconds to ISO', () => {
        (0, vitest_1.expect)((0, __1.tsToIso)('1700000000')).toBe(new Date(1700000000 * 1000).toISOString());
    });
    (0, vitest_1.it)('returns undefined for invalid/garbage input', () => {
        (0, vitest_1.expect)((0, __1.tsToIso)('abc')).toBeUndefined();
        (0, vitest_1.expect)((0, __1.tsToIso)(undefined)).toBeUndefined();
    });
});
(0, vitest_1.describe)('persistInboundWhatsAppEvent — inbound causality + dedup', () => {
    (0, vitest_1.it)('is idempotent for a repeat provider_message_id', async () => {
        const state = { steps: [], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        state.steps = [{ result: { id: 'existing-row' } }];
        await domain.persistInboundWhatsAppEvent('t1', connection, { id: 'm1', from: '91', text: 'hi' }, null);
        (0, vitest_1.expect)(state.log).toHaveLength(1);
        (0, vitest_1.expect)(state.log[0]).toMatchObject({ op: 'maybeSingle', table: 'whatsapp_events' });
    });
    (0, vitest_1.it)('always persists conversation_id (016 made it NOT NULL; an omitted value 23502s on a real DB)', async () => {
        const state = { steps: [], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        state.steps = [null]; // dedup miss only
        const inbound = { id: 'm9', from: '919911111111', text: 'hi', timestamp: '1700000000' };
        await domain.persistInboundWhatsAppEvent('t1', connection, inbound, null);
        const ins = state.log.find((e) => e.op === 'insert' && e.table === 'whatsapp_events');
        (0, vitest_1.expect)(ins.payload).toMatchObject({ conversation_id: 'conv_919911111111' });
        // Missing phone still yields a non-null conversation (016 fallback semantics).
        const state2 = { steps: [], log: [] };
        const client2 = makeFakeClient(state2);
        const domain2 = (0, __1.createWhatsAppDomain)(client2);
        state2.steps = [null];
        await domain2.persistInboundWhatsAppEvent('t1', connection, { id: 'm10', text: 'hi', timestamp: '1700000000' }, null);
        const ins2 = state2.log.find((e) => e.op === 'insert' && e.table === 'whatsapp_events');
        (0, vitest_1.expect)(ins2.payload).toMatchObject({ conversation_id: 'conv_unknown' });
    });
    (0, vitest_1.it)('records the reply against the originating attempt via explicit parent identity', async () => {
        const state = { steps: [], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        state.steps = [
            null, // dedup miss
            null, // resolveReplyContext: with-attempt row miss
            null, // resolveReplyContext: any-row miss
            null, // resolveAttemptForMessageId: billzo_message_id miss
            { result: { id: 'action_1' } }, // resolveAttemptForMessageId: provider receipt hit
        ];
        const msg = { id: 'm1', from: '919999999999', text: { body: 'ok' }, timestamp: '1700000000', contextId: 'out_1' };
        await domain.persistInboundWhatsAppEvent('t1', connection, msg, 'c1');
        const ins = state.log.find((e) => e.op === 'insert' && e.table === 'whatsapp_events');
        (0, vitest_1.expect)(ins.payload).toMatchObject({
            tenant_id: 't1',
            customer_id: 'c1',
            conversation_id: 'conv_919999999999',
            direction: 'inbound',
            message_origin: 'inbound_webhook',
            recovery_attempt_id: 'action_1',
            status: 'received',
        });
        const outcome = state.log.find((e) => e.op === 'upsert' && e.table === 'recovery_outcomes');
        (0, vitest_1.expect)(outcome.payload).toMatchObject({
            outcome_type: 'customer_replied',
            attribution_status: 'verified',
            attribution_method: 'explicit',
            confidence_score: 1,
            recovery_attempt_id: 'action_1',
        });
    });
    (0, vitest_1.it)('records UNKNOWN causality when the reply has no resolvable parent', async () => {
        const state = { steps: [], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        state.steps = [null]; // dedup miss only — no contextId means no resolve calls
        const msg = { id: 'm2', from: '919955555555', text: 'hi', timestamp: '1700000000' };
        await domain.persistInboundWhatsAppEvent('t1', connection, msg, null);
        const outcome = state.log.find((e) => e.op === 'insert' && e.table === 'recovery_outcomes');
        (0, vitest_1.expect)(outcome.payload).toMatchObject({
            attribution_status: 'unknown',
            attribution_method: null,
            confidence_score: null,
            recovery_attempt_id: null,
        });
    });
});
(0, vitest_1.describe)('persistEchoWhatsAppEvent — outbound echo + dedup', () => {
    (0, vitest_1.it)('attributes the echo to the attempt via provider receipt when billzo id is absent', async () => {
        const state = { steps: [], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        state.steps = [
            null, // dedup miss
            null, // resolveAttemptForMessageId: billzo_message_id miss
            { result: { id: 'echo_action' } }, // resolveAttemptForMessageId: provider receipt hit
        ];
        const msg = { id: 'echo_1', to: '919955555555', type: 'text', text: 'reply', timestamp: '1700000000' };
        await domain.persistEchoWhatsAppEvent('t1', connection, msg, 'c2');
        const ins = state.log.find((e) => e.op === 'insert' && e.table === 'whatsapp_events');
        (0, vitest_1.expect)(ins.payload).toMatchObject({
            tenant_id: 't1',
            customer_id: 'c2',
            conversation_id: 'conv_919955555555',
            direction: 'outbound',
            message_origin: 'merchant_app',
            message_type: 'merchant_app_reply',
            status: 'sent',
            recovery_attempt_id: 'echo_action',
        });
    });
});
(0, vitest_1.describe)('updateDeliveryStatus — delivery/read state + outcome mapping', () => {
    (0, vitest_1.it)('patches delivered_at and writes a verified delivered outcome', async () => {
        const state = { steps: [], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        state.steps = [
            null, // with-attempt row miss
            { result: { recovery_attempt_id: 'a1', invoice_id: 'i1', customer_id: 'c1' } }, // any-row hit
        ];
        await domain.updateDeliveryStatus('t1', { id: 's1', status: 'delivered', timestamp: '1700000000' });
        const upd = state.log.find((e) => e.op === 'update' && e.table === 'whatsapp_events');
        (0, vitest_1.expect)(upd.payload).toMatchObject({ status: 'delivered' });
        (0, vitest_1.expect)(upd.payload.delivered_at).toBeTruthy();
        const outcome = state.log.find((e) => e.op === 'upsert' && e.table === 'recovery_outcomes');
        (0, vitest_1.expect)(outcome.payload).toMatchObject({
            outcome_type: 'delivered',
            attribution_status: 'verified',
            attribution_method: 'explicit',
            recovery_attempt_id: 'a1',
        });
    });
    (0, vitest_1.it)('patches read_at and writes a customer_read outcome', async () => {
        const state = { steps: [], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        state.steps = [
            { result: { recovery_attempt_id: 'a1', invoice_id: 'i1', customer_id: 'c1' } }, // with-attempt hit on first probe
        ];
        await domain.updateDeliveryStatus('t1', { id: 's1', status: 'read', timestamp: '1700000000' });
        const upd = state.log.find((e) => e.op === 'update');
        (0, vitest_1.expect)(upd.payload).toMatchObject({ status: 'read' });
        (0, vitest_1.expect)(upd.payload.read_at).toBeTruthy();
        const outcome = state.log.find((e) => e.op === 'upsert');
        (0, vitest_1.expect)(outcome.payload).toMatchObject({ outcome_type: 'customer_read' });
    });
    (0, vitest_1.it)('records non-delivery/read statuses without fabricating a recovery outcome', async () => {
        const state = { steps: [], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        state.steps = [
            null,
            { result: { recovery_attempt_id: 'a1', invoice_id: 'i1', customer_id: 'c1' } },
        ];
        await domain.updateDeliveryStatus('t1', { id: 's1', status: 'failed', timestamp: '1700000000' });
        (0, vitest_1.expect)(state.log.some((e) => e.op === 'update')).toBe(true);
        (0, vitest_1.expect)(state.log.some((e) => e.op === 'upsert')).toBe(false);
    });
    (0, vitest_1.it)('is a no-op without a provider message id', async () => {
        const state = { steps: [], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        await domain.updateDeliveryStatus('t1', { status: 'delivered' });
        (0, vitest_1.expect)(state.log).toHaveLength(0);
    });
});
(0, vitest_1.describe)('resolveAttemptForMessageId — provider identity → recovery attempt', () => {
    (0, vitest_1.it)('prefers the billzo_message_id match and stops', async () => {
        const state = { steps: [{ result: { id: 'a2' } }], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        (0, vitest_1.expect)(await domain.resolveAttemptForMessageId('m1')).toBe('a2');
        (0, vitest_1.expect)(state.log).toHaveLength(1);
    });
    (0, vitest_1.it)('falls back to the provider receipt in metadata', async () => {
        const state = { steps: [null, { result: { id: 'a3' } }], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        (0, vitest_1.expect)(await domain.resolveAttemptForMessageId('m1')).toBe('a3');
    });
    (0, vitest_1.it)('returns null when nothing matches', async () => {
        const state = { steps: [null, null], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        (0, vitest_1.expect)(await domain.resolveAttemptForMessageId('m1')).toBeNull();
    });
});
(0, vitest_1.describe)('resolveReplyContext — parent identity resolution', () => {
    (0, vitest_1.it)('prefers a whatsapp_events row that already carries the attempt id', async () => {
        const state = { steps: [{ result: { recovery_attempt_id: 'a1', invoice_id: 'i1', customer_id: 'c1' } }], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        const resolved = await domain.resolveReplyContext('parent_1');
        (0, vitest_1.expect)(resolved).toMatchObject({ recovery_attempt_id: 'a1', invoice_id: 'i1', customer_id: 'c1' });
        (0, vitest_1.expect)(state.log).toHaveLength(1);
    });
    (0, vitest_1.it)('never guesses causality from temporal proximity', async () => {
        const state = { steps: [null, null, null, null], log: [] };
        const client = makeFakeClient(state);
        const domain = (0, __1.createWhatsAppDomain)(client);
        (0, vitest_1.expect)(await domain.resolveReplyContext('parent_1')).toBeNull();
    });
});
//# sourceMappingURL=webhook-domain.test.js.map