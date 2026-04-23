import { NextResponse } from 'next/server'

interface LineItem {
  id: string
  item_code: string
  item_name: string
  hsn_code?: string
  qty: number
  rate: number
  amount: number
  discount?: number
}

interface Customer {
  name: string
  customer_name: string
  phone: string
  gstin?: string
  address?: string
}

const ERP_URL = process.env.ERP_URL || 'http://localhost'
const ERP_API_KEY = process.env.ERP_API_KEY || 'administrator'
const ERP_API_SECRET = process.env.ERP_API_SECRET || 'admin'

async function getTodayInvoiceCount(tenantId?: string): Promise<number> {
  if (!tenantId) return 0
  try {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(`${ERP_URL}/api/resource/Sales Invoice?filters=[["creation", "like", "${today}%"]]&fields=["count(name)"]`, {
      headers: { 'Authorization': `token ${ERP_API_KEY}:${ERP_API_SECRET}` },
    })
    const data = await res.json()
    return data.message?.count || 0
  } catch {
    return 0
  }
}

async function createERPInvoice(customer: Customer, items: LineItem[], totals: any, paymentMode: string) {
  const invoiceData = {
    doctype: 'Sales Invoice',
    customer: customer.customer_name,
    customer_name: customer.customer_name,
    customer_phone: customer.phone,
    gstin: customer.gstin || '',
    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    set_posting_time: 1,
    is_pos: paymentMode === 'cash' ? 1 : 0,
    pos_profile: 'Standard POS',
    items: items.map(item => ({
      item_code: item.item_code,
      item_name: item.item_name,
      qty: item.qty,
      rate: item.rate,
      amount: item.amount,
      hsn_code: item.hsn_code || '',
      income_account: 'Sales - BT',
      cost_center: 'Main - BT',
      tax_rate: 18,
    })),
    payments: paymentMode === 'cash' ? [{
      mode: 'Cash',
      amount: totals.total,
      account: 'Cash - BT',
    }] : [],
    tax_category: '',
    shipping_address_name: customer.address || '',
    customer_address: customer.address || '',
  }

  try {
    const res = await fetch(`${ERP_URL}/api/resource/Sales Invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${ERP_API_KEY}:${ERP_API_SECRET}`,
      },
      body: JSON.stringify(invoiceData),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[ERP] Failed to create invoice:', err)
      return null
    }

    const data = await res.json()
    return data.data
  } catch (error) {
    console.error('[ERP] API Error:', error)
    return null
  }
}

async function sendWhatsAppMessage(phone: string, invoiceData: any) {
  const WHATSAPP_WEBHOOK = process.env.N8N_WEBHOOK_URL?.replace('setup-shop', 'send-invoice')

  if (!WHATSAPP_WEBHOOK) {
    console.log('[WhatsApp] No webhook configured, skipping')
    return false
  }

  try {
    const res = await fetch(WHATSAPP_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: phone.startsWith('+91') ? phone : `+91${phone}`,
        customer_name: invoiceData.customer,
        invoice_id: invoiceData.name,
        amount: invoiceData.grand_total,
        due_date: invoiceData.due_date,
      }),
    })

    return res.ok
  } catch (error) {
    console.error('[WhatsApp] Error:', error)
    return false
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { customer, items, totals, paymentMode = 'cash', enableReminder = true, tenantId, plan = 'free' } = body as { 
      customer: Customer
      items: LineItem[]
      totals: { subtotal: number; cgst: number; sgst: number; gst: number; total: number }
      paymentMode?: string
      enableReminder?: boolean
      tenantId?: string
      plan?: string
    }

    const USAGE_LIMITS: Record<string, number> = {
      free: 50,
      starter: 300,
      pro: 2000,
      unlimited: Infinity,
    }
    
    const limit = USAGE_LIMITS[plan] || 50
    if (limit !== Infinity) {
      const todayInvoices = await getTodayInvoiceCount(tenantId)
      if (todayInvoices >= limit) {
        return NextResponse.json({
          success: false,
          error: `${plan} plan limit (${limit} invoices/day) reached`,
          upgrade_required: true,
          used: todayInvoices,
          limit,
        }, { status: 403 })
      }
    }

    if (!customer?.phone) {
      return NextResponse.json({ 
        success: false, 
        error: 'Customer phone is required' 
      }, { status: 400 })
    }

    if (!items?.length) {
      return NextResponse.json({ 
        success: false, 
        error: 'At least one item required' 
      }, { status: 400 })
    }

    console.log(`[Merchant API] Creating invoice for ${customer.customer_name} (${customer.phone})`)
    console.log(`[Merchant API] Items: ${items.length}, Total: ₹${totals.total}`)

    const erpInvoice = await createERPInvoice(customer, items, totals, paymentMode)
    
    const invoiceId = erpInvoice?.name || `INV-${Date.now()}`
    const paymentLink = `https://rzp.io/i/billed-${invoiceId}`

    if (enableReminder) {
      await sendWhatsAppMessage(customer.phone, { ...erpInvoice, customer: customer.customer_name, grand_total: totals.total })
    }

    console.log(`[Merchant API] Invoice ${invoiceId} created successfully`)

    return NextResponse.json({ 
      success: true, 
      invoiceId,
      erpInvoiceId: erpInvoice?.name,
      paymentLink,
      message: 'Invoice created and WhatsApp link sent'
    })

  } catch (error) {
    console.error('[Merchant API] Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to create invoice' 
    }, { status: 500 })
  }
}