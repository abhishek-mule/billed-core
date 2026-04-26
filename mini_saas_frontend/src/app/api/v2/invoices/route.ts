import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'
import { generateId } from '@/lib/db/encryption'
import { createFrappeSalesInvoice, ERPMode } from '@/lib/integrations/frappe'

interface LineItem {
  itemCode: string
  itemName: string
  qty: number
  rate: number
  amount: number
  hsnCode?: string
}

interface InvoicePayload {
  customerName: string
  customerGstin?: string
  customerPhone?: string
  items: LineItem[]
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  total: number
  paymentMode?: 'cash' | 'upi' | 'udhar'
  placeOfSupply?: string
}

function getErpCredentials() {
  return {
    siteUrl: process.env.ERP_URL || 'http://localhost',
    apiKey: process.env.ERP_API_KEY || 'administrator',
    apiSecret: process.env.ERP_API_SECRET || 'admin',
  }
}

function getGstStateCode(stateName: string): string {
  const stateMap: Record<string, string> = {
    'maharashtra': '27',
    'delhi': '07',
    'karnataka': '29',
    'tamil nadu': '33',
    'gujarat': '24',
    'west bengal': '19',
    'uttar pradesh': '09',
    'rajasthan': '08',
    'kerala': '32',
    'madhya pradesh': '23',
    'telangana': '36',
    'andhra pradesh': '28',
  }
  return stateMap[stateName.toLowerCase()] || '27'
}

function determineTaxType(placeOfSupply?: string, companyState: string = 'maharashtra'): 'intra' | 'inter' {
  if (!placeOfSupply) return 'intra'
  const supplyState = placeOfSupply.toLowerCase().replace(/[^a-z]/g, '')
  return supplyState === companyState ? 'intra' : 'inter'
}

async function findOrCreateCustomer(tenantId: string, customerName: string, gstin?: string, phone?: string) {
  const existing = await queryOne<{ name: string }>(
    'SELECT name FROM customers WHERE tenant_id = $1 AND (customer_name = $2 OR gstin = $2)',
    [tenantId, customerName]
  )
  
  if (existing) {
    return existing.name
  }
  
  const customerId = generateId('CUST')
  await query(
    `INSERT INTO customers (id, tenant_id, customer_name, gstin, phone, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [customerId, tenantId, customerName, gstin || null, phone || null]
  )
  
  return customerId
}

async function findOrCreateItem(tenantId: string, itemCode: string, itemName: string) {
  const existing = await queryOne<{ name: string }>(
    'SELECT name FROM products WHERE tenant_id = $1 AND item_code = $2',
    [tenantId, itemCode]
  )
  
  if (existing) {
    return existing.name
  }
  
  const productId = generateId('ITEM')
  await query(
    `INSERT INTO products (id, tenant_id, item_code, item_name, standard_rate, created_at)
     VALUES ($1, $2, $3, $4, 0, NOW())`,
    [productId, tenantId, itemCode, itemName]
  )
  
  return productId
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tenantId } = session
    const body: InvoicePayload = await request.json()

    const {
      customerName,
      customerGstin,
      customerPhone,
      items,
      subtotal,
      cgst,
      sgst,
      igst,
      total,
      paymentMode = 'cash',
      placeOfSupply = 'Maharashtra',
    } = body

    if (!customerName || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'Customer name and at least one item required' },
        { status: 400 }
      )
    }

    // Get invoice number
    const tenant = await queryOne<{ company_name: string }>(
      'SELECT company_name FROM tenants WHERE id = $1',
      [tenantId]
    )

    const now = new Date()
    const fy = now.getFullYear()
    const fyShort = `${fy}-${fy + 1}`
    
    const seqResult = await queryOne<{ seq: number }>(
      'SELECT nextval(\'invoice_seq\') as seq'
    )
    const seq = seqResult?.seq || 1
    const invoiceNumber = `INV-${fyShort}-${String(seq).padStart(4, '0')}`

    // Create invoice record in local DB
    const invoiceId = generateId('INV')
    const taxAmount = cgst + sgst + igst

    await query(
      `INSERT INTO invoices (
        id, tenant_id, invoice_number, customer_name, customer_gstin,
        subtotal, cgst, sgst, igst, total, line_items_json,
        erp_sync_status, payment_mode, place_of_supply,
        invoice_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
      [
        invoiceId,
        tenantId,
        invoiceNumber,
        customerName,
        customerGstin || null,
        subtotal,
        cgst,
        sgst,
        igst,
        total,
        JSON.stringify(items),
        'PENDING',
        paymentMode,
        placeOfSupply,
        now.toISOString().split('T')[0],
      ]
    )

    // Prepare ERPNext payload
    const erpItems = items.map(item => ({
      item_code: item.itemCode,
      item_name: item.itemName,
      qty: item.qty,
      rate: item.rate,
      amount: item.amount,
      gst_hsn_code: item.hsnCode || '850440',
      uom: 'Nos',
    }))

    const taxType = determineTaxType(placeOfSupply)
    const erpTaxes = taxType === 'intra' ? [
      { charge_type: 'On Net Total', account_head: 'CGST - BZ', rate: 9, description: 'Central Tax' },
      { charge_type: 'On Net Total', account_head: 'SGST - BZ', rate: 9, description: 'State Tax' },
    ] : [
      { charge_type: 'On Net Total', account_head: 'IGST - BZ', rate: 18, description: 'Integrated Tax' },
    ]

    const erpPayload = {
      doctype: 'Sales Invoice',
      custom_tenant_id: tenantId,
      custom_external_id: invoiceNumber,
      customer: customerName,
      customer_name: customerName,
      company: tenant?.company_name || 'BillZo Pvt Ltd',
      posting_date: now.toISOString().split('T')[0],
      posting_time: now.toTimeString().split(' ')[0].slice(0, 8),
      set_posting_time: 1,
      currency: 'INR',
      is_pos: paymentMode === 'cash' || paymentMode === 'upi' ? 1 : 0,
      place_of_supply: `${getGstStateCode(placeOfSupply)}-${placeOfSupply}`,
      gst_category: customerGstin ? 'B2B' : 'B2C',
      items: erpItems,
      taxes: erpTaxes,
      do_not_submit: false,
    }

    // Try to create in ERPNext
    const ERP_MODE = (process.env.ERP_MODE || 'live') as ERPMode
    let erpInvoiceId: string | null = null
    let syncError: string | null = null

    try {
      const creds = getErpCredentials()
      const result = await createFrappeSalesInvoice(creds, erpPayload as any)
      erpInvoiceId = result.invoiceId
    } catch (erpError: any) {
      console.error('[Invoice Create] ERP sync failed:', erpError.message)
      syncError = erpError.message
      
      if (ERP_MODE === 'live') {
        // In live mode, mark as PENDING for retry
        await query(
          'UPDATE invoices SET erp_sync_status = $1, erp_sync_error = $2 WHERE id = $3',
          ['PENDING', syncError, invoiceId]
        )
      }
    }

    // Update with ERP result
    if (erpInvoiceId) {
      await query(
        `UPDATE invoices SET 
          erp_invoice_id = $1, 
          erp_sync_status = 'SYNCED', 
          erp_synced_at = NOW() 
         WHERE id = $2`,
        [erpInvoiceId, invoiceId]
      )
    }

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoiceId,
        number: invoiceNumber,
        customerName,
        items: items.length,
        subtotal,
        total,
        syncStatus: erpInvoiceId ? 'SYNCED' : 'PENDING',
        erpInvoiceId,
        error: syncError,
      },
    })

  } catch (error: any) {
    console.error('[Invoice Create] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create invoice', details: error.message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let queryStr = 'SELECT * FROM invoices WHERE tenant_id = $1'
    const params: any[] = [session.tenantId]

    if (status && status !== 'all') {
      queryStr += ' AND erp_sync_status = $2'
      params.push(status)
    }

    queryStr += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
    params.push(limit, offset)

    const invoices = await query<any>(queryStr, params)

    return NextResponse.json({
      success: true,
      invoices: invoices.map(inv => ({
        id: inv.id,
        number: inv.invoice_number,
        customerName: inv.customer_name,
        total: parseFloat(inv.total),
        syncStatus: inv.erp_sync_status,
        erpInvoiceId: inv.erp_invoice_id,
        createdAt: inv.created_at,
      })),
    })

  } catch (error: any) {
    console.error('[Invoice List] Error:', error)
    return NextResponse.json(
      { error: 'Failed to list invoices' },
      { status: 500 }
    )
  }
}