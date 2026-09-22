import { describe, it, expect, beforeEach } from 'vitest'
import { createWhatsAppDomain, normalizePayload, sanitizeRaw, tsToIso } from '..'

/**
 * Frozen webhook domain contract (was mini_saas_frontend/.../whatsapp-webhook-
 * domain.test.ts). The domain layer is extracted into @billzo/shared/whatsapp
 * and client-injected; the fake client below reproduces the exact supabase
 * query-builder calls, so the 24 assertions are unchanged from the freeze.
 */

type Step = { result?: unknown; error?: unknown } | null
type LogEntry = { op: string; table: string; payload: unknown; result: unknown; error: unknown }

function makeFakeClient(state: { steps: Step[]; log: LogEntry[] }) {
  return {
    from: (table: string) => {
      const q: any = {}
      const chain = () => {
        q.select = chain
        q.eq = chain
        q.or = chain
        q.limit = chain
        q.not = chain
        q.filter = chain
        return q
      }
      const terminal = (op: string) => async (payload?: any) => {
        const step = state.steps.shift() ?? {}
        state.log.push({ op, table, payload: payload ?? null, result: step.result ?? null, error: step.error ?? null })
        return { data: step.result ?? null, error: step.error ?? null }
      }
      chain()
      q.maybeSingle = terminal('maybeSingle')
      q.single = terminal('single')
      q.insert = terminal('insert')
      q.upsert = terminal('upsert')
      q.update = (payload: any) => {
        state.log.push({ op: 'update', table, payload, result: null, error: null })
        return q
      }
      return q
    },
  }
}

const connection = { phone_number_id: 'ph_1' }

describe('normalizePayload — provider envelope normalization', () => {
  it('normalizes Meta passthrough messages', () => {
    const events = normalizePayload({
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
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ eventType: 'customer_message', phoneNumberId: 'ph_1', wabaId: 'waba_1' })
    expect((events[0] as any).messages[0].context.id).toBe('out_1')
  })

  it('normalizes Meta passthrough statuses', () => {
    const events = normalizePayload({
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
    })
    expect(events[0]).toMatchObject({ eventType: 'status', phoneNumberId: 'ph_1' })
    expect((events[0] as any).statuses[0].status).toBe('delivered')
  })

  it('normalizes the flat Gupshup message shape', () => {
    const events = normalizePayload({
      event: 'message',
      data: { phone_number_id: 'ph_1', messages: [{ id: 'm2', from: '91', text: 'hi' }] },
    })
    expect(events[0]).toMatchObject({ eventType: 'customer_message', phoneNumberId: 'ph_1' })
    expect((events[0] as any).messages[0].text).toBe('hi')
  })

  it('normalizes the flat Gupshup status shape', () => {
    const events = normalizePayload({
      event: 'message_status',
      data: { phone_number_id: 'ph_1', statuses: [{ id: 's2', status: 'read' }] },
    })
    expect(events[0]).toMatchObject({ eventType: 'status', phoneNumberId: 'ph_1' })
  })

  it('normalizes smb_message_echoes into merchant_echo events', () => {
    const events = normalizePayload({
      event: 'smb_message_echoes',
      data: { phone_number_id: 'ph_1', messages: [{ id: 'e1', to: '91', text: 'echo' }] },
    })
    expect(events[0]).toMatchObject({ eventType: 'merchant_echo', phoneNumberId: 'ph_1' })
  })

  it('returns [] for unrecognizable envelopes', () => {
    expect(normalizePayload({ hello: 'world' })).toEqual([])
    expect(normalizePayload(null)).toEqual([])
  })
})

describe('sanitizeRaw — PII/credential hygiene', () => {
  it('redacts credential-shaped keys at any depth', () => {
    const out = sanitizeRaw({ apiKey: 'a', nested: { password: 'p', token: 't', secret: 's', ok: 'fine' } })
    expect(out).toMatchObject({ apiKey: '[redacted]', nested: { password: '[redacted]', token: '[redacted]', secret: '[redacted]', ok: 'fine' } })
  })

  it('truncates long strings and bounds arrays', () => {
    const out = sanitizeRaw({ long: 'x'.repeat(600), many: Array.from({ length: 30 }, (_, i) => i) })!
    expect(out.long).toHaveLength(500 + 1)
    expect(out.many).toHaveLength(20)
  })

  it('caps total serialized size', () => {
    const out = sanitizeRaw(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'x'.repeat(2000)])))
    expect(out).toMatchObject({ truncated: true })
    expect((out as { head: string }).head.length).toBe(16000)
  })
})

describe('tsToIso', () => {
  it('converts epoch seconds to ISO', () => {
    expect(tsToIso('1700000000')).toBe(new Date(1700000000 * 1000).toISOString())
  })
  it('returns undefined for invalid/garbage input', () => {
    expect(tsToIso('abc')).toBeUndefined()
    expect(tsToIso(undefined)).toBeUndefined()
  })
})

describe('persistInboundWhatsAppEvent — inbound causality + dedup', () => {
  it('is idempotent for a repeat provider_message_id', async () => {
    const state = { steps: [] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    state.steps = [{ result: { id: 'existing-row' } }]
    await domain.persistInboundWhatsAppEvent('t1', connection as any, { id: 'm1', from: '91', text: 'hi' } as any, null)
    expect(state.log).toHaveLength(1)
    expect(state.log[0]).toMatchObject({ op: 'maybeSingle', table: 'whatsapp_events' })
  })

  it('always persists conversation_id (016 made it NOT NULL; an omitted value 23502s on a real DB)', async () => {
    const state = { steps: [] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    state.steps = [null] // dedup miss only
    const inbound = { id: 'm9', from: '919911111111', text: 'hi', timestamp: '1700000000' }
    await domain.persistInboundWhatsAppEvent('t1', connection as any, inbound as any, null)
    const ins = state.log.find((e: any) => e.op === 'insert' && e.table === 'whatsapp_events')!
    expect(ins.payload).toMatchObject({ conversation_id: 'conv_919911111111' })

    // Missing phone still yields a non-null conversation (016 fallback semantics).
    const state2 = { steps: [] as Step[], log: [] as LogEntry[] }
    const client2 = makeFakeClient(state2)
    const domain2 = createWhatsAppDomain(client2 as any)
    state2.steps = [null]
    await domain2.persistInboundWhatsAppEvent('t1', connection as any, { id: 'm10', text: 'hi', timestamp: '1700000000' } as any, null)
    const ins2 = state2.log.find((e: any) => e.op === 'insert' && e.table === 'whatsapp_events')!
    expect(ins2.payload).toMatchObject({ conversation_id: 'conv_unknown' })
  })

  it('records the reply against the originating attempt via explicit parent identity', async () => {
    const state = { steps: [] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    state.steps = [
      null, // dedup miss
      null, // resolveReplyContext: with-attempt row miss
      null, // resolveReplyContext: any-row miss
      null, // resolveAttemptForMessageId: billzo_message_id miss
      { result: { id: 'action_1' } }, // resolveAttemptForMessageId: provider receipt hit
    ]
    const msg = { id: 'm1', from: '919999999999', text: { body: 'ok' }, timestamp: '1700000000', contextId: 'out_1' }
    await domain.persistInboundWhatsAppEvent('t1', connection as any, msg as any, 'c1')

    const ins = state.log.find((e: any) => e.op === 'insert' && e.table === 'whatsapp_events')!
    expect(ins.payload).toMatchObject({
      tenant_id: 't1',
      customer_id: 'c1',
      conversation_id: 'conv_919999999999',
      direction: 'inbound',
      message_origin: 'inbound_webhook',
      recovery_attempt_id: 'action_1',
      status: 'received',
    })
    const outcome = state.log.find((e: any) => e.op === 'upsert' && e.table === 'recovery_outcomes')!
    expect(outcome.payload).toMatchObject({
      outcome_type: 'customer_replied',
      attribution_status: 'verified',
      attribution_method: 'explicit',
      confidence_score: 1,
      recovery_attempt_id: 'action_1',
    })
  })

  it('records UNKNOWN causality when the reply has no resolvable parent', async () => {
    const state = { steps: [] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    state.steps = [null] // dedup miss only — no contextId means no resolve calls
    const msg = { id: 'm2', from: '919955555555', text: 'hi', timestamp: '1700000000' }
    await domain.persistInboundWhatsAppEvent('t1', connection as any, msg as any, null)

    const outcome = state.log.find((e: any) => e.op === 'insert' && e.table === 'recovery_outcomes')!
    expect(outcome.payload).toMatchObject({
      attribution_status: 'unknown',
      attribution_method: null,
      confidence_score: null,
      recovery_attempt_id: null,
    })
  })
})

describe('persistEchoWhatsAppEvent — outbound echo + dedup', () => {
  it('attributes the echo to the attempt via provider receipt when billzo id is absent', async () => {
    const state = { steps: [] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    state.steps = [
      null, // dedup miss
      null, // resolveAttemptForMessageId: billzo_message_id miss
      { result: { id: 'echo_action' } }, // resolveAttemptForMessageId: provider receipt hit
    ]
    const msg = { id: 'echo_1', to: '919955555555', type: 'text', text: 'reply', timestamp: '1700000000' }
    await domain.persistEchoWhatsAppEvent('t1', connection as any, msg as any, 'c2')

    const ins = state.log.find((e: any) => e.op === 'insert' && e.table === 'whatsapp_events')!
    expect(ins.payload).toMatchObject({
      tenant_id: 't1',
      customer_id: 'c2',
      conversation_id: 'conv_919955555555',
      direction: 'outbound',
      message_origin: 'merchant_app',
      message_type: 'merchant_app_reply',
      status: 'sent',
      recovery_attempt_id: 'echo_action',
    })
  })
})

describe('updateDeliveryStatus — delivery/read state + outcome mapping', () => {
  it('patches delivered_at and writes a verified delivered outcome', async () => {
    const state = { steps: [] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    state.steps = [
      null, // with-attempt row miss
      { result: { recovery_attempt_id: 'a1', invoice_id: 'i1', customer_id: 'c1' } }, // any-row hit
    ]
    await domain.updateDeliveryStatus('t1', { id: 's1', status: 'delivered', timestamp: '1700000000' } as any)

    const upd = state.log.find((e: any) => e.op === 'update' && e.table === 'whatsapp_events')!
    expect(upd.payload).toMatchObject({ status: 'delivered' })
    expect((upd.payload as any).delivered_at).toBeTruthy()
    const outcome = state.log.find((e: any) => e.op === 'upsert' && e.table === 'recovery_outcomes')!
    expect(outcome.payload).toMatchObject({
      outcome_type: 'delivered',
      attribution_status: 'verified',
      attribution_method: 'explicit',
      recovery_attempt_id: 'a1',
    })
  })

  it('patches read_at and writes a customer_read outcome', async () => {
    const state = { steps: [] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    state.steps = [
      { result: { recovery_attempt_id: 'a1', invoice_id: 'i1', customer_id: 'c1' } }, // with-attempt hit on first probe
    ]
    await domain.updateDeliveryStatus('t1', { id: 's1', status: 'read', timestamp: '1700000000' } as any)

    const upd = state.log.find((e: any) => e.op === 'update')!
    expect(upd.payload).toMatchObject({ status: 'read' })
    expect((upd.payload as any).read_at).toBeTruthy()
    const outcome = state.log.find((e: any) => e.op === 'upsert')!
    expect(outcome.payload).toMatchObject({ outcome_type: 'customer_read' })
  })

  it('records non-delivery/read statuses without fabricating a recovery outcome', async () => {
    const state = { steps: [] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    state.steps = [
      null,
      { result: { recovery_attempt_id: 'a1', invoice_id: 'i1', customer_id: 'c1' } },
    ]
    await domain.updateDeliveryStatus('t1', { id: 's1', status: 'failed', timestamp: '1700000000' } as any)
    expect(state.log.some((e: any) => e.op === 'update')).toBe(true)
    expect(state.log.some((e: any) => e.op === 'upsert')).toBe(false)
  })

  it('is a no-op without a provider message id', async () => {
    const state = { steps: [] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    await domain.updateDeliveryStatus('t1', { status: 'delivered' } as any)
    expect(state.log).toHaveLength(0)
  })
})

describe('resolveAttemptForMessageId — provider identity → recovery attempt', () => {
  it('prefers the billzo_message_id match and stops', async () => {
    const state = { steps: [{ result: { id: 'a2' } }] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    expect(await domain.resolveAttemptForMessageId('m1')).toBe('a2')
    expect(state.log).toHaveLength(1)
  })

  it('falls back to the provider receipt in metadata', async () => {
    const state = { steps: [null, { result: { id: 'a3' } }] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    expect(await domain.resolveAttemptForMessageId('m1')).toBe('a3')
  })

  it('returns null when nothing matches', async () => {
    const state = { steps: [null, null] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    expect(await domain.resolveAttemptForMessageId('m1')).toBeNull()
  })
})

describe('resolveReplyContext — parent identity resolution', () => {
  it('prefers a whatsapp_events row that already carries the attempt id', async () => {
    const state = { steps: [{ result: { recovery_attempt_id: 'a1', invoice_id: 'i1', customer_id: 'c1' } }] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    const resolved = await domain.resolveReplyContext('parent_1')
    expect(resolved).toMatchObject({ recovery_attempt_id: 'a1', invoice_id: 'i1', customer_id: 'c1' })
    expect(state.log).toHaveLength(1)
  })

  it('never guesses causality from temporal proximity', async () => {
    const state = { steps: [null, null, null, null] as Step[], log: [] as LogEntry[] }
    const client = makeFakeClient(state)
    const domain = createWhatsAppDomain(client as any)
    expect(await domain.resolveReplyContext('parent_1')).toBeNull()
  })
})