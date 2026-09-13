import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import {
  reconcileRecoveryCredits,
  recordRecoveryCreditPurchase,
  recordRecoveryCreditRefund,
  resumeCreditDeferredActions,
} from '@/lib/billzo/recovery-credits'
import { RECOVERY_CREDITS_DEFERRED_REASON } from '@billzo/shared'

// ── Supabase chain mock ─────────────────────────────────────────
interface LedgerMockRow {
  pool: 'included' | 'purchased'
  quantity: number
  created_at?: string
}

interface MockOpts {
  ledger?: LedgerMockRow[]
  subscription?: Record<string, any> | null
  tenants?: any[]
  allocationExists?: boolean
  deferredActions?: any[]
  insertError?: any
}

let inserts: Array<{ table: string; row: any }> = []
let updates: Array<{ table: string; row: any }> = []

function mockSupabase(opts: MockOpts = {}) {
  inserts = []
  updates = []

  const from = vi.fn((table: string) => {
    const state: { lt?: string } = {}

    const resolveLedger = (): LedgerMockRow[] => {
      const rows = opts.ledger ?? []
      if (state.lt) {
        return rows.filter((r) => !r.created_at || r.created_at < (state.lt as string))
      }
      return rows
    }

    const chain: any = {}
    const self = () => chain
    for (const m of ['select', 'eq', 'in', 'gt', 'order', 'limit']) chain[m] = vi.fn(() => chain)
    chain.lt = vi.fn((_k: string, v: string) => {
      state.lt = v
      return chain
    })

    chain.maybeSingle = vi.fn(async () => {
      if (table === 'subscriptions') return { data: opts.subscription ?? null, error: null }
      if (table === 'recovery_credit_ledger') {
        return { data: opts.allocationExists ? { id: 'alloc_1' } : null, error: null }
      }
      return { data: null, error: null }
    })
    chain.single = vi.fn(async () => {
      if (table === 'subscriptions') return { data: opts.subscription ?? null, error: null }
      return { data: null, error: null }
    })
    const write = (kind: 'insert' | 'update') =>
      vi.fn((row: any) => {
        ;(kind === 'insert' ? inserts : updates).push({ table, row })
        return chain
      })
    chain.insert = write('insert')
    chain.update = write('update')
    chain.then = (resolve: any) => {
      const hasWrite = chain.insert.mock.calls.length > 0 || chain.update.mock.calls.length > 0
      if (hasWrite) return resolve({ data: null, error: opts.insertError ?? null })
      if (table === 'tenants') return resolve({ data: opts.tenants ?? [], error: null })
      if (table === 'collection_actions') return resolve({ data: opts.deferredActions ?? [], error: null })
      if (table === 'recovery_credit_ledger') return resolve({ data: resolveLedger(), error: null })
      return resolve({ data: null, error: null })
    }
    return chain
  })
  ;(supabaseAdmin.from as any).mockImplementation(from)
  return from
}

function ledRow(pool: LedgerMockRow['pool'], quantity: number, created_at?: string): LedgerMockRow {
  return { pool, quantity, created_at }
}

const DAY = 24 * 60 * 60 * 1000

describe('reconcileRecoveryCredits (P0-1: subscriptions are the authoritative period source)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allocates from the ACTIVE SUBSCRIPTION, not tenants, with precise snapshots', async () => {
    const sub = {
      id: 'sub_1',
      plan_code: 'pro',
      current_period_start: '2026-09-13T00:00:00Z',
      current_period_end: '2026-10-13T00:00:00Z',
    }
    mockSupabase({
      tenants: [{ id: 't1', plan: 'pro' }],
      subscription: sub,
      ledger: [ledRow('purchased', 40)],
    })

    const res = await reconcileRecoveryCredits()
    expect(res.allocated).toBe(1)
    expect(res.expired).toBe(0)

    const alloc = inserts.find((i) => i.table === 'recovery_credit_ledger' && i.row.entry_type === 'allocation')
    expect(alloc).toBeDefined()
    expect(alloc!.row).toMatchObject({
      tenant_id: 't1',
      subscription_id: 'sub_1',
      pool: 'included',
      quantity: 200,
      period_start: new Date(sub.current_period_start).toISOString(),
      period_end: new Date(sub.current_period_end).toISOString(),
      // purchased (40) carried forward under the allocation
      balance_after: 40 + 200,
      pool_balance_after: 200,
    })
    // No period advance happened.
    expect(updates.filter((u) => u.table === 'subscriptions')).toHaveLength(0)
  })

  it('expires the residual included balance at the boundary with truthful snapshots', async () => {
    const sub = {
      id: 'sub_1',
      plan_code: 'pro',
      current_period_start: '2026-09-13T00:00:00Z',
      current_period_end: '2026-10-13T00:00:00Z',
    }
    mockSupabase({
      tenants: [{ id: 't1', plan: 'pro' }],
      subscription: sub,
      // 12 leftover included credits created before the boundary + 40 purchased
      ledger: [
        ledRow('included', 12, '2026-09-01T00:00:00Z'),
        ledRow('included', -2, '2026-09-05T00:00:00Z'),
        ledRow('purchased', 40, '2026-08-01T00:00:00Z'),
      ],
    })

    const res = await reconcileRecoveryCredits()
    expect(res.expired).toBe(1)
    expect(res.allocated).toBe(1)

    const expiry = inserts.find((i) => i.row.entry_type === 'expiry')
    expect(expiry!.row.quantity).toBe(-10)
    expect(expiry!.row).toMatchObject({ balance_after: 40, pool_balance_after: 0 })

    const alloc = inserts.find((i) => i.row.entry_type === 'allocation')
    expect(alloc!.row).toMatchObject({ quantity: 200, balance_after: 240, pool_balance_after: 200 })
  })

  it('advances a lapsed period forward on subscriptions and allocates the new boundary', async () => {
    const start = new Date(Date.now() - 35 * DAY).toISOString()
    const end = new Date(Date.now() - 5 * DAY).toISOString()
    mockSupabase({
      tenants: [{ id: 't1', plan: 'pro' }],
      subscription: { id: 'sub_1', plan_code: 'pro', current_period_start: start, current_period_end: end },
    })

    const res = await reconcileRecoveryCredits()
    expect(res.allocated).toBe(1)

    const subUpdate = updates.find((u) => u.table === 'subscriptions')
    expect(subUpdate).toBeDefined()
    // One 30-day roll: start becomes old end (−5d), end becomes +25d.
    expect(new Date(subUpdate!.row.current_period_start).getTime()).toBeCloseTo(new Date(end).getTime(), -3)
    expect(new Date(subUpdate!.row.current_period_end).getTime()).toBeCloseTo(new Date(end).getTime() + 30 * DAY, -3)

    const alloc = inserts.find((i) => i.row.entry_type === 'allocation')
    expect(alloc!.row.period_start).toBe(subUpdate!.row.current_period_start)
    expect(alloc!.row.period_end).toBe(subUpdate!.row.current_period_end)
  })

  it('skips when the period already has an allocation and has not lapsed', async () => {
    mockSupabase({
      tenants: [{ id: 't1', plan: 'pro' }],
      subscription: {
        id: 'sub_1',
        plan_code: 'pro',
        current_period_start: '2026-09-13T00:00:00Z',
        current_period_end: '2026-10-13T00:00:00Z',
      },
      ledger: [],
      allocationExists: true,
    })

    const res = await reconcileRecoveryCredits()
    expect({ ...res }).toEqual({ allocated: 0, expired: 0, skipped: 1 })
    expect(inserts).toHaveLength(0)
  })

  it('skips tenants with no active subscription (no parallel period source)', async () => {
    mockSupabase({ tenants: [{ id: 't1', plan: 'pro' }], subscription: null })
    const res = await reconcileRecoveryCredits()
    expect({ ...res }).toEqual({ allocated: 0, expired: 0, skipped: 1 })
    expect(inserts).toHaveLength(0)
  })
})

describe('recordRecoveryCreditPurchase / refund (precise snapshots)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('purchase computes balance_after / pool_balance_after from a replay', async () => {
    mockSupabase({ ledger: [ledRow('purchased', 100), ledRow('included', 3)] })
    const res = await recordRecoveryCreditPurchase('t1', {
      id: 'o1',
      razorpay_order_id: 'order_1',
      razorpay_payment_id: 'pay_1',
      packet_code: 'credits_50',
      credits: 50,
      amount_paise: 49900,
      currency: 'INR',
      status: 'paid',
    })
    expect(res).toEqual({ ok: true })
    const purchase = inserts.find((i) => i.row.entry_type === 'purchase')
    expect(purchase!.row).toMatchObject({ quantity: 50, balance_after: 153, pool_balance_after: 150 })
  })

  it('refund claws back purchased credits with truthful snapshots', async () => {
    mockSupabase({ ledger: [ledRow('purchased', 100), ledRow('included', 5)] })
    const res = await recordRecoveryCreditRefund(
      't1',
      { id: 'o1', razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', packet_code: 'credits_50', credits: 40, amount_paise: 39900, currency: 'INR', status: 'paid' },
    )
    expect(res).toEqual({ ok: true })
    expect(res).not.toEqual(expect.objectContaining({ alreadyRefunded: true }))
    const refund = inserts.find((i) => i.row.entry_type === 'refund')
    expect(refund!.row).toMatchObject({ quantity: -40, balance_after: 65, pool_balance_after: 60 })
  })

  it('refund refuses with credits_consumed when spent credits exceed the clawback', async () => {
    mockSupabase({ ledger: [ledRow('purchased', 10), ledRow('included', 0)] })
    const res = await recordRecoveryCreditRefund(
      't1',
      { id: 'o1', razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', packet_code: 'credits_50', credits: 40, amount_paise: 39900, currency: 'INR', status: 'paid' },
    )
    expect(res).toEqual({ ok: false, reason: 'credits_consumed' })
    expect(inserts.filter((i) => i.row.entry_type === 'refund')).toHaveLength(0)
  })

  it('refund is idempotent: unique violation on the refund order index reports alreadyRefunded', async () => {
    mockSupabase({
      ledger: [ledRow('purchased', 100)],
      insertError: Object.assign(new Error('duplicate'), { code: '23505' }),
    })
    const res = await recordRecoveryCreditRefund(
      't1',
      { id: 'o1', razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', packet_code: 'credits_50', credits: 40, amount_paise: 39900, currency: 'INR', status: 'paid' },
    )
    expect(res).toEqual({ ok: true, alreadyRefunded: true })
  })
})

describe('resumeCreditDeferredActions (P1: explicit merchant re-enable)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resumes only credit-deferred actions and scrubs the deferral metadata', async () => {
    mockSupabase({
      deferredActions: [
        { id: 'a1', metadata: { deferred_reason: RECOVERY_CREDITS_DEFERRED_REASON, deferred_at: '2026-09-01T00:00:00Z' } },
        { id: 'a2', metadata: { deferred_reason: 'user_paused' } },
        { id: 'a3', metadata: null },
      ],
    })

    const res = await resumeCreditDeferredActions('t1')
    expect(res).toEqual({ resumed: 1 })

    const scheduledUpdates = updates.filter((u) => u.row.status === 'scheduled')
    expect(scheduledUpdates).toHaveLength(1)
    expect(scheduledUpdates[0].row).toMatchObject({
      metadata: {}, // deferral keys scrubbed
      scheduled_at: expect.any(String),
      resumed_at: expect.any(String),
    })
  })

  it('returns zero when nothing is deferred', async () => {
    mockSupabase({ deferredActions: [] })
    expect(await resumeCreditDeferredActions('t1')).toEqual({ resumed: 0 })
  })
})