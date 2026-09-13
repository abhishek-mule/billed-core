import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabaseAdmin } from '../../billzo/supabase-admin'

vi.mock('postgres', () => ({
  default: vi.fn(() => buildSql()),
}))

vi.mock('../../billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

vi.mock('../../../lib/queue-logger', () => ({
  createQueueLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import {
  reserveRecoveryCredit,
  settleRecoveryCredit,
  releaseRecoveryCredit,
  releaseStaleRecoveryCreditReservations,
  getRecoveryCreditBalances,
  isRecoveryCreditsEnabled,
} from '../credit-ledger'
import { RECOVERY_CREDITS_DEFERRED_REASON } from '@billzo/shared'

// ── In-memory ledger + reservation simulation ──────────────────
interface LedgerRow {
  tenant_id: string
  pool: 'included' | 'purchased'
  quantity: number
  collection_action_id?: string
}

interface ReservationRow {
  tenant_id: string
  collection_action_id: string
  pool: 'included' | 'purchased'
  status: 'active' | 'settled' | 'released'
  expires_at: string
}

let ledger: LedgerRow[] = []
let reservations: ReservationRow[] = []

const thenable = <T>(rows: T) => ({ then: (resolve: (v: T) => void) => resolve(rows) })

// Serialises sql.begin transactions FIFO — a faithful stand-in for
// `SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`, which is what the
// real adapter relies on to sequence concurrent consumers for a tenant.
let txQueue: Promise<void> = Promise.resolve()

function buildSql() {
  const sql: any = (strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join('')

    if (query.includes('pg_advisory_xact_lock')) return thenable([])

    // ── INSERT ──
    if (query.includes('INSERT INTO recovery_credit_reservations')) {
      const row: ReservationRow = {
        tenant_id: values[0],
        collection_action_id: values[1],
        pool: values[2],
        status: 'active',
        expires_at: values[3],
      }
      if (reservations.some((r) => r.collection_action_id === row.collection_action_id)) {
        throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })
      }
      reservations.push(row)
      return thenable([])
    }
    if (query.includes('INSERT INTO recovery_credit_ledger')) {
      // column order in the query: quantity -1 debit; values are tenantId, pool,
      // balance_after, pool_balance_after, collectionActionId, reason.
      const row: LedgerRow = {
        tenant_id: values[0],
        pool: values[1],
        quantity: -1,
        collection_action_id: values[4],
      }
      if (row.collection_action_id && ledger.some((r) => r.collection_action_id === row.collection_action_id)) {
        throw Object.assign(new Error('duplicate key'), { code: '23505' })
      }
      ledger.push(row)
      return thenable([{ count: 1 }])
    }

    // ── UPDATE ──
    if (query.includes('UPDATE recovery_credit_reservations')) {
      const actionId = values[0]
      if (query.includes('expires_at <')) {
        const expiredAt = values[0]
        const before = reservations.filter((r) => r.status === 'active').length
        reservations.forEach((r) => {
          if (r.status === 'active' && r.expires_at < expiredAt) r.status = 'released'
        })
        const after = reservations.filter((r) => r.status === 'active').length
        return thenable({ count: before - after })
      }
      let count = 0
      for (const r of reservations) {
        if (r.collection_action_id === actionId && r.status === 'active') {
          r.status = query.includes("SET status = 'settled'") ? 'settled' : 'released'
          count++
        }
      }
      return thenable({ count })
    }

    // ── SELECTs (order matters: most specific first) ──
    if (query.includes('SELECT status, pool FROM recovery_credit_reservations')) {
      const rows = reservations.filter((r) => r.collection_action_id === values[0])
      return thenable(rows.map((r) => ({ status: r.status, pool: r.pool })))
    }
    if (query.includes('SELECT pool, collection_action_id') && query.includes('FROM recovery_credit_reservations')) {
      const rows = reservations.filter((r) => r.tenant_id === values[0] && r.status === 'active')
      return thenable(rows.map((r) => ({ pool: r.pool, collection_action_id: r.collection_action_id })))
    }
    if (query.includes('FROM recovery_credit_ledger')) {
      return thenable(ledger.filter((r) => r.tenant_id === values[0]).map((r) => ({ pool: r.pool, quantity: r.quantity })))
    }
    return thenable([])
  }

  sql.begin = async (fn: (tx: unknown) => Promise<unknown>) => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const prev = txQueue
    txQueue = prev.then(() => gate)
    await prev
    try {
      return await fn(sql)
    } finally {
      release()
    }
  }
  return sql
}

// supabase chain mock (isRecoveryCreditsEnabled)
function supabaseFrom(table: string) {
  const chain: any = {}
  const self = () => chain
  for (const m of ['select', 'eq', 'maybeSingle']) chain[m] = self
  chain.maybeSingle = async () => ({ data: tenantFlags.get(table) ?? null, error: null })
  return chain
}
const tenantFlags = new Map<string, { recovery_credits_enabled: boolean | null }>()

describe('credit-ledger (worker adapter) — reservation model', () => {
  beforeEach(() => {
    ledger = []
    reservations = []
    vi.clearAllMocks()
    tenantFlags.clear()
    vi.stubEnv('DATABASE_URL', 'postgres://local/test')
    vi.stubEnv('AUTHORITY_DATABASE_URL', 'postgres://local/authority')
    ;(supabaseAdmin.from as any).mockImplementation(supabaseFrom)
  })

  it('fails closed when no DATABASE_URL is configured', async () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('AUTHORITY_DATABASE_URL', '')
    expect(await getRecoveryCreditBalances('t1')).toEqual({ included: 0, purchased: 0 })
    expect(await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })).toEqual({
      reserved: false,
      reason: 'no_database',
    })
    expect(await settleRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })).toEqual({
      settled: false,
      reason: 'no_database',
    })
    expect(await releaseRecoveryCredit('a1')).toEqual({ released: false })
    expect(await releaseStaleRecoveryCreditReservations()).toBe(0)
  })

  it('flags tenants only when recovery_credits_enabled is true', async () => {
    tenantFlags.set('tenants', { recovery_credits_enabled: true })
    expect(await isRecoveryCreditsEnabled('t1')).toBe(true)
    tenantFlags.set('tenants', { recovery_credits_enabled: false })
    expect(await isRecoveryCreditsEnabled('t2')).toBe(false)
    tenantFlags.set('tenants', null as any)
    expect(await isRecoveryCreditsEnabled('t3')).toBe(false)
  })

  it('replays the immutable ledger into per-pool balances', async () => {
    ledger = [
      { tenant_id: 't1', pool: 'included', quantity: 200 },
      { tenant_id: 't1', pool: 'included', quantity: -3 },
      { tenant_id: 't1', pool: 'purchased', quantity: 500 },
      { tenant_id: 'other', pool: 'purchased', quantity: 999 }, // other tenant ignored
    ]
    expect(await getRecoveryCreditBalances('t1')).toEqual({ included: 197, purchased: 500 })
  })

  it('reserves from the included pool first when both are available and settles into a consumption entry', async () => {
    ledger = [{ tenant_id: 't1', pool: 'included', quantity: 2 }, { tenant_id: 't1', pool: 'purchased', quantity: 5 }]

    const res = await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })
    expect(res).toEqual({ reserved: true, pool: 'included' })
    expect(reservations).toEqual([
      expect.objectContaining({ tenant_id: 't1', collection_action_id: 'a1', pool: 'included', status: 'active' }),
    ])

    expect(await settleRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })).toEqual({ settled: true })
    const consumed = ledger.filter((r) => r.collection_action_id)
    expect(consumed).toHaveLength(1)
    expect(consumed[0].pool).toBe('included')
    expect(consumed[0].quantity).toBe(-1)
    expect(reservations.find((r) => r.collection_action_id === 'a1')?.status).toBe('settled')
    expect(await getRecoveryCreditBalances('t1')).toEqual({ included: 1, purchased: 5 })
  })

  it('falls through to purchased credits once the included pool is empty', async () => {
    ledger = [{ tenant_id: 't1', pool: 'included', quantity: 0 }, { tenant_id: 't1', pool: 'purchased', quantity: 5 }]
    const res = await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a2' })
    expect(res).toEqual({ reserved: true, pool: 'purchased' })
    await settleRecoveryCredit({ tenantId: 't1', collectionActionId: 'a2' })
    const purchasedRow = ledger.find((r) => r.collection_action_id === 'a2')
    expect(purchasedRow?.pool).toBe('purchased')
    expect(await getRecoveryCreditBalances('t1')).toEqual({ included: 0, purchased: 4 })
  })

  it('refuses to reserve when both pools are empty (defer, never send) — no reservation row', async () => {
    ledger = [{ tenant_id: 't1', pool: 'included', quantity: -200 }, { tenant_id: 't1', pool: 'purchased', quantity: 0 }]
    const res = await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })
    expect(res).toEqual({ reserved: false, reason: RECOVERY_CREDITS_DEFERRED_REASON })
    expect(reservations).toHaveLength(0)
    expect(ledger.filter((r) => r.collection_action_id)).toHaveLength(0)
  })

  it('is exactly-once: settle for an already-settled action reports alreadySettled and never double-bills', async () => {
    ledger = [{ tenant_id: 't1', pool: 'purchased', quantity: 5 }]
    expect(await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })).toEqual({ reserved: true, pool: 'purchased' })
    expect(await settleRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })).toEqual({ settled: true })
    expect(await settleRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })).toEqual({
      settled: true,
      alreadySettled: true,
    })
    expect(ledger.filter((r) => r.collection_action_id)).toHaveLength(1)
    expect(await getRecoveryCreditBalances('t1')).toEqual({ included: 0, purchased: 4 })
  })

  it('is idempotent on reserve: a second reserve for the same action reports alreadyReserved without a duplicate row', async () => {
    ledger = [{ tenant_id: 't1', pool: 'included', quantity: 3 }]
    expect(await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })).toEqual({ reserved: true, pool: 'included' })
    const second = await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })
    expect(second).toMatchObject({ reserved: true, alreadyReserved: true, pool: 'included' })
    expect(reservations.filter((r) => r.collection_action_id === 'a1')).toHaveLength(1)
  })

  it('release returns a failed-action credit to the pool; a later success still settles', async () => {
    ledger = [{ tenant_id: 't1', pool: 'included', quantity: 1 }]
    await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })
    expect(await releaseRecoveryCredit('a1')).toEqual({ released: true })
    expect(reservations.find((r) => r.collection_action_id === 'a1')?.status).toBe('released')

    // The send is retried and now succeeds — settle via the original released pool.
    expect(await settleRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })).toEqual({ settled: true })
    expect(ledger.filter((r) => r.collection_action_id)).toHaveLength(1)
  })

  it('releasing a settled reservation is a no-op', async () => {
    ledger = [{ tenant_id: 't1', pool: 'included', quantity: 1 }]
    await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })
    await settleRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })
    expect(await releaseRecoveryCredit('a1')).toEqual({ released: false })
    expect(reservations.find((r) => r.collection_action_id === 'a1')?.status).toBe('settled')
  })

  it('never lets an in-flight reservation for a settled action be reserved again', async () => {
    ledger = [{ tenant_id: 't1', pool: 'included', quantity: 2 }]
    await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })
    await settleRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })
    // A crashed-then-restarted worker re-reserves before realising the send already billed.
    // Residual credits are still spendable, so the claim tag (unique action) is what blocks it.
    const again = await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })
    expect(again).toEqual({ reserved: false, reason: 'already_settled' })
  })

  it('adversarial: two concurrent reserves with one credit allow exactly one dispatch', async () => {
    ledger = [{ tenant_id: 't1', pool: 'included', quantity: 1 }]

    const results = await Promise.all([
      reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' }),
      reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a2' }),
    ])

    const reserved = results.filter((r) => r.reserved === true && !(r as { alreadyReserved?: boolean }).alreadyReserved)
    const deferred = results.filter((r) => r.reserved === false)
    expect(reserved).toHaveLength(1)
    expect(deferred).toHaveLength(1)
    expect(deferred[0]).toEqual({ reserved: false, reason: RECOVERY_CREDITS_DEFERRED_REASON })
    expect(reservations.filter((r) => r.status === 'active')).toHaveLength(1)

    // The one dispatched action succeeds and settles → exactly one billed action.
    const winner = reserved[0] as { pool: 'included' | 'purchased' }
    const winningAction = results.indexOf(reserved[0]) === 0 ? 'a1' : 'a2'
    await settleRecoveryCredit({ tenantId: 't1', collectionActionId: winningAction, reason: 'automated_action_completed' })
    expect(ledger.filter((r) => r.collection_action_id)).toHaveLength(1)
    expect((await settleRecoveryCredit({ tenantId: 't1', collectionActionId: winningAction })).settled).toBe(true)
    expect(ledger.filter((r) => r.collection_action_id)).toHaveLength(1)
    expect(winner.pool === 'included' || winner.pool === 'purchased').toBe(true)
    expect(await getRecoveryCreditBalances('t1')).toEqual({ included: 0, purchased: 0 })
  })

  it('adversarial: two concurrent reserves with two credits both reserve without overbooking', async () => {
    ledger = [{ tenant_id: 't1', pool: 'included', quantity: 2 }]

    const results = await Promise.all([
      reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' }),
      reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a2' }),
    ])

    expect(results.every((r) => r.reserved === true && !(r as { alreadyReserved?: boolean }).alreadyReserved)).toBe(true)
    const actions = reservations.filter((r) => r.status === 'active').map((r) => r.collection_action_id)
    expect(new Set(actions)).toEqual(new Set(['a1', 'a2']))
    await settleRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })
    await settleRecoveryCredit({ tenantId: 't1', collectionActionId: 'a2' })
    expect(ledger.filter((r) => r.collection_action_id).length).toBe(2)
    expect(await getRecoveryCreditBalances('t1')).toEqual({ included: 0, purchased: 0 })
  })

  it('the stale sweep releases only expired active reservations', async () => {
    ledger = [{ tenant_id: 't1', pool: 'included', quantity: 5 }]
    await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a1' })
    await reserveRecoveryCredit({ tenantId: 't1', collectionActionId: 'a2' })

    const WIN = (ms: number) => new Date(Date.now() + ms).toISOString()
    reservations.forEach((r) => {
      r.expires_at = r.collection_action_id === 'a1' ? WIN(-60_000) : WIN(60_000)
    })

    expect(await releaseStaleRecoveryCreditReservations()).toBe(1)
    expect(reservations.find((r) => r.collection_action_id === 'a1')?.status).toBe('released')
    expect(reservations.find((r) => r.collection_action_id === 'a2')?.status).toBe('active')
  })
})