import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))
vi.mock('@/lib/billzo/redis', () => ({
  createRedisClient: vi.fn(() => ({ exists: vi.fn().mockResolvedValue(0) })),
}))
vi.mock('@/lib/billzo/whatsapp-server', () => ({
  resolveTenantByPhoneNumberId: vi.fn(async () => null),
  recordPilotEvent: vi.fn(async () => {}),
}))

const sendMock = vi.fn()
vi.mock('@billzo/shared', () => ({
  TransportRegistry: class {
    register() { return this }
    async send(_channelId: string, outbound: any) {
      return sendMock(outbound)
    }
  },
  MetaAdapter: class {},
  GupshupAdapter: class {},
  SimulationAdapter: class {},
}))

import { sendDirectWhatsApp } from '../whatsapp-send-direct'
import { updateDeliveryStatus, persistEchoWhatsAppEvent, resolveAttemptForMessageId, persistInboundWhatsAppEvent } from '@/app/api/whatsapp/webhook/route'
import { supabaseAdmin } from '../supabase-admin'

type Row = Record<string, any>

function pathValue(row: Row, key: string): any {
  if (!key.includes('->>')) return row[key]
  const [head, tail] = key.split('->>')
  const obj = row[head]
  return obj && typeof obj === 'object' ? obj[tail] : undefined
}

/** Minimal in-memory stand-in for the supabase query builder used by the
 *  functions in the attribution chain fixture. Tracks inserts/updates/upserts
 *  and lets tests seed rows for lookups. */
class FakeDb {
  tables: Record<string, Row[]> = {}
  inserts: Record<string, Row[]> = {}
  updates: Record<string, Row[]> = {}
  upserts: Record<string, Row[]> = {}

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows
  }

  from(table: string) {
    const self = this
    const filters: Array<(r: Row) => boolean> = []
    let selected: string[] | null = null
    const apply = (rows: Row[]) => rows.filter((r) => filters.every((ok) => ok(r)))
    const project = (r: Row) => {
      if (!selected) return r
      const out: Row = {}
      for (const c of selected) out[c] = r[c]
      return out
    }
    const done = () => Promise.resolve({ data: apply(self.tables[table] || []).map(project), error: null })
    const thenable = () => ({
      then(resolve?: any, reject?: any) { return done().then(resolve, reject) },
    })

    const chain: any = {
      select(cols: string) { selected = cols.split(',').map((c) => c.trim()); return chain },
      eq(k: string, v: any) { filters.push((r) => pathValue(r, k) === v); return chain },
      neq(k: string, v: any) { filters.push((r) => pathValue(r, k) !== v); return chain },
      not(k: string, _op: string, v: any) {
        filters.push((r) => {
          const val = pathValue(r, k)
          if (v === null) return val !== null && val !== undefined
          return val !== v
        })
        return chain
      },
      filter(k: string, _op: string, v: any) { filters.push((r) => pathValue(r, k) === v); return chain },
      in(k: string, v: any[]) { filters.push((r) => v.includes(pathValue(r, k))); return chain },
      gte(k: string, v: any) { filters.push((r) => Number(pathValue(r, k)) >= v); return chain },
      lte(k: string, v: any) { filters.push((r) => Number(pathValue(r, k)) <= v); return chain },
      limit() { return chain },
      order() { return chain },
      then(resolve?: any, reject?: any) { return done().then(resolve, reject) },
      maybeSingle() {
        const rows = apply(self.tables[table] || []).map(project)
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      single() {
        const rows = apply(self.tables[table] || []).map(project)
        return rows.length
          ? Promise.resolve({ data: rows[0], error: null })
          : Promise.resolve({ data: null, error: { message: 'no rows' } })
      },
      insert(rowsArr: Row | Row[]) {
        const arr = Array.isArray(rowsArr) ? rowsArr : [rowsArr]
        self.inserts[table] = [...(self.inserts[table] || []), ...arr]
        return { ...thenable(), maybeSingle() { return Promise.resolve({ data: null, error: null }) } }
      },
      update(patch: Row) {
        self.updates[table] = [...(self.updates[table] || []), patch]
        const ret: any = { eq() { return ret }, ...thenable() }
        return ret
      },
      upsert(rowsArr: Row | Row[], _opts?: any) {
        const arr = Array.isArray(rowsArr) ? rowsArr : [rowsArr]
        self.upserts[table] = [...(self.upserts[table] || []), ...arr]
        return { ...thenable() }
      },
    }
    return chain
  }
}

describe('attribution chain — attempt → transport → webhook → outcome', () => {
  let db: FakeDb
  const ATTEMPT_ID = 'CA_fix'

  beforeEach(() => {
    vi.clearAllMocks()
    db = new FakeDb()
    ;(supabaseAdmin.from as any).mockImplementation((table: string) => db.from(table))
    sendMock.mockResolvedValue({ success: true, providerMessageId: 'wamid_meta_001', latencyMs: 10 })

    // A canonical attempt created pre-transport (as A1 does) carrying a
    // provider receipt in its metadata.
    db.seed('collection_actions', [
      { id: ATTEMPT_ID, billzo_message_id: 'bzm_1', metadata: { provider_message_id: 'wamid_meta_001' } },
    ])
  })

  it('A2/A3 — outbound whatsapp_event carries the attempt identity + provider receipt', async () => {
    db.seed('whatsapp_connections', [
      { tenant_id: 't1', provider: 'meta', phone_number_id: 'pid_1', status: 'connected' },
    ])

    await sendDirectWhatsApp('t1', 'c1', 'Hello', {
      customerPhone: '919371343891',
      invoiceId: 'inv_1',
      recoveryAttemptId: ATTEMPT_ID,
    })

    const outbound = db.inserts['whatsapp_events']?.[0]
    expect(outbound).toBeTruthy()
    expect(outbound.recovery_attempt_id).toBe(ATTEMPT_ID)
    expect(outbound.provider_message_id).toBe('wamid_meta_001')
    expect(outbound.billzo_message_id).toBeTruthy()
  })

  it('delivered webhook → VERIFIED outcome with the same attempt id (chain equality)', async () => {
    db.seed('whatsapp_events', [
      { tenant_id: 't1', recovery_attempt_id: ATTEMPT_ID, invoice_id: 'inv_1', customer_id: 'c1', provider_message_id: 'wamid_meta_001' },
    ])

    await updateDeliveryStatus('t1', {
      id: 'wamid_meta_001',
      status: 'delivered',
      timestamp: '1700000000',
    })

    const outcome = db.upserts['recovery_outcomes']?.[0]
    expect(outcome).toBeTruthy()
    // chain: collection_actions.id == whatsapp_events.recovery_attempt_id == recovery_outcomes.recovery_attempt_id
    expect(outcome.recovery_attempt_id).toBe(ATTEMPT_ID)
    expect(outcome.recovery_attempt_id).toBe('CA_fix')
    expect(outcome.attribution_status).toBe('verified')
    expect(outcome.attribution_method).toBe('explicit')
    expect(outcome.provider_message_id).toBe('wamid_meta_001')
    expect(outcome.outcome_type).toBe('delivered')
  })

  it('read webhook → customer_read outcome, still verified via the same spine', async () => {
    db.seed('whatsapp_events', [
      { tenant_id: 't1', recovery_attempt_id: ATTEMPT_ID, invoice_id: 'inv_1', customer_id: 'c1', provider_message_id: 'wamid_meta_001' },
    ])

    await updateDeliveryStatus('t1', { id: 'wamid_meta_001', status: 'read', timestamp: '1700000100' })

    const outcome = db.upserts['recovery_outcomes']?.[0]
    expect(outcome.outcome_type).toBe('customer_read')
    expect(outcome.recovery_attempt_id).toBe(ATTEMPT_ID)
    expect(outcome.attribution_status).toBe('verified')
  })

  it('A3/A4 — merchant echo resolves the attempt and links the outbound row', async () => {
    // provider echo of the sent message (msg.id is the provider receipt)
    await persistEchoWhatsAppEvent('t1', { phone_number_id: 'pid_1' }, {
      id: 'wamid_meta_001',
      to: '919371343891',
      timestamp: '1700000000',
    }, 'c1')

    const echo = db.inserts['whatsapp_events']?.[0]
    expect(echo.recovery_attempt_id).toBe(ATTEMPT_ID)

    // unresolved provider id → no attempt, no guess
    await persistEchoWhatsAppEvent('t1', { phone_number_id: 'pid_1' }, {
      id: 'wamid_unknown',
      to: '919371343891',
      timestamp: '1700000001',
    }, 'c1')
    const unlinked = db.inserts['whatsapp_events']?.[1]
    expect(unlinked.recovery_attempt_id).toBe(null)
  })

  it('resolveAttemptForMessageId — billzo id then provider receipt', async () => {
    expect(await resolveAttemptForMessageId('bzm_1')).toBe(ATTEMPT_ID)
    expect(await resolveAttemptForMessageId('wamid_meta_001')).toBe(ATTEMPT_ID)
    expect(await resolveAttemptForMessageId('no_match')).toBe(null)
  })

  it('NEGATIVE TEST — delivery without attempt identity never manufactures a verified outcome', async () => {
    // A message row with NO recovery_attempt_id (identity missing).
    db.seed('whatsapp_events', [
      { tenant_id: 't1', recovery_attempt_id: null, invoice_id: 'inv_9', customer_id: 'c9', provider_message_id: 'wamid_unlinked' },
    ])

    await updateDeliveryStatus('t1', {
      id: 'wamid_unlinked',
      status: 'delivered',
      timestamp: '1700000000',
    })

    expect(db.upserts['recovery_outcomes'] ?? []).toHaveLength(0)
  })

  it('B1 — reply resolves through provider parent identity → verified on the same spine', async () => {
    // The outbound reminder is the parent the customer replied to.
    db.seed('whatsapp_events', [
      { tenant_id: 't1', recovery_attempt_id: ATTEMPT_ID, invoice_id: 'inv_1', customer_id: 'c1', provider_message_id: 'wamid_meta_001' },
    ])

    await persistInboundWhatsAppEvent('t1', { phone_number_id: 'pid_1' }, {
      id: 'wamid_inbound_1',
      from: '919371343891',
      contextId: 'wamid_meta_001',
      timestamp: '1700000200',
    }, 'c1')

    const inbound = db.inserts['whatsapp_events']?.[0]
    expect(inbound.recovery_attempt_id).toBe(ATTEMPT_ID)
    expect(inbound.direction).toBe('inbound')
    expect(inbound.metadata.context_id).toBe('wamid_meta_001')

    const outcome = db.upserts['recovery_outcomes']?.[0]
    expect(outcome.outcome_type).toBe('customer_replied')
    expect(outcome.recovery_attempt_id).toBe(ATTEMPT_ID)
    expect(outcome.attribution_status).toBe('verified')
    expect(outcome.attribution_method).toBe('explicit')
    expect(outcome.provider_message_id).toBe('wamid_inbound_1')
  })

  it('B1 — NEGATIVE: reply without a parent never becomes a verified outcome', async () => {
    // No context id at all — a cold inbound message with no provable parent.
    await persistInboundWhatsAppEvent('t1', { phone_number_id: 'pid_1' }, {
      id: 'wamid_inbound_2',
      from: '919371343891',
      timestamp: '1700000300',
    }, 'c1')

    const inbound = db.inserts['whatsapp_events']?.[0]
    expect(inbound.recovery_attempt_id).toBeNull()

    const outcome = db.inserts['recovery_outcomes']?.[0]
    expect(outcome.outcome_type).toBe('customer_replied')
    expect(outcome.recovery_attempt_id).toBeNull()
    expect(outcome.attribution_status).toBe('unknown')
    expect(outcome.attribution_method).toBeNull()
    expect(db.upserts['recovery_outcomes'] ?? []).toHaveLength(0)
  })

  it('B1 — NEGATIVE: reply to an unresolvable provider id stays unknown', async () => {
    await persistInboundWhatsAppEvent('t1', { phone_number_id: 'pid_1' }, {
      id: 'wamid_inbound_3',
      from: '919371343891',
      contextId: 'wamid_no_match',
      timestamp: '1700000400',
    }, 'c1')

    const inbound = db.inserts['whatsapp_events']?.[0]
    expect(inbound.recovery_attempt_id).toBeNull()
    const outcome = db.inserts['recovery_outcomes']?.[0]
    expect(outcome.recovery_attempt_id).toBeNull()
    expect(outcome.attribution_status).toBe('unknown')
  })

  it('B CHAIN — delivered → read → reply all resolve to the SAME attempt id', async () => {
    // One outbound reminder is the causal spine for the entire downstream chain.
    db.seed('whatsapp_events', [
      { tenant_id: 't1', recovery_attempt_id: ATTEMPT_ID, invoice_id: 'inv_1', customer_id: 'c1', provider_message_id: 'wamid_meta_001' },
    ])

    await updateDeliveryStatus('t1', { id: 'wamid_meta_001', status: 'delivered', timestamp: '1700000000' })
    await updateDeliveryStatus('t1', { id: 'wamid_meta_001', status: 'read', timestamp: '1700000100' })
    await persistInboundWhatsAppEvent('t1', { phone_number_id: 'pid_1' }, {
      id: 'wamid_inbound_chain',
      from: '919371343891',
      contextId: 'wamid_meta_001',
      timestamp: '1700000200',
    }, 'c1')

    const outcomeIds = [
      ...(db.upserts['recovery_outcomes'] ?? []),
      ...(db.inserts['recovery_outcomes'] ?? []),
    ]
    expect(outcomeIds.length).toBeGreaterThanOrEqual(3)
    for (const outcome of outcomeIds) {
      expect(outcome.recovery_attempt_id).toBe(ATTEMPT_ID)
      expect(outcome.attribution_status).toBe('verified')
    }
    expect(outcomeIds.map((o) => o.outcome_type).sort()).toEqual(['customer_read', 'customer_replied', 'delivered'])
  })

  it('B1 — reply is idempotent: duplicate inbound message is never re-recorded', async () => {
    // The reply was already persisted by a previous webhook delivery.
    db.seed('whatsapp_events', [
      { tenant_id: 't1', recovery_attempt_id: ATTEMPT_ID, invoice_id: 'inv_1', customer_id: 'c1', provider_message_id: 'wamid_meta_001' },
      { tenant_id: 't1', recovery_attempt_id: ATTEMPT_ID, invoice_id: 'inv_1', customer_id: 'c1', provider_message_id: 'wamid_inbound_dup' },
    ])

    await persistInboundWhatsAppEvent('t1', { phone_number_id: 'pid_1' }, {
      id: 'wamid_inbound_dup',
      from: '919371343891',
      contextId: 'wamid_meta_001',
      timestamp: '1700000500',
    }, 'c1')

    expect(db.inserts['whatsapp_events'] ?? []).toHaveLength(0)
    expect(db.inserts['recovery_outcomes'] ?? []).toHaveLength(0)
    expect(db.upserts['recovery_outcomes'] ?? []).toHaveLength(0)
  })
})