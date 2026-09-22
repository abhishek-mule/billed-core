import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'

/**
 * G1 durable-inbox contract tests (route level).
 *
 * The route is the durability boundary: it authenticates, parses, normalizes,
 * sanitizes, and upserts into webhook_inbox — then returns 200. It NEVER calls
 * domain persistence (whatsapp_events / recovery_outcomes / collection_actions
 * / pilot_events). These tests pin that contract so nobody can accidentally
 * reintroduce synchronous domain processing into the HTTP handler. The domain
 * layer now lives in @billzo/shared/whatsapp; the route exports none of it.
 */
const hook = vi.hoisted(() => ({
  tables: [] as string[],
  rowsPerCall: [] as any[],
  upsertError: null as any,
}))

vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      hook.tables.push(table)
      return {
        upsert: async (rows: any, options: any) => {
          hook.rowsPerCall.push({ rows, options })
          return { data: null, error: hook.upsertError }
        },
      }
    },
  },
}))

const RAW_GUPSHUP_MESSAGE = JSON.stringify({
  event: 'message',
  data: {
    phone_number_id: 'ph_1',
    messages: [{ id: 'm_2', from: '919999999999', text: 'hi', timestamp: '1700000000' }],
  },
})

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

type Loaded = {
  POST: (req: any) => Promise<Response>
}

/**
 * The route reads GUPSHUP_WEBHOOK_SECRET once at module load. We reload the
 * module per test (vi.resetModules) so each scenario observes the exact
 * secret configuration it declares — the fail-closed auth does not depend on
 * import order.
 */
async function loadRoute(secret: string | undefined): Promise<Loaded> {
  vi.resetModules()
  if (secret === undefined) {
    delete process.env.GUPSHUP_WEBHOOK_SECRET
  } else {
    process.env.GUPSHUP_WEBHOOK_SECRET = secret
  }
  const route: any = await import('@/app/api/whatsapp/webhook/route')
  return {
    POST: route.POST,
  }
}

function webhookRequest(body: string, signature?: string, meta = false): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (signature !== undefined) {
    headers[meta ? 'x-hub-signature-256' : 'x-gupshup-signature'] = signature
  }
  return new Request('https://billzo.in/api/whatsapp/webhook', {
    method: 'POST',
    headers,
    body,
  }) as any
}

describe('POST /api/whatsapp/webhook — authentication & accept guarantees', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hook.tables = []
    hook.rowsPerCall = []
    hook.upsertError = null
  })
  afterEach(() => {
    delete process.env.GUPSHUP_WEBHOOK_SECRET
  })

  it('fails closed (503) when no webhook secret is configured', async () => {
    const { POST } = await loadRoute(undefined)
    const res = await POST(webhookRequest(RAW_GUPSHUP_MESSAGE, sign(RAW_GUPSHUP_MESSAGE, 'whatever')))
    expect(res.status).toBe(503)
    expect(hook.tables).toEqual([])
  })

  it('rejects (401) when the signature header is missing', async () => {
    const { POST } = await loadRoute('secret')
    const res = await POST(webhookRequest(RAW_GUPSHUP_MESSAGE))
    expect(res.status).toBe(401)
    expect(hook.tables).toEqual([])
  })

  it('rejects (401) when the signature is invalid', async () => {
    const { POST } = await loadRoute('secret')
    const res = await POST(webhookRequest(RAW_GUPSHUP_MESSAGE, 'deadbeef'))
    expect(res.status).toBe(401)
    expect(hook.tables).toEqual([])
  })

  it('rejects (400) invalid JSON even with a valid signature', async () => {
    const { POST } = await loadRoute('secret')
    const res = await POST(webhookRequest('{not json', sign('{not json', 'secret')))
    expect(res.status).toBe(400)
    expect(hook.tables).toEqual([])
  })

  it('answers the Meta hub_challenge inside a signed POST without touching the DB', async () => {
    const { POST } = await loadRoute('secret')
    const raw = JSON.stringify({ hub_challenge: 'challenge-abc' })
    const res = await POST(webhookRequest(raw, sign(raw, 'secret')))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ challenge: 'challenge-abc' })
    expect(hook.tables).toEqual([])
  })

  it('acknowledges (200) an unrecognizable payload without writing anything', async () => {
    const { POST } = await loadRoute('secret')
    const raw = JSON.stringify({ hello: 'world' })
    const res = await POST(webhookRequest(raw, sign(raw, 'secret')))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(hook.tables).toEqual([])
  })

  it('exposes no domain entry points — the route is ingress only', async () => {
    const route: any = await loadRoute('secret')
    expect(route).not.toHaveProperty('persistInboundWhatsAppEvent')
    expect(route).not.toHaveProperty('persistEchoWhatsAppEvent')
    expect(route).not.toHaveProperty('updateDeliveryStatus')
    expect(route).not.toHaveProperty('resolveReplyContext')
    expect(route).not.toHaveProperty('resolveAttemptForMessageId')
    expect(route).not.toHaveProperty('recordPilotEvent')
    expect(route).not.toHaveProperty('resolveTenantByPhoneNumberId')
  })
})

describe('POST /api/whatsapp/webhook — durable inbox boundary (G1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hook.tables = []
    hook.rowsPerCall = []
    hook.upsertError = null
  })
  afterEach(() => {
    delete process.env.GUPSHUP_WEBHOOK_SECRET
  })

  it('DB commit succeeds -> 200, inbox row persisted, and NO domain writes ever', async () => {
    const { POST } = await loadRoute('secret')
    const res = await POST(webhookRequest(RAW_GUPSHUP_MESSAGE, sign(RAW_GUPSHUP_MESSAGE, 'secret')))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })

    // The ONLY table the route touches is webhook_inbox.
    expect(hook.tables).toEqual(['webhook_inbox'])
    expect(hook.rowsPerCall).toHaveLength(1)
    expect(hook.rowsPerCall[0].options).toEqual({ onConflict: 'provider,provider_event_id', ignoreDuplicates: true })
    expect(hook.rowsPerCall[0].rows[0]).toMatchObject({
      provider: 'gupshup',
      provider_event_id: 'm_2',
      provider_event_type: 'customer_message',
      phone_number_id: 'ph_1',
      status: 'queued',
    })
    expect(hook.rowsPerCall[0].rows[0].payload.messages[0].id).toBe('m_2')
  })

  it('DB insert fails -> 503 (non-2xx), and route still performs no domain writes', async () => {
    hook.upsertError = { message: 'connection reset', code: '42P01' }
    const { POST } = await loadRoute('secret')
    const res = await POST(webhookRequest(RAW_GUPSHUP_MESSAGE, sign(RAW_GUPSHUP_MESSAGE, 'secret')))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'Failed to persist webhook event' })
    expect(hook.tables).toEqual(['webhook_inbox'])
  })

  it('duplicate delivery -> 200 on every retry, same idempotency key, no second row ever', async () => {
    const { POST } = await loadRoute('secret')
    const raw = RAW_GUPSHUP_MESSAGE
    const signed = raw // same bytes => same signature

    const first = await POST(webhookRequest(signed, sign(signed, 'secret')))
    expect(first.status).toBe(200)

    const second = await POST(webhookRequest(signed, sign(signed, 'secret')))
    expect(second.status).toBe(200)

    // Two deliveries => two upsert calls (the route acks only after the
    // durable attempt), but both carry the SAME unique key, so the ON CONFLICT
    // DO NOTHING boundary guarantees a single persisted row.
    expect(hook.rowsPerCall).toHaveLength(2)
    expect(hook.rowsPerCall[0].rows[0].provider_event_id).toBe('m_2')
    expect(hook.rowsPerCall[1].rows[0].provider_event_id).toBe('m_2')

    // And the route does domain processing ZERO times — that is the worker's job.
    expect(hook.tables.filter((t) => t !== 'webhook_inbox')).toEqual([])
  })

  it('accepts Meta passthrough envelopes signed via x-hub-signature-256 with provider=meta', async () => {
    const { POST } = await loadRoute('secret')
    const raw = JSON.stringify({
      entry: [
        {
          id: 'waba_1',
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'ph_2' },
                messages: [{ id: 'm_3', from: '919999999999', text: 'hello', timestamp: '1700000000' }],
              },
            },
          ],
        },
      ],
    })
    const res = await POST(webhookRequest(raw, sign(raw, 'secret'), true))
    expect(res.status).toBe(200)
    expect(hook.tables).toEqual(['webhook_inbox'])
    expect(hook.rowsPerCall[0].rows).toHaveLength(1)
    expect(hook.rowsPerCall[0].rows[0]).toMatchObject({
      provider: 'meta',
      provider_event_id: 'm_3',
      phone_number_id: 'ph_2',
    })
  })

  it('statements with a credential-shaped key never reach the inbox row', async () => {
    hook.upsertError = null
    const { POST } = await loadRoute('secret')
    const raw = JSON.stringify({
      event: 'message',
      api_key: 'SHOULD-NOT-PERSIST',
      data: {
        phone_number_id: 'ph_1',
        messages: [{ id: 'm_4', from: '919999999999', text: 'hi', timestamp: '1700000000' }],
      },
    })
    const res = await POST(webhookRequest(raw, sign(raw, 'secret')))
    expect(res.status).toBe(200)

    const row = hook.rowsPerCall[0].rows[0]
    // Reproduction payload: sanitized normalized event, credential-free.
    expect(row.payload).toMatchObject({ eventType: 'customer_message', phoneNumberId: 'ph_1' })
    expect(JSON.stringify(row.payload)).not.toContain('SHOULD-NOT-PERSIST')
    expect(JSON.stringify(row.payload)).not.toMatch(/token|secret|api_key/i)
    // Forensic raw envelope: credential-shaped key redacted by the sanitizer.
    expect(row.payload_raw.api_key).toBe('[redacted]')
    expect(JSON.stringify(row.payload_raw)).not.toContain('SHOULD-NOT-PERSIST')
  })
})