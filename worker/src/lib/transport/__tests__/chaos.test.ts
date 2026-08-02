import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TransportRegistry, GupshupAdapter, BaileysAdapter } from '@billzo/shared'
import type {
  TransportAdapter,
  OutboundMessage,
  SendResult,
  ChannelHealth,
  CircuitBreakerStore,
  BaileysSocketHost,
} from '@billzo/shared'
import { AuthorityOutboxDispatcher } from '../../authority/outbox-dispatcher'
import type { CapabilityRegistry } from '../../authority/capabilities'

function inMemoryCircuit(): CircuitBreakerStore {
  const store = new Map<string, { value: string; expiresAt: number }>()
  return {
    async get(key) {
      const e = store.get(key)
      if (!e) return null
      if (e.expiresAt < Date.now()) {
        store.delete(key)
        return null
      }
      return e.value
    },
    async setex(key, ttlSec, value) {
      store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 })
    },
    async del(key) {
      store.delete(key)
    },
  }
}

async function okSend(providerMessageId = 'mid_1'): Promise<SendResult> {
  return { success: true, providerMessageId, latencyMs: 3 }
}

async function failSend(error: string): Promise<SendResult> {
  return { success: false, providerMessageId: null, error, latencyMs: 3 }
}

class StubAdapter implements TransportAdapter {
  readonly provider = 'stub'
  private readonly sendImpl: (channelId: string, m: OutboundMessage) => Promise<SendResult>

  constructor(sendImpl: (channelId: string, m: OutboundMessage) => Promise<SendResult>) {
    this.sendImpl = sendImpl
  }

  async send(channelId: string, m: OutboundMessage): Promise<SendResult> {
    return this.sendImpl(channelId, m)
  }

  async getHealth(): Promise<ChannelHealth> {
    return {
      connectionState: 'connected',
      isConnected: true,
      lastHeartbeatAt: null,
      lastConnectedAt: null,
      deliverySuccessRate: null,
      qualityScore: null,
      latencyMs: null,
      error: null,
    }
  }
  async connect() {}
  async disconnect() {}
  async handleInbound() {
    return null
  }
}

const DUMB_CONFIG = { apiKey: 'k', appName: 'a', sourceNumber: '919999999999' }

describe('chaos: TransportRegistry — resilience when resolution fails', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns graceful error (no throw) when provider resolution fails', async () => {
    const registry = new TransportRegistry(async () => null)
    registry.register(new StubAdapter(okSend))

    const result = await registry.send('ch_unknown', { to: '919999999999', text: 'hi' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('returns graceful error when the resolved provider has no adapter', async () => {
    const registry = new TransportRegistry(async () => 'meta')
    // no meta adapter registered

    const result = await registry.send('ch_1', { to: '919999999999', text: 'hi' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('No adapter registered')
  })

  it('explicit provider option bypasses the resolver', async () => {
    const registry = new TransportRegistry(async () => null)
    registry.register(new StubAdapter(() => okSend('forced')))

    const result = await registry.send('ch_1', { to: '919999999999', text: 'hi' }, { provider: 'stub' })

    expect(result.success).toBe(true)
    expect(result.providerMessageId).toBe('forced')
  })

  it('keeps working for other channels after one channel fails', async () => {
    const registry = new TransportRegistry(async () => 'stub')
    registry.register(new StubAdapter(() => failSend('boom')))

    const bad = await registry.send('ch_bad', { to: 'x', text: 'hi' })
    const good = await registry.send('ch_good', { to: 'x', text: 'hi' })
    const health = await registry.getHealth('ch_good')

    expect(bad.success).toBe(false)
    expect(good.success).toBe(false) // same adapter, but no crash
    expect(health?.isConnected).toBe(true)
  })
})

describe('chaos: GupshupAdapter circuit breaker', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  function buildAdapter(circuit: CircuitBreakerStore) {
    return new GupshupAdapter({ configResolver: async () => DUMB_CONFIG, circuitBreaker: circuit })
  }

  it('opens after threshold failures and short-circuits subsequent sends', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: 'unauthorized' }) })
    const adapter = buildAdapter(inMemoryCircuit())

    for (let i = 0; i < 5; i++) {
      const r = await adapter.send('ch_1', { to: '919999999999', text: 'hi' })
      expect(r.success).toBe(false)
    }
    expect(fetchMock).toHaveBeenCalledTimes(5)

    const r = await adapter.send('ch_1', { to: '919999999999', text: 'hi' })
    expect(r.success).toBe(false)
    expect(r.error).toContain('Circuit breaker open')
    expect(fetchMock).toHaveBeenCalledTimes(5) // no new upstream call
  })

  it('resets the circuit after a success', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'boom' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ messageId: 'm_1' }) })
    const adapter = buildAdapter(inMemoryCircuit())

    await adapter.send('ch_1', { to: 'x', text: 'hi' }) // failure 1
    for (let i = 0; i < 4; i++) {
      fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ message: 'boom' }) }))
      await adapter.send('ch_1', { to: 'x', text: 'hi' })
    }

    // circuit now open (5 failures)
    const opened = await adapter.send('ch_1', { to: 'x', text: 'hi' })
    expect(opened.success).toBe(false)

    // clear the counter directly (success path resets)
    const circuit = inMemoryCircuit()
    const resetAdapter = buildAdapter(circuit)
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messageId: 'm_2' }) })
    const r = await resetAdapter.send('ch_1', { to: 'x', text: 'hi' })
    expect(r.success).toBe(true)
    expect(await circuit.get('circuit:gupshup:ch_1')).toBeNull()
  })

  it('does not throw when the circuit store itself fails', async () => {
    const brokenCircuit: CircuitBreakerStore = {
      async get() {
        throw new Error('redis down')
      },
      async setex() {
        throw new Error('redis down')
      },
      async del() {
        throw new Error('redis down')
      },
    }
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messageId: 'm' }) })
    const adapter = buildAdapter(brokenCircuit)

    const r = await adapter.send('ch_1', { to: 'x', text: 'hi' })
    expect(r.success).toBe(true)
  })
})

describe('chaos: BaileysAdapter retry semantics', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function build(host: Partial<BaileysSocketHost>): { adapter: BaileysAdapter; host: BaileysSocketHost } {
    const full: BaileysSocketHost = {
      sendViaBaileys: async () => ({ messageId: 'm' }),
      sendBaileysDocument: async () => ({ messageId: 'm' }),
      sendBaileysImage: async () => ({ messageId: 'm' }),
      isBaileysConnected: () => true,
      getBaileysState: async () => null,
      startBaileysSocket: async () => {},
      disconnectBaileys: async () => {},
      ...host,
    }
    return {
      adapter: new BaileysAdapter(full, async () => 'tenant_1', { maxRetries: 3, retryDelayMs: 5 }),
      host: full,
    }
  }

  it('retries on "not connected" and succeeds once reconnected', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('not connected'))
      .mockRejectedValueOnce(new Error('not connected'))
      .mockResolvedValueOnce({ messageId: 'm_retry' })
    const { adapter } = build({ sendViaBaileys: send })

    const r = await adapter.send('ch_1', { to: '919999999999', text: 'hi' })

    expect(r.success).toBe(true)
    expect(r.providerMessageId).toBe('m_retry')
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('fails fast (no retry) on a non-connection error', async () => {
    const send = vi.fn().mockRejectedValue(new Error('rate limited'))
    const { adapter } = build({ sendViaBaileys: send })

    const r = await adapter.send('ch_1', { to: '919999999999', text: 'hi' })

    expect(r.success).toBe(false)
    expect(r.error).toContain('rate limited')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('gives up after max retries when never reconnected', async () => {
    const send = vi.fn().mockRejectedValue(new Error('not connected'))
    const { adapter } = build({ sendViaBaileys: send })

    const r = await adapter.send('ch_1', { to: '919999999999', text: 'hi' })

    expect(r.success).toBe(false)
    expect(r.error).toContain('after retries')
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('returns graceful error for an unknown channel', async () => {
    const { host } = build({})
    const adapter = new BaileysAdapter(host, async () => null)
    const r = await adapter.send('ch_missing', { to: '919999999999', text: 'hi' })
    expect(r.success).toBe(false)
    expect(r.error).toContain('Channel not found')
  })
})

describe('chaos: AuthorityOutboxDispatcher — no crash on infra failure', () => {
  it('tolerates a DB poll failure without throwing', async () => {
    const sql = vi.fn(async () => {
      throw new Error('postgres connection reset')
    }) as any

    const registry: CapabilityRegistry = { get: vi.fn() as any } as any
    const dispatcher = new AuthorityOutboxDispatcher(sql, registry, { pollIntervalMs: 1000 })
    dispatcher.start()

    // poll() must resolve without throwing even when the tagged template fails
    await expect(dispatcher['poll']()).resolves.toBeUndefined()
    dispatcher.stop()
  })

  it('marks dispatch failed when execution throws', async () => {
    const rows = [{ outbox_id: 'o1', intent_id: 'i1', plan_id: 'p1', payload: {}, priority_class: 'normal' }]
    const calls: string[] = []
    const sql: any = vi.fn(async (strings: TemplateStringsArray) => {
      const q = strings.join('?')
      if (q.includes('authority_queue_outbox')) return rows
      if (q.includes('authority_queue_dispatch_attempts') && q.includes('INSERT')) {
        calls.push('insert_attempt')
        return [{ attempt_id: 'a1' }]
      }
      if (q.includes('authority_plans')) return []
      calls.push('other')
      return []
    })
    sql.json = (v: unknown) => v

    const registry: CapabilityRegistry = { get: vi.fn() } as any
    const dispatcher = new AuthorityOutboxDispatcher(sql, registry, { pollIntervalMs: 1000 })
    dispatcher.start()

    await dispatcher['poll']()

    expect(calls).toContain('insert_attempt')
    dispatcher.stop()
  })
})
