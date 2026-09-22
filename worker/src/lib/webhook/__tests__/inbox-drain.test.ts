import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_WEBHOOK_BATCH_SIZE,
  MAX_WEBHOOK_ATTEMPTS,
  WEBHOOK_BACKOFF_BASE_MS,
  backoffDelayMs,
  drainWebhookInboxOnce,
  requeueWebhookEvent,
  startWebhookInboxDrain,
} from '../inbox-drain'
import { claimedRow, makeFakeClient } from './fake-client'
import type { WebhookEventProcessor } from '../process-webhook-event'

afterEach(() => {
  vi.useRealTimers()
})

/** The most recent webhook_inbox patch the drain applied (done/requeue/dead). */
function lastPatch(fake: ReturnType<typeof makeFakeClient>): any {
  const updates = fake.calls.filter((c) => c.op === 'update' && c.rows === undefined)
  return updates[updates.length - 1]?.patch
}

describe('backoffDelayMs — exponential schedule', () => {
  it('doubles per completed attempt: base, 2x, 4x, 8x, 16x', () => {
    expect(backoffDelayMs(1)).toBe(WEBHOOK_BACKOFF_BASE_MS)
    expect(backoffDelayMs(2)).toBe(WEBHOOK_BACKOFF_BASE_MS * 2)
    expect(backoffDelayMs(3)).toBe(WEBHOOK_BACKOFF_BASE_MS * 4)
    expect(backoffDelayMs(4)).toBe(WEBHOOK_BACKOFF_BASE_MS * 8)
    expect(backoffDelayMs(5)).toBe(WEBHOOK_BACKOFF_BASE_MS * 16)
  })

  it('clamps non-positive / fractional attempts to attempt 1', () => {
    expect(backoffDelayMs(0)).toBe(WEBHOOK_BACKOFF_BASE_MS)
    expect(backoffDelayMs(-3)).toBe(WEBHOOK_BACKOFF_BASE_MS)
    expect(backoffDelayMs(1.9)).toBe(WEBHOOK_BACKOFF_BASE_MS)
  })
})

describe('drainWebhookInboxOnce — success and claim failure', () => {
  it('claims a batch and marks each processed row done (last_error cleared)', async () => {
    const fake = makeFakeClient({ claimRows: [claimedRow({ id: 'r1' }), claimedRow({ id: 'r2', provider_event_id: 'm_2' })] })
    const processEvent: WebhookEventProcessor = async () => {}

    const stats = await drainWebhookInboxOnce({ client: fake.client, processEvent })

    expect(stats).toEqual({ claimed: 2, done: 2, requeued: 0, dead: 0 })
    const rpcCall = fake.calls.find((c) => c.op === 'rpc')
    expect(rpcCall?.args).toEqual({ p_limit: DEFAULT_WEBHOOK_BATCH_SIZE })
    const donePatches = fake.calls.filter((c) => c.op === 'update' && (c.patch as any)?.status === 'done')
    expect(donePatches).toHaveLength(2)
  })

  it('returns empty stats when claim returns no rows', async () => {
    const fake = makeFakeClient({ claimRows: [] })
    expect(await drainWebhookInboxOnce({ client: fake.client })).toEqual({ claimed: 0, done: 0, requeued: 0, dead: 0 })
    expect(fake.calls.filter((c) => c.op === 'update')).toHaveLength(0)
  })

  it('returns empty stats when the claim RPC errors (never throws)', async () => {
    const fake = makeFakeClient({ rpcError: { message: 'connection reset' } })
    expect(await drainWebhookInboxOnce({ client: fake.client })).toEqual({ claimed: 0, done: 0, requeued: 0, dead: 0 })
  })
})

describe('drainWebhookInboxOnce — G2 acceptance (worker side)', () => {
  it('(1) transient failure requeues the row as queued with attempts+1 and a future available_at', async () => {
    const fake = makeFakeClient({ claimRows: [claimedRow({ id: 'r1', attempts: 0 })] })
    const processEvent: WebhookEventProcessor = async () => {
      throw new Error('provider 500')
    }

    const stats = await drainWebhookInboxOnce({ client: fake.client, processEvent })

    expect(stats).toEqual({ claimed: 1, done: 0, requeued: 1, dead: 0 })
    const patch = lastPatch(fake)
    expect(patch.status).toBe('queued')
    expect(patch.attempts).toBe(1)
    expect(patch.last_error).toBe('provider 500')
    const scheduled = new Date(patch.available_at).getTime()
    expect(scheduled).toBeGreaterThan(Date.now())
    // backoff for attempt 1 = base (60s) — keeps the retry off the immediate poll
    expect(scheduled).toBeGreaterThanOrEqual(Date.now() + WEBHOOK_BACKOFF_BASE_MS - 1000)
  })

  it('(3) later attempts schedule doubling backoff windows', async () => {
    const fake = makeFakeClient({ claimRows: [claimedRow({ id: 'r1', attempts: 3 })] })
    const processEvent: WebhookEventProcessor = async () => {
      throw new Error('still broken')
    }

    await drainWebhookInboxOnce({ client: fake.client, processEvent })

    const patch = lastPatch(fake)
    expect(patch.attempts).toBe(4)
    const scheduled = new Date(patch.available_at).getTime()
    // attempt 4 -> 8x base
    expect(scheduled).toBeGreaterThanOrEqual(Date.now() + WEBHOOK_BACKOFF_BASE_MS * 8 - 1000)
    expect(scheduled).toBeLessThanOrEqual(Date.now() + WEBHOOK_BACKOFF_BASE_MS * 8 + 5000)
  })

  it('(4) attempt count increments across failure cycles, never by the claim', async () => {
    // Cycle 1: a fresh row (0 attempts) fails once -> attempts 1.
    const fake1 = makeFakeClient({ claimRows: [claimedRow({ id: 'r1', attempts: 0 })] })
    const boom: WebhookEventProcessor = async () => {
      throw new Error('nope')
    }
    await drainWebhookInboxOnce({ client: fake1.client, processEvent: boom })
    expect(lastPatch(fake1).attempts).toBe(1)

    // Cycle 2: the same row is re-claimed later (attempts 1) and fails again -> 2.
    const fake2 = makeFakeClient({ claimRows: [claimedRow({ id: 'r1', attempts: 1 })] })
    await drainWebhookInboxOnce({ client: fake2.client, processEvent: boom })
    expect(lastPatch(fake2).attempts).toBe(2)
  })

  it('(5) a fifth failure requeues — it does NOT dead prematurely', async () => {
    const fake = makeFakeClient({ claimRows: [claimedRow({ id: 'r1', attempts: 4 })] })
    const processEvent: WebhookEventProcessor = async () => {
      throw new Error('almost there')
    }

    const stats = await drainWebhookInboxOnce({ client: fake.client, processEvent })

    expect(stats).toEqual({ claimed: 1, done: 0, requeued: 1, dead: 0 })
    const patch = lastPatch(fake)
    expect(patch.status).toBe('queued')
    expect(patch.attempts).toBe(5)
  })

  it('(6) the sixth failed attempt marks the row dead (terminal for the drain)', async () => {
    const fake = makeFakeClient({ claimRows: [claimedRow({ id: 'r1', attempts: 5 })] })
    const processEvent: WebhookEventProcessor = async () => {
      throw new Error('unfixable')
    }

    const stats = await drainWebhookInboxOnce({ client: fake.client, processEvent })

    expect(stats).toEqual({ claimed: 1, done: 0, requeued: 0, dead: 1 })
    const patch = lastPatch(fake)
    expect(patch.status).toBe('dead')
    expect(patch.attempts).toBe(MAX_WEBHOOK_ATTEMPTS)
    expect(patch.last_error).toBe('unfixable')
  })

  it('(7) last_error is retained and bounded to 500 chars on requeue and on dead', async () => {
    const hugeError = 'x'.repeat(2000)

    const requeueFake = makeFakeClient({ claimRows: [claimedRow({ id: 'r1', attempts: 2 })] })
    const fail: WebhookEventProcessor = async () => {
      throw new Error(hugeError)
    }
    await drainWebhookInboxOnce({ client: requeueFake.client, processEvent: fail })
    const requeuedPatch = lastPatch(requeueFake)
    expect(requeuedPatch.last_error).toHaveLength(500)
    expect(requeuedPatch.last_error.endsWith('…')).toBe(false) // bounded, no truncation ellipsis

    const deadFake = makeFakeClient({ claimRows: [claimedRow({ id: 'r2', attempts: 5 })] })
    await drainWebhookInboxOnce({ client: deadFake.client, processEvent: fail })
    expect(lastPatch(deadFake).status).toBe('dead')
    expect(lastPatch(deadFake).last_error).toHaveLength(500)
  })

  it('(8) a successful retry marks the row done and clears last_error', async () => {
    const fake = makeFakeClient({
      claimRows: [claimedRow({ id: 'r1', attempts: 2, last_error: 'previous failure' })],
    })
    const processEvent: WebhookEventProcessor = async () => {}

    const stats = await drainWebhookInboxOnce({ client: fake.client, processEvent })

    expect(stats).toEqual({ claimed: 1, done: 1, requeued: 0, dead: 0 })
    const patch = lastPatch(fake)
    expect(patch.status).toBe('done')
    expect(patch.last_error).toBeNull()
  })
})

describe('requeueWebhookEvent — manual DLQ review', () => {
  it('(11) requeues a dead row with attempts reset and last_error preserved', async () => {
    const fake = makeFakeClient({
      tables: {
        webhook_inbox: [
          {
            ...claimedRow({ id: 'r1' }),
            status: 'dead',
            attempts: 6,
            last_error: 'previous dead error',
            available_at: new Date(0).toISOString(),
          },
        ],
      },
    })

    const ok = await requeueWebhookEvent('r1', { client: fake.client })

    expect(ok).toBe(true)
    const row = (fake as any).data?.get?.('webhook_inbox')?.[0] as any
    expect(row).toBeDefined()
    expect(row.status).toBe('queued')
    expect(row.attempts).toBe(0)
    expect(row.last_error).toBe('previous dead error')
    const now = Date.now()
    // immediately claimable (manual review action, no fresh backoff)
    expect(new Date(row.available_at).getTime()).toBeGreaterThanOrEqual(now - 1000)
    expect(new Date(row.available_at).getTime()).toBeLessThanOrEqual(now + 1000)
  })

  it('(11, safety) refuses to resurrect a non-dead row — returns false, unchanged state', async () => {
    const fake = makeFakeClient({
      tables: {
        webhook_inbox: [
          { ...claimedRow({ id: 'r_proc' }), status: 'processing', attempts: 3 },
          { ...claimedRow({ id: 'r_done' }), status: 'done', attempts: 1 },
        ],
      },
    })

    expect(await requeueWebhookEvent('r_proc', { client: fake.client })).toBe(false)
    expect(await requeueWebhookEvent('r_done', { client: fake.client })).toBe(false)

    const rows = fake.data.get('webhook_inbox') as any[]
    expect(rows[0].status).toBe('processing')
    expect(rows[1].status).toBe('done')
  })

  it('(11, safety) unknown id returns false', async () => {
    const fake = makeFakeClient({ tables: { webhook_inbox: [] } })
    expect(await requeueWebhookEvent('nope', { client: fake.client })).toBe(false)
  })
})

describe('startWebhookInboxDrain — periodic poll', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('polls periodically and stops cleanly on stop()', async () => {
    const fake = makeFakeClient({ claimRows: [claimedRow({ id: 'r1' })] })
    const processEvent: WebhookEventProcessor = async () => {}
    const handle = startWebhookInboxDrain({ client: fake.client, processEvent, intervalMs: 100 })

    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(100)

    const donePatches = fake.calls.filter((c) => c.op === 'update' && (c.patch as any)?.status === 'done')
    expect(donePatches).toHaveLength(2)

    handle.stop()
    await vi.advanceTimersByTimeAsync(300)
    expect(fake.calls.filter((c) => c.op === 'rpc')).toHaveLength(2)
  })
})