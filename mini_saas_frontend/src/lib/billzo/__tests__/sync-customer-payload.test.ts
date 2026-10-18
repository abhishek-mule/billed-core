import { describe, it, expect, vi } from 'vitest'

// sync.ts imports db/tenant/supabase at module scope — stub them out.
vi.mock('@/lib/billzo/db', () => ({
  db: () => ({ queue: { where: vi.fn(), update: vi.fn(), get: vi.fn() } }),
  notifyChanged: vi.fn(),
}))
vi.mock('@/lib/billzo/tenant', () => ({ getTenantId: () => 't1' }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: vi.fn() })) }))

import { serializeQueuePayload } from '@/lib/billzo/sync'

function queueItem(entity: string, payload: Record<string, unknown>): any {
  return {
    id: 'q1',
    tenantId: 't1',
    entity,
    entityId: payload.id,
    action: 'upsert',
    payload,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('sync serializer — customer payload (migration 104 regression)', () => {
  it('carries whatsapp_number, notes and opt_in through the offline queue', () => {
    const row = serializeQueuePayload(
      queueItem('customer', {
        id: 'cust_1',
        tenantId: 't1',
        name: 'Ramesh',
        phone: '+919876543210',
        whatsapp_number: '+919876500000',
        notes: 'pays on month end',
        opt_in: true,
        opt_in_at: '2026-10-18T00:00:00.000Z',
        createdAt: '2026-10-18T00:00:00.000Z',
        updatedAt: '2026-10-18T00:00:00.000Z',
      }),
    )
    expect(row.whatsapp_number).toBe('+919876500000')
    expect(row.notes).toBe('pays on month end')
    expect(row.opt_in).toBe(true)
    expect(row.opt_in_at).toBe('2026-10-18T00:00:00.000Z')
  })

  it('writes null (not undefined) when optional fields absent — upsert must not drop columns silently', () => {
    const row = serializeQueuePayload(
      queueItem('customer', {
        id: 'cust_2',
        tenantId: 't1',
        name: 'Sita',
        phone: '+919876543211',
        createdAt: '2026-10-18T00:00:00.000Z',
        updatedAt: '2026-10-18T00:00:00.000Z',
      }),
    )
    expect(row).toHaveProperty('whatsapp_number', null)
    expect(row).toHaveProperty('notes', null)
    expect(row).toHaveProperty('opt_in', false)
    expect(row).toHaveProperty('opt_in_at', null)
  })

  it('never mints opt_in_at without consent', () => {
    const row = serializeQueuePayload(
      queueItem('customer', {
        id: 'cust_3',
        tenantId: 't1',
        name: 'No Consent',
        phone: '+919876543212',
        opt_in: false,
        opt_in_at: '2026-10-18T00:00:00.000Z', // stale value must be ignored
        createdAt: '2026-10-18T00:00:00.000Z',
        updatedAt: '2026-10-18T00:00:00.000Z',
      }),
    )
    expect(row.opt_in).toBe(false)
    expect(row.opt_in_at).toBeNull()
  })
})
