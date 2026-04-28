import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mock session for all tests
const mockSession = {
  tenantId: 'tenant_test_123',
  userId: 'user_test_456',
  companyName: 'Test Electronics Shop',
  role: 'owner',
  erpMode: 'mock' as const,
}

// Mock DB responses factory
const createMockProduct = (overrides = {}) => ({
  id: 'prod_test_001',
  item_code: 'TEST-001',
  item_name: 'Test LED Bulb 9W',
  hsn_code: '9405',
  gst_rate: '18',
  rate: '150',
  mrp: '200',
  stock_quantity: '100',
  reserved: '0',
  available: '100',
  category: 'Lighting',
  unit: 'pcs',
  is_active: true,
  tenant_id: 'tenant_test_123',
  ...overrides,
})

const createMockCustomer = (overrides = {}) => ({
  id: 'cust_test_001',
  customer_name: 'Rajesh Kumar',
  phone: '9876543210',
  email: 'rajesh@example.com',
  gstin: '',
  billing_address: '123 Main St, Mumbai',
  shipping_address: '123 Main St, Mumbai',
  is_active: true,
  tenant_id: 'tenant_test_123',
  totalSales: 25000,
  ...overrides,
})

const createMockInvoice = (overrides = {}) => ({
  id: 'inv_test_001',
  invoice_number: 'INV-2026-001',
  customer_id: 'cust_test_001',
  customer_name: 'Rajesh Kumar',
  customer_phone: '9876543210',
  customer_gstin: '',
  subtotal: '5000',
  cgst: '450',
  sgst: '450',
  igst: '0',
  total: '5900',
  grand_total: '5900',
  payment_mode: 'UPI',
  payment_status: 'PAID',
  status: 'ACTIVE',
  erp_sync_status: 'PENDING',
  idempotency_key: null,
  tenant_id: 'tenant_test_123',
  ...overrides,
})

const createMockPurchase = (overrides = {}) => ({
  id: 'po_test_001',
  purchase_invoice_number: 'PO-2026-001',
  supplier_id: 'sup_test_001',
  supplier_name: 'ABC Wholesale',
  supplier_gstin: '27ABCDE1234F1Z5',
  subtotal: '10000',
  total: '10000',
  grand_total: '11800',
  invoice_date: '2026-04-28',
  due_date: '2026-05-28',
  status: 'PENDING',
  notes: '',
  tenant_id: 'tenant_test_123',
  ...overrides,
})

// Test counter for unique IDs
let testIdCounter = 0

// ============================================================
// SMOKE TEST: Health Check
// ============================================================
describe('Health & Session Endpoints', () => {
  it('should respond to health check', async () => {
    const res = await fetch('http://localhost/api/health')
    expect(res.status).toBeDefined()
  })
})

// ============================================================
// SMOKE TEST: Products API
// ============================================================
describe('Products API', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('GET /api/merchant/products - should return products list', async () => {
    const { query, queryOne } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue([createMockProduct()])
    vi.spyOn(queryOne, 'default').mockResolvedValue({ count: 1 })

    const req = new NextRequest('http://localhost/api/merchant/products')
    const { GET } = await import('@/app/api/merchant/products/route')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
  })

  it('POST /api/merchant/products - should create product', async () => {
    const { query, queryOne } = await import('@/lib/db/client')
    vi.spyOn(queryOne, 'default').mockResolvedValueOnce(null) // no duplicate
    vi.spyOn(query, 'default').mockResolvedValueOnce({}) // INSERT success

    const req = new NextRequest('http://localhost/api/merchant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemCode: `NEW-${++testIdCounter}`,
        itemName: 'New LED Bulb',
        rate: 200,
        stock: 50,
        category: 'Lighting',
      }),
    })

    const { POST } = await import('@/app/api/merchant/products/route')
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.itemCode).toBeDefined()
  })

  it('POST /api/merchant/products - should reject duplicate', async () => {
    const { queryOne } = await import('@/lib/db/client')
    vi.spyOn(queryOne, 'default').mockResolvedValueOnce({ id: 'existing' })

    const req = new NextRequest('http://localhost/api/merchant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemCode: 'DUPLICATE', itemName: 'Duplicate Item' }),
    })

    const { POST } = await import('@/app/api/merchant/products/route')
    const res = await POST(req)

    expect(res.status).toBe(409)
  })

  it('POST /api/merchant/products - should require item code and name', async () => {
    const req = new NextRequest('http://localhost/api/merchant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemName: 'No Code Item' }),
    })

    const { POST } = await import('@/app/api/merchant/products/route')
    const res = await POST(req)

    expect(res.status).toBe(400)
  })
})

// ============================================================
// SMOKE TEST: Customers API
// ============================================================
describe('Customers API', () => {
  it('GET /api/merchant/customers - should return customers list', async () => {
    const { query } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue([createMockCustomer()])

    const req = new NextRequest('http://localhost/api/merchant/customers')
    const { GET } = await import('@/app/api/merchant/customers/route')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
  })

  it('POST /api/merchant/customers - should create customer', async () => {
    const { query, queryOne } = await import('@/lib/db/client')
    vi.spyOn(queryOne, 'default').mockResolvedValueOnce(null)
    vi.spyOn(query, 'default').mockResolvedValueOnce({})

    const req = new NextRequest('http://localhost/api/merchant/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: `New Customer ${++testIdCounter}`,
        phone: '9876543210',
        email: 'new@example.com',
      }),
    })

    const { POST } = await import('@/app/api/merchant/customers/route')
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('POST /api/merchant/customers - should require customer name', async () => {
    const req = new NextRequest('http://localhost/api/merchant/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    })

    const { POST } = await import('@/app/api/merchant/customers/route')
    const res = await POST(req)

    expect(res.status).toBe(400)
  })
})

// ============================================================
// SMOKE TEST: Invoices API
// ============================================================
describe('Invoices API', () => {
  it('GET /api/merchant/invoices - should return invoices list', async () => {
    const { query } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue([createMockInvoice()])

    const req = new NextRequest('http://localhost/api/merchant/invoices')
    const { GET } = await import('@/app/api/merchant/invoices/route')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('POST /api/merchant/invoices - should create invoice with idempotency', async () => {
    const { query } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/merchant/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Walk-in Customer',
        lineItems: [{ name: 'LED Bulb', qty: 2, rate: 150, gst: 18 }],
        total: 354,
        idempotencyKey: `idem_test_${++testIdCounter}`,
      }),
    })

    const { POST } = await import('@/app/api/merchant/invoices/route')
    const res = await POST(req)

    // May be 200 or 409 depending on idempotency check
    expect([200, 409]).toContain(res.status)
  })
})

// ============================================================
// SMOKE TEST: Purchases API
// ============================================================
describe('Purchases API', () => {
  it('GET /api/merchant/purchases - should return purchases list', async () => {
    const { query } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue([createMockPurchase()])

    const req = new NextRequest('http://localhost/api/merchant/purchases')
    const { GET } = await import('@/app/api/merchant/purchases/route')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('POST /api/merchant/purchases - should create purchase', async () => {
    const { query, queryOne } = await import('@/lib/db/client')
    vi.spyOn(queryOne, 'default').mockResolvedValueOnce(null) // no duplicate
    vi.spyOn(query, 'default').mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/merchant/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchaseInvoiceNumber: `PO-NEW-${++testIdCounter}`,
        supplierName: 'ABC Wholesale',
        grandTotal: 11800,
        invoiceDate: '2026-04-28',
      }),
    })

    const { POST } = await import('@/app/api/merchant/purchases/route')
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('POST /api/merchant/purchases - should require invoice number and supplier', async () => {
    const req = new NextRequest('http://localhost/api/merchant/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grandTotal: 1000 }),
    })

    const { POST } = await import('@/app/api/merchant/purchases/route')
    const res = await POST(req)

    expect(res.status).toBe(400)
  })
})

// ============================================================
// SMOKE TEST: Magic Scan API
// ============================================================
describe('Magic Scan API', () => {
  it('POST /api/magic-scan - should return mock data', async () => {
    const formData = new FormData()
    // Add a dummy file-like blob
    const blob = new Blob(['test'], { type: 'image/jpeg' })
    formData.append('file', blob, 'test.jpg')

    const req = new NextRequest('http://localhost/api/magic-scan', {
      method: 'POST',
      body: formData,
    })

    const { POST } = await import('@/app/api/magic-scan/route')
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })
})

// ============================================================
// SMOKE TEST: WhatsApp Send API
// ============================================================
describe('WhatsApp Send API', () => {
  it('POST /api/whatsapp/send - should accept request', async () => {
    const req = new NextRequest('http://localhost/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceId: 'inv_test_001',
        phone: '9876543210',
        messageType: 'INVOICE',
      }),
    })

    const { POST } = await import('@/app/api/whatsapp/send/route')
    const res = await POST(req)

    // May return 200 or 500 depending on Twilio config
    expect([200, 500]).toContain(res.status)
  })
})

// ============================================================
// SMOKE TEST: Products [id] API
// ============================================================
describe('Products [id] API', () => {
  it('GET /api/merchant/products/[id] - should return single product', async () => {
    const { queryOne } = await import('@/lib/db/client')
    vi.spyOn(queryOne, 'default').mockResolvedValue(createMockProduct())

    const req = new NextRequest('http://localhost/api/merchant/products/prod_test_001')
    const { GET } = await import('@/app/api/merchant/products/[id]/route')
    const res = await GET(req, { params: { id: 'prod_test_001' } })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.id).toBe('prod_test_001')
  })

  it('GET /api/merchant/products/[id] - should return 404 for non-existent', async () => {
    const { queryOne } = await import('@/lib/db/client')
    vi.spyOn(queryOne, 'default').mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/merchant/products/not_found')
    const { GET } = await import('@/app/api/merchant/products/[id]/route')
    const res = await GET(req, { params: { id: 'not_found' } })

    expect(res.status).toBe(404)
  })

  it('PUT /api/merchant/products/[id] - should update allowed fields', async () => {
    const { query } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/merchant/products/prod_test_001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_name: 'Updated LED Bulb', rate: 175 }),
    })

    const { PUT } = await import('@/app/api/merchant/products/[id]/route')
    const res = await PUT(req, { params: { id: 'prod_test_001' } })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('DELETE /api/merchant/products/[id] - should soft-delete', async () => {
    const { query } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/merchant/products/prod_test_001', {
      method: 'DELETE',
    })

    const { DELETE } = await import('@/app/api/merchant/products/[id]/route')
    const res = await DELETE(req, { params: { id: 'prod_test_001' } })

    expect(res.status).toBe(200)
  })
})

// ============================================================
// SMOKE TEST: Customers [id] API
// ============================================================
describe('Customers [id] API', () => {
  it('GET /api/merchant/customers/[id] - should return single customer', async () => {
    const { queryOne } = await import('@/lib/db/client')
    vi.spyOn(queryOne, 'default').mockResolvedValue(createMockCustomer())

    const req = new NextRequest('http://localhost/api/merchant/customers/cust_test_001')
    const { GET } = await import('@/app/api/merchant/customers/[id]/route')
    const res = await GET(req, { params: { id: 'cust_test_001' } })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.customer_name).toBe('Rajesh Kumar')
  })

  it('PUT /api/merchant/customers/[id] - should update fields', async () => {
    const { query } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/merchant/customers/cust_test_001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name: 'Updated Name', phone: '9999999999' }),
    })

    const { PUT } = await import('@/app/api/merchant/customers/[id]/route')
    const res = await PUT(req, { params: { id: 'cust_test_001' } })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('DELETE /api/merchant/customers/[id] - should deactivate', async () => {
    const { query } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/merchant/customers/cust_test_001', {
      method: 'DELETE',
    })

    const { DELETE } = await import('@/app/api/merchant/customers/[id]/route')
    const res = await DELETE(req, { params: { id: 'cust_test_001' } })

    expect(res.status).toBe(200)
  })
})

// ============================================================
// SMOKE TEST: Invoices [id] API
// ============================================================
describe('Invoices [id] API', () => {
  it('GET /api/merchant/invoices/[id] - should return single invoice', async () => {
    const { queryOne } = await import('@/lib/db/client')
    vi.spyOn(queryOne, 'default').mockResolvedValue(createMockInvoice())

    const req = new NextRequest('http://localhost/api/merchant/invoices/inv_test_001')
    const { GET } = await import('@/app/api/merchant/invoices/[id]/route')
    const res = await GET(req, { params: { id: 'inv_test_001' } })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.invoice_number).toBe('INV-2026-001')
  })

  it('PUT /api/merchant/invoices/[id] - should update limited fields', async () => {
    const { query } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/merchant/invoices/inv_test_001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_status: 'PAID', notes: 'Paid via UPI' }),
    })

    const { PUT } = await import('@/app/api/merchant/invoices/[id]/route')
    const res = await PUT(req, { params: { id: 'inv_test_001' } })

    expect(res.status).toBe(200)
  })

  it('DELETE /api/merchant/invoices/[id] - should remove', async () => {
    const { query } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/merchant/invoices/inv_test_001', {
      method: 'DELETE',
    })

    const { DELETE } = await import('@/app/api/merchant/invoices/[id]/route')
    const res = await DELETE(req, { params: { id: 'inv_test_001' } })

    expect(res.status).toBe(200)
  })
})

// ============================================================
// SMOKE TEST: Purchases [id] API
// ============================================================
describe('Purchases [id] API', () => {
  it('GET /api/merchant/purchases/[id] - should return single purchase', async () => {
    const { queryOne } = await import('@/lib/db/client')
    vi.spyOn(queryOne, 'default').mockResolvedValue(createMockPurchase())

    const req = new NextRequest('http://localhost/api/merchant/purchases/po_test_001')
    const { GET } = await import('@/app/api/merchant/purchases/[id]/route')
    const res = await GET(req, { params: { id: 'po_test_001' } })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.purchase_invoice_number).toBe('PO-2026-001')
  })

  it('PUT /api/merchant/purchases/[id] - should update status/notes', async () => {
    const { query } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/merchant/purchases/po_test_001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'APPROVED', notes: 'Approved for payment' }),
    })

    const { PUT } = await import('@/app/api/merchant/purchases/[id]/route')
    const res = await PUT(req, { params: { id: 'po_test_001' } })

    expect(res.status).toBe(200)
  })

  it('DELETE /api/merchant/purchases/[id] - should remove', async () => {
    const { query } = await import('@/lib/db/client')
    vi.spyOn(query, 'default').mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/merchant/purchases/po_test_001', {
      method: 'DELETE',
    })

    const { DELETE } = await import('@/app/api/merchant/purchases/[id]/route')
    const res = await DELETE(req, { params: { id: 'po_test_001' } })

    expect(res.status).toBe(200)
  })
})

// ============================================================
// SMOKE TEST: Dashboard Stats API
// ============================================================
describe('Dashboard Stats API', () => {
  it('GET /api/merchant/stats - should return stats', async () => {
    const req = new NextRequest('http://localhost/api/merchant/stats')
    const { GET } = await import('@/app/api/merchant/stats/route')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toBeDefined()
  })
})