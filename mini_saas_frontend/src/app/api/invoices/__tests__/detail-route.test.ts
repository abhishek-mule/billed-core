import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))
vi.mock('@/lib/billzo/auth-jwt', () => ({
  getVerifiedTenantIdFromRequest: vi.fn(() => 't1'),
}))

import { GET } from '@/app/api/invoices/[id]/route'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'

const invoiceRow = {
  id: 'inv1',
  tenant_id: 't1',
  invoice_number: 'INV-0001',
  total: 450,
  grand_total: 450,
  paid_amount: 0,
  status: 'issued',
  customer_name: 'Walk-in Customer',
  due_date: '2026-10-20',
  created_at: '2026-10-18T00:00:00.000Z',
}

const itemRows = [
  { item_name: 'Ceramic Tiles', quantity: '3', rate: '150', gst_rate: '18' },
  { item_name: 'Porcelain Tiles', quantity: 1, rate: 900, gst_rate: 18 },
]

let invoiceMissing = false
const itemSelects: string[] = []

function fromMock(table: string): any {
  const builder: any = {
    select: vi.fn((cols?: string) => {
      if (table === 'invoice_items') itemSelects.push(String(cols))
      return builder
    }),
    eq: vi.fn(() => {
      if (table === 'invoice_items') return Promise.resolve({ data: itemRows, error: null })
      return builder
    }),
    single: vi.fn(async () =>
      invoiceMissing
        ? { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
        : { data: invoiceRow, error: null },
    ),
  }
  return builder
}

function callGet() {
  return GET({} as any, { params: Promise.resolve({ id: 'inv1' }) })
}

describe('GET /api/invoices/[id] — itemized breakdown (invoice_items schema regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invoiceMissing = false
    itemSelects.length = 0
    ;(supabaseAdmin.from as any).mockImplementation((table: string) => fromMock(table))
    ;(getVerifiedTenantIdFromRequest as any).mockReturnValue('t1')
  })

  it('selects only real invoice_items columns (never name/qty/price/hsn)', async () => {
    await callGet()
    expect(itemSelects).toHaveLength(1)
    const cols = itemSelects[0]
    expect(cols).toContain('item_name')
    expect(cols).toContain('quantity')
    expect(cols).toContain('rate')
    expect(cols).not.toMatch(/\bqty\b/)
    expect(cols).not.toMatch(/\bprice\b/)
    expect(cols).not.toMatch(/\bhsn\b/)
    expect(cols).not.toMatch(/(^|,\s*)name(,|$)/)
  })

  it('returns items normalized from Postgres columns to {name, qty, price, gst_rate}', async () => {
    const res = await callGet()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.items).toEqual([
      { name: 'Ceramic Tiles', qty: 3, price: 150, gst_rate: 18 },
      { name: 'Porcelain Tiles', qty: 1, price: 900, gst_rate: 18 },
    ])
  })

  it('never returns an empty item list when invoice_items rows exist', async () => {
    const res = await callGet()
    const json = await res.json()
    expect(json.items.length).toBeGreaterThan(0)
  })

  it('404s when the invoice does not exist', async () => {
    invoiceMissing = true
    const res = await callGet()
    expect(res.status).toBe(404)
  })

  it('public (unauthenticated) branch also exposes items', async () => {
    ;(getVerifiedTenantIdFromRequest as any).mockReturnValueOnce(null)
    const res = await callGet()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.items).toEqual([
      { name: 'Ceramic Tiles', qty: 3, price: 150, gst_rate: 18 },
      { name: 'Porcelain Tiles', qty: 1, price: 900, gst_rate: 18 },
    ])
  })
})
