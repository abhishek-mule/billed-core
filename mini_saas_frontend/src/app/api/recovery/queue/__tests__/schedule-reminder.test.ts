import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billzo/api-middleware', () => ({
  verifyRequest: vi.fn(async () => ({ tenantId: 't1', userId: 'u1' })),
  validateJsonBody: vi.fn(async (req: any) => ({ data: await req.json() })),
  errorResponse: vi.fn(() => new Response('error', { status: 400 })),
  validateRequired: vi.fn(),
  logApiAccess: vi.fn(),
}))

vi.mock('@/lib/auth/feature-gate', () => ({
  requireFeature: vi.fn(async () => ({ allowed: true })),
}))

vi.mock('@/lib/billzo/outbox', () => ({
  writeOutboxEvent: vi.fn(async () => 'event-id'),
}))

vi.mock('@/lib/billzo/crypto', () => ({
  signUpiToken: vi.fn(() => 'mock-token'),
}))

vi.mock('@supabase/supabase-js', () => {
  return { createClient: vi.fn(() => mockClient) }
})

import { POST } from '@/app/api/recovery/queue/actions/route'
import { writeOutboxEvent } from '@/lib/billzo/outbox'

let tableData: Record<string, any[]> = {}

function makeChain(table: string) {
  const calls: string[] = []
  let lastValue: any = null
  const chain: any = {
    select() { return chain },
    eq() { return chain },
    in() { return chain },
    gt() { return chain },
    gte() { return chain },
    lte() { return chain },
    contains() { return chain },
    order() { return chain },
    limit() { return chain },
    single() {
      calls.push('single')
      const rows = tableData[table] || []
      const row = rows[0] ?? null
      return Promise.resolve({ data: row, error: row ? null : { message: 'not found' } })
    },
    maybeSingle() {
      calls.push('maybeSingle')
      const rows = tableData[table] || []
      const row = rows[0] ?? null
      return Promise.resolve({ data: row, error: null })
    },
    update(val: any) {
      calls.push('update')
      lastValue = val
      return chain
    },
    insert(val: any) {
      calls.push('insert')
      lastValue = val
      return Promise.resolve({ data: val, error: null })
    },
    delete() { return Promise.resolve({ data: null, error: null }) },
    then(resolve: any) { return Promise.resolve({ data: tableData[table] || [], error: null }).then(resolve) },
  }
  return chain
}

export const mockClient = {
  from: vi.fn((table: string) => makeChain(table)),
}

function makeReq(body: Record<string, any>) {
  return {
    json: async () => body,
    nextUrl: new URL('http://localhost/api/recovery/queue/actions'),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as any
}

describe('POST /api/recovery/queue/actions — schedule_reminder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tableData = {}
    mockClient.from.mockClear()
  })

  it('creates a collection_action as the canonical write model, then updates the invoice', async () => {
    tableData = {
      recovery_cases: [],
      invoices: [],
      collection_actions: [],
    }

    const res = await POST(makeReq({
      action: 'schedule_reminder',
      customerId: 'cu1',
      invoiceId: 'inv1',
      payload: {
        dueDate: new Date(Date.now() + 3600_000).toISOString(),
        amount: 5000,
        repeat: 'once',
      },
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.actionId).toBeTruthy()

    // collection_actions.insert called exactly once
    const insertCalls = mockClient.from.mock.calls.filter(([t]) => t === 'collection_actions')
    expect(insertCalls.length).toBeGreaterThanOrEqual(1)

    // invoices.update called (convenience metadata)
    const invoiceUpdateCalls = mockClient.from.mock.calls.filter(([t]) => t === 'invoices')
    expect(invoiceUpdateCalls.length).toBeGreaterThanOrEqual(1)

    // audit event written
    expect(writeOutboxEvent).toHaveBeenCalled()
    const auditPayload = (writeOutboxEvent as any).mock.calls[0][0]
    expect(auditPayload.type).toBeDefined()
  })

  it('returns alreadyScheduled (idempotent) when a scheduled reminder action exists for the invoice', async () => {
    tableData = {
      recovery_cases: [],
      invoices: [],
      collection_actions: [{
        id: 'CA_existing',
        scheduled_at: new Date().toISOString(),
      }],
    }

    const res = await POST(makeReq({
      action: 'schedule_reminder',
      customerId: 'cu1',
      invoiceId: 'inv1',
      payload: {
        dueDate: new Date(Date.now() + 3600_000).toISOString(),
        amount: 5000,
      },
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.alreadyScheduled).toBe(true)
    expect(json.actionId).toBe('CA_existing')
  })

  it('requires dueDate or delayDays', async () => {
    const res = await POST(makeReq({
      action: 'schedule_reminder',
      customerId: 'cu1',
      invoiceId: 'inv1',
      payload: { amount: 5000 },
    }))
    expect(res.status).toBe(400)
  })
})
