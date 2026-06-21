import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetTenantId = vi.fn()
vi.mock('@/lib/billzo/tenant', () => ({
  getTenantId: mockGetTenantId,
}))

let mockServerData: Record<string, any[]> = {}
const mockSupabaseFrom = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockSupabaseFrom,
  })),
}))

let dexieInvoices: Map<string, any> = new Map()
let dexiePayments: Map<string, any> = new Map()
const mockQueueWhere = vi.fn()
const mockQueueAnyOf = vi.fn()
const mockQueueFilter = vi.fn()
const mockQueueSortBy = vi.fn()
const mockQueueCount = vi.fn().mockResolvedValue(0)
const mockQueueGet = vi.fn()
const mockQueueUpdate = vi.fn()
const mockDbNotify = vi.fn()

mockQueueWhere.mockReturnValue({ anyOf: mockQueueAnyOf })
mockQueueAnyOf.mockReturnValue({ filter: mockQueueFilter })
mockQueueFilter.mockReturnValue({ sortBy: mockQueueSortBy, count: mockQueueCount })
mockQueueSortBy.mockResolvedValue([])
mockQueueCount.mockResolvedValue(0)

function resetDexie() {
  dexieInvoices = new Map()
  dexiePayments = new Map()
  mockServerData = {}
  mockQueueWhere.mockReturnValue({ anyOf: mockQueueAnyOf })
  mockQueueAnyOf.mockReturnValue({ filter: mockQueueFilter })
  mockQueueFilter.mockReturnValue({ sortBy: mockQueueSortBy, count: mockQueueCount })
  mockQueueSortBy.mockResolvedValue([])
  mockQueueCount.mockResolvedValue(0)
}

const mockDbInstance: any = {
  queue: {
    where: mockQueueWhere,
    get: mockQueueGet,
    update: mockQueueUpdate,
  },
  invoices: {
    put: vi.fn(async (record: any) => { dexieInvoices.set(record.id, record) }),
    get: vi.fn(async (id: string) => dexieInvoices.get(id)),
  },
  payments: {
    put: vi.fn(async (record: any) => { dexiePayments.set(record.id, record) }),
    get: vi.fn(async (id: string) => dexiePayments.get(id)),
  },
}

vi.mock('@/lib/billzo/db', () => ({
  db: () => mockDbInstance,
  notifyChanged: mockDbNotify,
}))

function setupServerResponse(rows: any[]) {
  mockServerData = {}
  for (const row of rows) {
    const table = row._table || 'invoices'
    delete row._table
    if (!mockServerData[table]) mockServerData[table] = []
    mockServerData[table].push(row)
  }
  mockSupabaseFrom.mockImplementation((table: string) => ({
    select: () => ({
      eq: () => ({
        gt: () => ({
          order: () => ({
            then: (resolve: any) => resolve({
              data: mockServerData[table] || null,
              error: null,
            }),
          }),
        }),
      }),
    }),
  }))
}

const TENANT_ID = 'tenant_test_rec'
const OLD_TS = new Date(Date.now() - 3_600_000).toISOString()
const NEW_TS = new Date().toISOString()

describe('reconcileFromServer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDexie()
    mockGetTenantId.mockReturnValue(TENANT_ID)
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('billzo_last_reconciled_at')
    }
  })

  it('updates Dexie when server has newer invoice data', async () => {
    dexieInvoices.set('inv_001', {
      id: 'inv_001', tenantId: TENANT_ID, customerName: 'Old',
      total: 500, paidAmount: 0, status: 'unpaid', updatedAt: OLD_TS,
    } as any)

    setupServerResponse([{
      id: 'inv_001', _table: 'invoices',
      tenant_id: TENANT_ID, customer_name: 'Old', customer_phone: '9999999999',
      customer_id: 'cust_001', total: 500, paid_amount: 500, status: 'PAID',
      due_date: NEW_TS, created_at: OLD_TS, updated_at: NEW_TS,
    }])

    const { syncAndReconcile } = await import('@/lib/billzo/sync')
    await syncAndReconcile()

    const updated = dexieInvoices.get('inv_001')
    expect(updated.paidAmount).toBe(500)
    expect(updated.status).toBe('paid')
    expect(updated.updatedAt).toBe(NEW_TS)
  })

  it('skips overwrite when invoice has pending local changes', async () => {
    dexieInvoices.set('inv_002', {
      id: 'inv_002', customerName: 'Local Edit',
      total: 1000, paidAmount: 0, status: 'unpaid', updatedAt: OLD_TS,
    } as any)

    mockQueueCount.mockResolvedValueOnce(1)

    setupServerResponse([{
      id: 'inv_002', _table: 'invoices',
      tenant_id: TENANT_ID, customer_name: 'Server Edit',
      total: 1000, paid_amount: 1000, status: 'PAID', updated_at: NEW_TS,
    }])

    const { syncAndReconcile } = await import('@/lib/billzo/sync')
    await syncAndReconcile()

    const notOverwritten = dexieInvoices.get('inv_002')
    expect(notOverwritten.paidAmount).toBe(0)
    expect(notOverwritten.status).toBe('unpaid')
  })

  it('updates Dexie when server has newer payment data', async () => {
    dexiePayments.set('pay_001', {
      id: 'pay_001', tenantId: TENANT_ID, invoiceId: 'inv_001',
      amount: 500, status: 'pending', updatedAt: OLD_TS,
    } as any)

    setupServerResponse([{
      id: 'pay_001', _table: 'payments',
      tenant_id: TENANT_ID, invoice_id: 'inv_001',
      amount: 500, payment_mode: 'upi', status: 'paid',
      razorpay_payment_id: 'rzp_test_001', razorpay_order_id: 'order_test_001',
      collected_via: 'auto', paid_at: NEW_TS,
      created_at: OLD_TS, updated_at: NEW_TS,
    }])

    const { syncAndReconcile } = await import('@/lib/billzo/sync')
    await syncAndReconcile()

    const updated = dexiePayments.get('pay_001')
    expect(updated.status).toBe('success')
    expect(updated.providerPaymentId).toBe('rzp_test_001')
    expect(updated.razorpayOrderId).toBe('order_test_001')
    expect(updated.collectedVia).toBe('auto')
    expect(updated.paidAt).toBe(NEW_TS)
  })

  it('does not overwrite when local record is newer than server', async () => {
    const localTs = new Date().toISOString()
    const staleServer = new Date(Date.now() - 7_200_000).toISOString()

    dexieInvoices.set('inv_003', {
      id: 'inv_003', customerName: 'Fresh Local',
      total: 200, paidAmount: 0, status: 'unpaid', updatedAt: localTs,
    } as any)

    setupServerResponse([{
      id: 'inv_003', _table: 'invoices',
      tenant_id: TENANT_ID, customer_name: 'Stale Server',
      total: 200, paid_amount: 200, status: 'PAID', updated_at: staleServer,
    }])

    const { syncAndReconcile } = await import('@/lib/billzo/sync')
    await syncAndReconcile()

    const unchanged = dexieInvoices.get('inv_003')
    expect(unchanged.paidAmount).toBe(0)
    expect(unchanged.status).toBe('unpaid')
    expect(unchanged.updatedAt).toBe(localTs)
  })

  it('skips when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { syncAndReconcile } = await import('@/lib/billzo/sync')
    await syncAndReconcile()
    expect(mockSupabaseFrom).not.toHaveBeenCalled()
  })

  it('skips when Supabase env not set', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const { syncAndReconcile } = await import('@/lib/billzo/sync')
    await syncAndReconcile()
    expect(mockSupabaseFrom).not.toHaveBeenCalled()
  })
})
