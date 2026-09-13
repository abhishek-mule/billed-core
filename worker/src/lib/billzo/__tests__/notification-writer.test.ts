import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

vi.mock('../notifications', () => ({
  sendPushNotification: vi.fn(),
}))

vi.mock('../../../../lib/redis', () => ({
  getRedis: vi.fn(() => ({ publish: vi.fn().mockResolvedValue(1) })),
}))

import { supabaseAdmin } from '../supabase-admin'
import { sendPushNotification } from '../notifications'
import { getRedis } from '../../../../lib/redis'
import { emitNotification } from '../notification-writer'

type Row = Record<string, any>

class FakeDb {
  tables: Record<string, Row[]> = {}
  inserts: Record<string, Row[]> = {}
  nextInsertError: Error | null = null

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows
  }

  failNextInsert(error: Error) {
    this.nextInsertError = error
  }

  from(table: string) {
    const self = this
    const filters: Array<(r: Row) => boolean> = []
    const selected: string[] = []
    const project = (r: Row) => {
      const out: Row = {}
      for (const c of selected) out[c] = r[c]
      if (selected.length === 0) return r
      return out
    }
    const apply = () => (self.tables[table] || []).filter((r) => filters.every((f) => f(r))).map(project)

    const chain: any = {
      select(cols: string) {
        selected.push(...cols.split(',').map((c: string) => c.trim()))
        return chain
      },
      eq(k: string, v: any) {
        filters.push((r) => r[k] === v)
        return chain
      },
      limit() {
        return chain
      },
      then(resolve?: any) {
        return Promise.resolve({ data: apply(), error: null }).then(resolve)
      },
      maybeSingle() {
        const rows = apply()
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      insert(rows: Row | Row[]) {
        const arr = Array.isArray(rows) ? rows : [rows]
        const toInsert = arr.map((r) => ({
          ...r,
          id: self.nextInsertError ? undefined : `ntf_${(self.inserts[table]?.length || 0) + 1}`,
        }))
        if (self.nextInsertError) {
          const err = self.nextInsertError
          self.nextInsertError = null
          return {
            select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: err }) }),
          }
        }
        self.inserts[table] = [...(self.inserts[table] || []), ...toInsert]
        return {
          select: () => ({
            maybeSingle: () => Promise.resolve({ data: toInsert[0], error: null }),
          }),
        }
      },
    }
    return chain
  }
}

describe('emitNotification — record-first, push-second', () => {
  let db: FakeDb

  beforeEach(() => {
    vi.clearAllMocks()
    db = new FakeDb()
    ;(supabaseAdmin.from as any).mockImplementation((table: string) => db.from(table))
    ;(sendPushNotification as any).mockResolvedValue({ deliveredCount: 1, failedCount: 0 })
  })

  it('creates a payment.received record with an EVENT-keyed dedupe key', async () => {
    db.seed('notification_preferences', [])

    const res = await emitNotification({
      tenantId: 'tenant_1',
      type: 'payment.received',
      data: { customerName: 'ABC Traders', amount: 2500, invoiceNumber: 'INV-1024', targetId: 'invoice_9' },
      eventId: 'evt_001',
    })

    expect(res.created).toBe(true)
    const rows = db.inserts.notifications
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toMatchObject({
      tenant_id: 'tenant_1',
      type: 'payment.received',
      level: 'info',
      target_type: 'invoice',
      target_id: 'invoice_9',
      title: '₹2,500 received',
      body: 'ABC Traders · Invoice INV-1024',
      action: 'View payment',
      dedupe_key: 'payment.received:evt:evt_001',
      is_read: false,
    })
  })

  it('pushes AFTER the record exists, deep-linked to the exact screen', async () => {
    db.seed('notification_preferences', [])

    await emitNotification({
      tenantId: 'tenant_1',
      type: 'recovery.promise_broken',
      data: { customerName: 'Rahul Chemical', amount: 6400, targetId: 'cust_123' },
      eventId: 'evt_002',
    })

    expect(sendPushNotification).toHaveBeenCalledTimes(1)
    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_1',
        title: 'Rahul Chemical needs your attention',
        type: 'recovery.promise_broken',
        url: expect.stringContaining('/recovery/customer/cust_123'),
      }),
    )
  })

  it('is idempotent: duplicate event (23505) is a silent no-op with no push', async () => {
    db.seed('notification_preferences', [])

    const err = new Error('duplicate key value violates unique constraint')
    ;(err as any).code = '23505'
    db.failNextInsert(err)

    const res = await emitNotification({
      tenantId: 'tenant_1',
      type: 'payment.received',
      data: { customerName: 'ABC Traders', amount: 2500, targetId: 'invoice_9' },
      eventId: 'evt_001',
    })

    expect(res.created).toBe(false)
    expect(db.inserts.notifications).toBeUndefined()
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('honours the category gate: back-in-stock off by default → no record', async () => {
    db.seed('notification_preferences', [])

    const res = await emitNotification({
      tenantId: 'tenant_1',
      type: 'inventory.back_in_stock',
      data: { productName: 'PVC Pipe', stock: 12, targetId: 'product_456' },
      eventId: 'evt_003',
    })

    expect(res.created).toBe(false)
    expect(db.inserts.notifications).toBeUndefined()
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('pushEnabled=false still records the notification but skips push', async () => {
    db.seed('notification_preferences', [
      {
        tenant_id: 'tenant_1',
        push_enabled: false,
        recovery: true,
        payments: true,
        inventory: true,
        back_in_stock: false,
        updated_at: '2026-09-01T00:00:00.000Z',
      },
    ])

    const res = await emitNotification({
      tenantId: 'tenant_1',
      type: 'recovery.needs_you',
      data: { customerName: 'Rahul Chemical', amount: 6400, targetId: 'cust_123' },
      eventId: 'evt_004',
    })

    expect(res.created).toBe(true)
    expect(db.inserts.notifications).toHaveLength(1)
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('push failure never throws and never deletes the record', async () => {
    db.seed('notification_preferences', [])
    ;(sendPushNotification as any).mockRejectedValue(new Error('FCM quota exceeded'))

    const res = await emitNotification({
      tenantId: 'tenant_1',
      type: 'payment.received',
      data: { customerName: 'ABC Traders', amount: 2500, targetId: 'invoice_9' },
      eventId: 'evt_005',
    })

    await expect(Promise.resolve(res)).resolves.toEqual({ created: true })
    expect(db.inserts.notifications).toHaveLength(1)
  })

  it('publishes best-effort SSE fame-out AFTER the record is written', async () => {
    db.seed('notification_preferences', [])
    const publish = vi.fn().mockResolvedValue(1)
    ;(getRedis as any).mockReturnValue({ publish })

    await emitNotification({
      tenantId: 'tenant_1',
      type: 'payment.received',
      data: { customerName: 'ABC Traders', amount: 2500, targetId: 'invoice_9' },
      eventId: 'evt_001',
    })

    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0][0]).toBe('events:tenant_1')
    const msg = JSON.parse(publish.mock.calls[0][1])
    expect(msg.type).toBe('notification.created')
    expect(msg.data.type).toBe('payment.received')
    expect(msg.data.id).toBeTruthy()
  })
})