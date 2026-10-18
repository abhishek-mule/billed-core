import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks: auth middleware + supabase admin ─────────────────────
vi.mock('@/lib/billzo/api-middleware', () => ({
  verifyRequest: vi.fn(async () => ({ tenantId: 't1', userId: 'u1' })),
  validateRequired: vi.fn((body: any, fields: string[]) => ({
    valid: fields.every((f) => body[f] !== undefined && body[f] !== null && body[f] !== ''),
    errors: {},
  })),
  validatePhone: vi.fn((phone: string) =>
    /^(\+91|91)?[6-9]\d{9}$/.test(String(phone).replace(/[^\d+]/g, ''))
      ? { valid: true }
      : { valid: false, error: 'Invalid phone number format' },
  ),
  validateEmail: vi.fn((email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { valid: true } : { valid: false, error: 'Invalid email format' },
  ),
  validateGSTIN: vi.fn((gstin: string) =>
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase())
      ? { valid: true }
      : { valid: false, error: 'Invalid GSTIN format' },
  ),
  errorResponse: vi.fn((error: string | Error, status = 500) =>
    new Response(JSON.stringify({ error: typeof error === 'string' ? error : error.message }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  ),
  logApiAccess: vi.fn(),
  validateJsonBody: vi.fn(async (request: Request) => {
    try {
      return { data: await request.json() }
    } catch {
      return { response: new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }) }
    }
  }),
}))

const insertedRows: any[] = []
const updatedRows: any[] = []
let insertError: any = null

vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const chain: any = {}
      const passthrough = () => chain
      for (const m of ['select', 'eq', 'in', 'order', 'limit', 'range']) chain[m] = passthrough
      chain.insert = vi.fn((row: any) => {
        insertedRows.push(row)
        return chain
      })
      chain.update = vi.fn((row: any) => {
        updatedRows.push(row)
        return chain
      })
      chain.single = vi.fn(async () => ({ data: { id: 'cust_new' }, error: insertError }))
      chain.then = (resolve: any) => resolve({ data: [{ id: 'cust_new' }], error: null })
      return chain
    }),
  },
}))

import { POST, PATCH } from '@/app/api/customers/route'

function makeReq(body: any): any {
  return {
    method: 'POST',
    nextUrl: new URL('http://localhost/api/customers'),
    json: async () => body,
  }
}

describe('customers API — whatsapp_number + notes persistence (migration 104 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertedRows.length = 0
    updatedRows.length = 0
    insertError = null
  })

  it('POST persists whatsapp_number (normalized) and notes', async () => {
    const res = await POST(
      makeReq({
        name: 'Ramesh Kumar',
        phone: '9876543210',
        whatsapp_number: '9876500000',
        notes: 'pays on month end',
        opt_in: true,
      }),
    )
    expect(res.status).toBe(201)
    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0]
    expect(row.whatsapp_number).toBe('+919876500000')
    expect(row.notes).toBe('pays on month end')
    expect(row.opt_in).toBe(true)
    expect(row.opt_in_at).toBeTruthy()
  })

  it('POST with absent whatsapp_number and notes writes null (no silent empty strings)', async () => {
    const res = await POST(makeReq({ name: 'Sita Devi', phone: '9876543211' }))
    expect(res.status).toBe(201)
    const row = insertedRows[0]
    expect(row.whatsapp_number).toBeNull()
    expect(row.notes).toBeNull()
  })

  it('POST rejects an invalid whatsapp_number (fail-closed validation)', async () => {
    const res = await POST(
      makeReq({ name: 'Bad WA', phone: '9876543212', whatsapp_number: 'not-a-phone' }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/WhatsApp number/)
    expect(insertedRows).toHaveLength(0)
  })

  it('PATCH persists whatsapp_number and notes updates', async () => {
    const res = await PATCH(
      makeReq({ id: 'cust_1', whatsapp_number: '9876512345', notes: 'prefers evening calls' }),
    )
    expect(res.status).toBe(200)
    expect(updatedRows).toHaveLength(1)
    expect(updatedRows[0].whatsapp_number).toBe('+919876512345')
    expect(updatedRows[0].notes).toBe('prefers evening calls')
  })

  it('PATCH clears whatsapp_number/notes when sent empty', async () => {
    const res = await PATCH(makeReq({ id: 'cust_1', whatsapp_number: '', notes: '' }))
    expect(res.status).toBe(200)
    expect(updatedRows[0].whatsapp_number).toBeNull()
    expect(updatedRows[0].notes).toBeNull()
  })
})
