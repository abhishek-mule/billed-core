import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/queue-logger', () => ({
  createQueueLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import {
  classifyBreaches,
  reconcileWebhookAlerts,
  scanWebhookInboxHealth,
  runWebhookAlertCheckOnce,
  RETRY_STORM_MIN_ROWS,
} from '../inbox-alerts'
import type { InboxHealthMetrics } from '../inbox-alerts'

// ── tiny fake supabase client ──────────────────────────────────────────────
// `scenario` drives every webhook_inbox query result; alerts-table writes are
// recorded into op log for assertions.
type Op = { table: string; kind: 'select' | 'insert' | 'update'; args: unknown[]; steps: string[] }

interface Scenario {
  deadCount: number
  retryCount: number
  oldestQueuedAt: string | null
  staleCount: number
  staleSample: string[]
  activeAlerts: string[]
  inboxError: string | null
  alertsError: string | null
}

function makeClient(scenario: Scenario, ops: Op[]) {
  const makeChain = (table: string) => {
    const steps: string[] = []
    let opKind: 'select' | 'update' = 'select'

    const computeResult = () => {
      if (opKind === 'update') {
        return { data: null, error: scenario.alertsError ? { message: scenario.alertsError } : null }
      }

      if (table === 'webhook_inbox') {
        const status = steps.find((s) => s.startsWith('status='))?.slice('status='.length)
        if (status === 'dead') {
          if (scenario.inboxError) return { count: undefined, data: undefined, error: { message: scenario.inboxError } }
          return { count: scenario.deadCount, data: undefined, error: null }
        }
        if (status === 'queued' && steps.some((s) => s.startsWith('attempts>='))) {
          if (scenario.inboxError) return { count: undefined, data: undefined, error: { message: scenario.inboxError } }
          return { count: scenario.retryCount, data: undefined, error: null }
        }
        if (status === 'queued' && steps.includes('order(available_at)')) {
          if (scenario.inboxError) return { data: undefined, error: { message: scenario.inboxError } }
          return { data: scenario.oldestQueuedAt ? [{ available_at: scenario.oldestQueuedAt }] : [], error: null }
        }
        if (status === 'processing') {
          const isCount = steps.some((s) => s.startsWith('count'))
          if (scenario.inboxError) return { error: { message: scenario.inboxError } }
          if (isCount) return { count: scenario.staleCount, data: undefined, error: null }
          return { data: scenario.staleSample.map((id) => ({ id })), error: null }
        }
        if (scenario.inboxError) return { error: { message: scenario.inboxError } }
        return { data: [], error: null }
      }

      if (table === 'webhook_inbox_alerts') {
        if (scenario.alertsError) return { data: undefined, error: { message: scenario.alertsError } }
        return { data: scenario.activeAlerts.map((kind) => ({ kind })), error: null }
      }

      return { data: [], error: null }
    }

    const chain: any = {
      then(resolve: (v: unknown) => void) {
        resolve(computeResult())
      },
      select(cols: unknown, opts?: unknown) {
        opKind = 'select'
        const isCount = !!opts
        if (isCount) steps.push('count')
        ops.push({ table, kind: 'select', args: [cols, opts], steps: [...steps] })
        return chain
      },
      insert(args: unknown) {
        opKind = 'select'
        ops.push({ table, kind: 'insert', args: [args], steps: [...steps] })
        return scenario.alertsError ? { error: { message: scenario.alertsError } } : { error: null }
      },
      update(args: unknown) {
        opKind = 'update'
        ops.push({ table, kind: 'update', args: [args], steps: [...steps] })
        return chain
      },
      eq(key: string, val: unknown) { steps.push(`status=${val}`); return chain },
      gte(key: string, val: unknown) { steps.push(`attempts>=${val}`); return chain },
      lt(key: string, val: unknown) { steps.push(`${key}<`); return chain },
      is(key: string, val: unknown) { steps.push(`${key}is${val}`); return chain },
      order(key: string) { steps.push(`order(${key})`); return chain },
      limit() { return chain },
    }
    return chain
  }

  return {
    from(table: string) {
      return makeChain(table)
    },
  }
}

function clearMetric(over: Partial<InboxHealthMetrics>): InboxHealthMetrics {
  return {
    deadRows: 0,
    queuedAttempting: 0,
    queuedStalled: false,
    oldestQueuedAgeSeconds: 0,
    staleProcessing: 0,
    staleProcessingSampleIds: [],
    ...over,
  }
}

const OLDEST = new Date(Date.now() - 45 * 60_000).toISOString() // 45 min, beyond the 30-min stall age

describe('classifyBreaches — threshold classification (pure)', () => {
  it('healthy metrics classify to no breaches', () => {
    expect(classifyBreaches(clearMetric({})).length).toBe(0)
  })

  it('dead rows fire a critical dead_rows alert', () => {
    const breaches = classifyBreaches(clearMetric({ deadRows: 2 }))
    expect(breaches).toHaveLength(1)
    expect(breaches[0].kind).toBe('dead_rows')
    expect(breaches[0].severity).toBe('critical')
  })

  it('repeated failures fire retry_storm at the row threshold', () => {
    expect(classifyBreaches(clearMetric({ queuedAttempting: RETRY_STORM_MIN_ROWS - 1 }))).toHaveLength(0)
    expect(classifyBreaches(clearMetric({ queuedAttempting: RETRY_STORM_MIN_ROWS }))[0].kind).toBe('retry_storm')
  })

  it('stalled queue and stale processing fire warnings', () => {
    const kinds = classifyBreaches(clearMetric({ queuedStalled: true, staleProcessing: 3 })).map((b) => b.kind)
    expect(kinds).toContain('queue_stalled')
    expect(kinds).toContain('stale_processing')
  })

  it('detail exposes only counts/ages/opaque row ids — never payload/PII', () => {
    const detail = classifyBreaches(
      clearMetric({ deadRows: 1, staleProcessingSampleIds: ['00000000-0000-0000-0000-000000000001'] }),
    )[0].detail
    const json = JSON.stringify(detail)
    expect(json).not.toMatch(/last_error|payload|provider_event_id|phone|body|"to"|from/i)
    expect(json).toContain('sample_row_ids')
    expect((detail.sample_row_ids as string[])[0]).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('reconcileWebhookAlerts — fire/refresh/resolve lifecycle', () => {
  it('inserts a firing row for a new breach (once), then only refreshes detail', async () => {
    const ops: Op[] = []
    const client = makeClient({ activeAlerts: [], deadCount: 1, retryCount: 0, oldestQueuedAt: null, staleCount: 0, staleSample: [], inboxError: null, alertsError: null }, ops) as any
    const breaches = classifyBreaches(clearMetric({ deadRows: 1 }))

    const first = await reconcileWebhookAlerts(client, breaches, 1700000000000)
    expect(first.fire).toEqual(['dead_rows'])
    expect(first.update).toEqual([])
    expect(first.resolve).toEqual([])
    const inserts = ops.filter((o) => o.kind === 'insert' && o.table === 'webhook_inbox_alerts')
    expect(inserts).toHaveLength(1)

    // still firing -> refresh, no new insert
    const client2 = makeClient({ activeAlerts: ['dead_rows'], deadCount: 1, retryCount: 0, oldestQueuedAt: null, staleCount: 0, staleSample: [], inboxError: null, alertsError: null }, ops) as any
    const second = await reconcileWebhookAlerts(client2, breaches, 1700000001000)
    expect(second.update).toEqual(['dead_rows'])
    expect(second.fire).toEqual([])
    const inserts2 = ops.filter((o) => o.kind === 'insert' && o.table === 'webhook_inbox_alerts')
    expect(inserts2).toHaveLength(1)
  })

  it('resolves an active alert when the breach clears', async () => {
    const ops: Op[] = []
    const client = makeClient({ activeAlerts: ['dead_rows'], deadCount: 0, retryCount: 0, oldestQueuedAt: null, staleCount: 0, staleSample: [], inboxError: null, alertsError: null }, ops) as any
    const summary = await reconcileWebhookAlerts(client, [], 1700000000000)
    expect(summary.resolve).toEqual(['dead_rows'])
    const resolveUpdate = ops.find((o) => o.kind === 'update' && (o.args[0] as { status?: string }).status === 'resolved')
    expect(resolveUpdate).toBeTruthy()
  })

  it('stops early (no writes) when reading active alerts fails', async () => {
    const ops: Op[] = []
    const client = makeClient({ activeAlerts: [], deadCount: 1, retryCount: 0, oldestQueuedAt: null, staleCount: 0, staleSample: [], inboxError: null, alertsError: 'boom' }, ops) as any
    const summary = await reconcileWebhookAlerts(client, classifyBreaches(clearMetric({ deadRows: 1 })), 1700000000000)
    expect(summary.fire).toEqual([])
    expect(ops.filter((o) => o.kind === 'insert' || o.kind === 'update').length).toBe(0)
  })
})

describe('scanWebhookInboxHealth — metrics + schema detection', () => {
  it('aggregates all inbox metrics', async () => {
    const ops: Op[] = []
    const client = makeClient({ deadCount: 2, retryCount: 7, oldestQueuedAt: OLDEST, staleCount: 4, staleSample: ['uuid-1'], activeAlerts: [], inboxError: null, alertsError: null }, ops) as any
    const scan = await scanWebhookInboxHealth(client, { queueStallMinAgeMs: 30 * 60_000, staleProcessingGraceMs: 10 * 60_000 })
    expect(scan.schemaMissing).toBe(false)
    expect(scan.metrics.deadRows).toBe(2)
    expect(scan.metrics.queuedAttempting).toBe(7)
    expect(scan.metrics.queuedStalled).toBe(true)
    expect(scan.metrics.oldestQueuedAgeSeconds).toBeGreaterThanOrEqual(45 * 60)
    expect(scan.metrics.staleProcessing).toBe(4)
    expect(scan.metrics.staleProcessingSampleIds).toEqual(['uuid-1'])
  })

  it('flags schemaMissing when webhook_inbox is absent', async () => {
    const ops: Op[] = []
    const client = makeClient({ deadCount: 0, retryCount: 0, oldestQueuedAt: null, staleCount: 0, staleSample: [], activeAlerts: [], inboxError: 'relation "public.webhook_inbox" does not exist', alertsError: null }, ops) as any
    const scan = await scanWebhookInboxHealth(client)
    expect(scan.schemaMissing).toBe(true)
  })

  it('never throws on per-query errors — degrades that metric to 0', async () => {
    const ops: Op[] = []
    const client = makeClient({ deadCount: 0, retryCount: 0, oldestQueuedAt: null, staleCount: 0, staleSample: [], activeAlerts: [], inboxError: 'something transient', alertsError: null }, ops) as any
    const scan = await scanWebhookInboxHealth(client)
    expect(scan.schemaMissing).toBe(false)
    expect(scan.metrics.deadRows).toBe(0)
  })
})

describe('runWebhookAlertCheckOnce — end-to-end pass', () => {
  it('fires an alert on a dead row', async () => {
    const ops: Op[] = []
    const client = makeClient({ deadCount: 1, retryCount: 0, oldestQueuedAt: null, staleCount: 0, staleSample: [], activeAlerts: [], inboxError: null, alertsError: null }, ops) as any
    const scan = await runWebhookAlertCheckOnce({ client })
    expect(scan.schemaMissing).toBe(false)
    expect(ops.some((o) => o.kind === 'insert' && o.table === 'webhook_inbox_alerts' && (o.args[0] as { kind?: string }).kind === 'dead_rows')).toBe(true)
  })

  it('short-circuits (retires) when the schema is missing', async () => {
    const ops: Op[] = []
    const client = makeClient({ deadCount: 0, retryCount: 0, oldestQueuedAt: null, staleCount: 0, staleSample: [], activeAlerts: [], inboxError: 'relation "public.webhook_inbox" does not exist', alertsError: null }, ops) as any
    const scan = await runWebhookAlertCheckOnce({ client })
    expect(scan.schemaMissing).toBe(true)
    expect(ops.filter((o) => o.table === 'webhook_inbox_alerts').length).toBe(0)
  })
})