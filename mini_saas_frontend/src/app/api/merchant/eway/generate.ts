import { NextRequest, NextResponse } from 'next/server'
import { withSessionAuth, SessionData } from '@/lib/session'
import { query } from '@/lib/db/client'

interface EwayBillData {
  bill_no: string
  bill_date: string
  bill_value: number
  supplier_gstin: string
  supplier_state_code: string
  customer_gstin?: string
  customer_state_code: string
  product_hsn: string
  product_quantity: number
  product_unit: string
  product_description: string
  transaction_type: 'B2B' | 'B2C' | 'B2CL'
  invoice_value: number
  line_items: Array<{ hsn: string; description: string; quantity: number; unit: string; amount: number }>
}

// GST state code mapping
const STATE_CODES: Record<string, string> = {
  'AN': '35', 'AP': '28', 'AR': '12', 'AS': '18', 'BR': '10', 'CG': '22', 'CH': '04', 'CT': '26',
  'DD': '37', 'DN': '38', 'DL': '07', 'GA': '30', 'GJ': '24', 'HR': '06', 'HP': '02', 'JK': '01',
  'JH': '20', 'KA': '29', 'KL': '32', 'LD': '31', 'MP': '23', 'MH': '27', 'MN': '14', 'ML': '17',
  'MZ': '15', 'NL': '13', 'OR': '21', 'OL': '21', 'PB': '03', 'PY': '34', 'RJ': '08', 'SK': '11',
  'TG': '36', 'TN': '33', 'TR': '16', 'UP': '09', 'UT': '05', 'WB': '19'
}

function extractStateCode(gstin?: string): string {
  if (!gstin || gstin.length < 2) return '07' // Default to DL
  const stateCode = gstin.substring(0, 2).toUpperCase()
  return STATE_CODES[stateCode] || '07'
}

async function generateEwayBill(tenantId: string, invoiceId: string) {
  // Get invoice details
  const invoice = await query<Record<string, any>>(
    `SELECT 
       id, invoice_number, created_at, customer_name, customer_gstin, place_of_supply,
       subtotal, cgst, sgst, igst, grand_total, line_items_json
     FROM invoices
     WHERE id = $1 AND tenant_id = $2`,
    [invoiceId, tenantId]
  )

  if (!invoice.length) {
    throw new Error('Invoice not found')
  }

  const inv = invoice[0]
  
  // Get tenant (supplier) details
  const tenant = await query<Record<string, any>>(
    `SELECT company_name FROM tenants WHERE id = $1`,
    [tenantId]
  )

  if (!tenant.length) {
    throw new Error('Tenant not found')
  }

  // Parse line items
  let lineItems = []
  try {
    const itemsJson = typeof inv.line_items_json === 'string' 
      ? JSON.parse(inv.line_items_json) 
      : inv.line_items_json || []
    lineItems = Array.isArray(itemsJson) ? itemsJson : Object.values(itemsJson)
  } catch (e) {
    console.warn('Could not parse line items:', e)
    lineItems = []
  }

  // Find first HSN code from items
  const firstHsn = lineItems[0]?.hsn_code || 'NA'

  const ewayData: EwayBillData = {
    bill_no: inv.invoice_number,
    bill_date: new Date(inv.created_at).toISOString().split('T')[0],
    bill_value: Number(inv.grand_total),
    supplier_gstin: '', // Would be added from tenant GST settings
    supplier_state_code: '07', // Default DL, should be from tenant settings
    customer_gstin: inv.customer_gstin,
    customer_state_code: extractStateCode(inv.customer_gstin),
    product_hsn: firstHsn,
    product_quantity: lineItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
    product_unit: lineItems[0]?.unit || 'PCS',
    product_description: lineItems.map((item: any) => item.item_name).join(', '),
    transaction_type: inv.customer_gstin ? 'B2B' : 'B2C',
    invoice_value: Number(inv.grand_total),
    line_items: lineItems.map((item: any) => ({
      hsn: item.hsn_code || 'NA',
      description: item.item_name,
      quantity: Number(item.quantity),
      unit: item.unit || 'PCS',
      amount: Number(item.amount),
    })),
  }

  return ewayData
}

export async function POST(req: NextRequest) {
  return withSessionAuth(async (session: SessionData) => {
    try {
      const body = await req.json()
      const { invoice_id } = body

      if (!invoice_id) {
        return NextResponse.json(
          { error: 'Missing invoice_id' },
          { status: 400 }
        )
      }

      const ewayData = await generateEwayBill(session.tenantId, invoice_id)

      // Record E-way bill generation attempt
      const ewayId = `EWAY-${Date.now()}`
      try {
        await query(
          `INSERT INTO eway_bills (tenant_id, invoice_id, eway_json, status)
           VALUES ($1, $2, $3, 'GENERATED')
           ON CONFLICT (tenant_id, invoice_id) DO UPDATE SET eway_json = $3, status = 'GENERATED', updated_at = NOW()`,
          [
            session.tenantId,
            invoice_id,
            JSON.stringify(ewayData),
          ]
        )
      } catch (dbError) {
        // Table might not exist yet
        console.warn('Could not save E-way bill record:', dbError)
      }

      return NextResponse.json({
        success: true,
        eway_bill: ewayData,
        eway_id: ewayId,
        message: 'E-way bill generated. Submit to GST portal at: https://ewaybill.nic.in',
      })
    } catch (error) {
      console.error('[E-way Bill] Error:', error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Generation failed' },
        { status: 500 }
      )
    }
  }, req)
}
