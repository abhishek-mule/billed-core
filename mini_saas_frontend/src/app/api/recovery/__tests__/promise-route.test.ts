import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billzo/api-middleware', () => ({
  verifyRequest: vi.fn(async () => ({ tenantId: 't1' })),
  errorResponse: vi.fn((message: string, status: number) => new Response(JSON.stringify({ error: message }), { status })),
}))
vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))
vi.mock('@/lib/billzo/db', () => ({
  uuid: vi.fn(() => 'promise_uuid_1'),
}))

import { POST } from '@/app/api/recovery/promise/route'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

let inserts: Record<string, any[]> = {}

function chainFor(table: string) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi
      .fn()
      .mockResolvedValue(
        table === 'invoices' ? { data: { tenant_id: 't1', customer_id: 'c1', customer_name: 'Acme' }, error: null } : { data: null, error: null },
      ),
    insert(rows: any) {
      inserts[table] = [...(inserts[table] || []), rows]
      return { then: null }
    },
  }
  return chain
}

function makeReq(body: Record<string, any>) {
  return { json: vi.fn().mockResolvedValue(body) } as any
}

describe('recovery/promise route — B2 attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inserts = {}
    ;(supabaseAdmin.from as any).mockImplementation((table: string) => chainFor(table))
  })

  it('B2 — records triggered_by_action_id when the originating attempt is named', async () => {
    const res = await POST(
      makeReq({ invoiceId: 'inv_1', customerId: 'c1', amount: 5000, dueDate: '2026-09-15T10:00:00.000Z', actionId: 'CA_attempt_1' }),
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    const promise = inserts['payment_promises']?.[0]
    expect(promise.triggered_by_action_id).toBe('CA_attempt_1')
    // corrected schema columns (previously written to non-existent invoice_ids/due_date/note)
    expect(promise.invoice_id).toBe('inv_1')
    expect(promise.promise_date).toBe('2026-09-15T10:00:00.000Z')
    expect(promise.status).toBe('active')
  })

  it('B2 — missing context: no attempt chain, triggered_by_action_id stays null', async () => {
    const res = await POST(
      makeReq({ invoiceId: 'inv_1', customerId: 'c1', amount: 5000, dueDate: '2026-09-15T10:00:00.000Z' }),
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    const promise = inserts['payment_promises']?.[0]
    expect(promise.triggered_by_action_id).toBeNull()
  })

  it('rejects a non-owning tenant', async () => {
    const { verifyRequest } = await import('@/lib/billzo/api-middleware')
    ;(verifyRequest as any).mockResolvedValueOnce({ tenantId: 't2' })
    chainFor('invoices').single.mockResolvedValueOnce({ data: { tenant_id: 't1', customer_id: 'c1' }, error: null })

    const res = await POST(makeReq({ invoiceId: 'inv_1', amount: 5000, dueDate: '2026-09-15T10:00:00.000Z' }))
    expect(res.status).toBe(401)
    expect(inserts['payment_promises'] ?? []).toHaveLength(0)
  })
})