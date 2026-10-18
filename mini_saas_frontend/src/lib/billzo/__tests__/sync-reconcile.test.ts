import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Per-table Dexie mocks — reconcile writes through db().<table>.put()
function tableMock() {
  return {
    get: vi.fn(async (_id?: string) => undefined),
    put: vi.fn(async (_row?: any) => undefined),
  }
}

const tables = {
  invoices: tableMock(),
  payments: tableMock(),
  customers: tableMock(),
  products: tableMock(),
  invoiceItems: tableMock(),
  whatsappEvents: tableMock(),
  recoveryCases: tableMock(),
  recoveryAttributions: tableMock(),
  queue: {
    where: vi.fn(() => ({
      anyOf: vi.fn(() => ({
        filter: vi.fn(() => ({ count: vi.fn(async () => 0) })),
      })),
    })),
  },
}

vi.mock('@/lib/billzo/db', () => ({
  db: () => tables,
  notifyChanged: vi.fn(),
}))
vi.mock('@/lib/billzo/tenant', () => ({
  getTenantId: () => 't1',
}))

import { reconcileFromServer } from '@/lib/billzo/sync'

const productRow = {
  id: 'prod1',
  tenant_id: 't1',
  item_name: 'Ceramic Tiles',
  barcode: null,
  hsn_code: null,
  gst_rate: '18',
  stock_quantity: '250',
  low_stock_at: '10',
  rate: '500',
  purchase_rate: '250',
  unit: 'box',
  created_at: '2026-10-18T05:02:47.726Z',
  updated_at: '2026-10-18T05:02:47.726Z',
}

const itemRow = {
  id: 'item1',
  tenant_id: 't1',
  invoice_id: 'inv1',
  product_id: 'prod1',
  item_name: 'Ceramic Tiles',
  quantity: '3',
  rate: '150',
  gst_rate: '18',
  amount: '450',
  created_at: '2026-10-18T06:00:00.000Z',
}

describe('reconcileFromServer — products + invoice_items hydration (fresh-device regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: any, init: any) => {
        const body = JSON.parse(init.body)
        const rows =
          body.table === 'products' ? [productRow] : body.table === 'invoice_items' ? [itemRow] : []
        return { ok: true, json: async () => ({ success: true, data: rows }) } as any
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests products and invoice_items from the server', async () => {
    await reconcileFromServer()
    const bodies = (fetch as any).mock.calls.map((c: any[]) => JSON.parse(c[1].body))
    expect(bodies.every((b: any) => b.action === 'reconcile')).toBe(true)
    const requested = bodies.map((b: any) => b.table)
    expect(requested).toContain('products')
    expect(requested).toContain('invoice_items')
  })

  it('hydrates products with the local Product shape', async () => {
    await reconcileFromServer()
    expect(tables.products.put).toHaveBeenCalledTimes(1)
    expect(tables.products.put.mock.calls[0][0]).toMatchObject({
      id: 'prod1',
      tenantId: 't1',
      name: 'Ceramic Tiles',
      gstRate: 18,
      stock: 250,
      lowStockAt: 10,
      salePrice: 500,
      purchasePrice: 250,
      unit: 'box',
    })
  })

  it('hydrates invoice items with the local InvoiceItem shape', async () => {
    await reconcileFromServer()
    expect(tables.invoiceItems.put).toHaveBeenCalledTimes(1)
    expect(tables.invoiceItems.put.mock.calls[0][0]).toMatchObject({
      id: 'item1',
      tenantId: 't1',
      invoiceId: 'inv1',
      productId: 'prod1',
      name: 'Ceramic Tiles',
      qty: 3,
      price: 150,
      gstRate: 18,
      lineTotal: 450,
    })
  })

  it('advances the reconcile watermark even for append-only items (created_at)', async () => {
    await reconcileFromServer()
    expect(localStorage.getItem('billzo_last_reconciled_at')).toBe('2026-10-18T06:00:00.000Z')
  })
})
