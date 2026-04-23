import { NextResponse } from 'next/server'

const ERP_URL = process.env.ERP_URL || 'http://localhost'
const ERP_API_KEY = process.env.ERP_API_KEY || 'administrator'
const ERP_API_SECRET = process.env.ERP_API_SECRET || 'admin'

const SEED_CUSTOMER = {
  customer_name: 'Walk-in Customer',
  customer_group: 'Individual',
  customer_type: 'Individual',
  territory: 'India',
  address_title: 'Walk-in Customer',
  address_type: 'Billing',
  address_line1: 'India',
  phone: '+919999999999',
  email: 'walkin@demo.in',
}

const SEED_PRODUCT = {
  item_code: 'DEMO-001',
  item_name: 'Sample Product',
  item_group: 'Products',
  stock_uom: 'Nos',
  default_warehouse: 'Stores - BT',
  valuation_rate: 50,
  standard_rate: 100,
  hsn_code: '8539',
  tax_rate: 18,
}

const GST_PRESETS = [
  { name: 'GST 0%', rate: 0, type: 'Zero Rated' },
  { name: 'GST 5%', rate: 5, type: 'Reduced Rate' },
  { name: 'GST 12%', rate: 12, type: 'Reduced Rate' },
  { name: 'GST 18%', rate: 18, type: 'Standard Rate' },
  { name: 'GST 28%', rate: 28, type: 'Special Rate' },
]

async function seedCustomer(tenantId: string, shopName: string) {
  try {
    const res = await fetch(`${ERP_URL}/api/resource/Customer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${ERP_API_KEY}:${ERP_API_SECRET}`,
      },
      body: JSON.stringify({
        ...SEED_CUSTOMER,
        name: `${shopName} - Walk-in`,
        customer_name: 'Walk-in Customer',
        custom_tenant_id: tenantId,
      }),
    })
    const data = await res.json()
    console.log(`[Seed] Customer created: ${data.data?.name}`)
    return data.data?.name
  } catch (error) {
    console.error('[Seed] Customer failed:', error)
    return null
  }
}

async function seedProduct(tenantId: string) {
  try {
    const res = await fetch(`${ERP_URL}/api/resource/Item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${ERP_API_KEY}:${ERP_API_SECRET}`,
      },
      body: JSON.stringify({
        ...SEED_PRODUCT,
        custom_tenant_id: tenantId,
      }),
    })
    const data = await res.json()
    console.log(`[Seed] Product created: ${data.data?.name}`)
    return data.data?.name
  } catch (error) {
    console.error('[Seed] Product failed:', error)
    return null
  }
}

async function createActivationLog(tenantId: string, shopName: string, plan: string) {
  try {
    const res = await fetch(`${ERP_URL}/api/resource/Billed Activation Log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${ERP_API_KEY}:${ERP_API_SECRET}`,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        shop_name: shopName,
        plan: plan,
        signup_time: new Date().toISOString(),
        first_invoice_time: null,
        first_whatsapp_time: null,
        invoice_count_day1: 0,
        checklist: JSON.stringify({
          shopName: false,
          firstInvoice: false,
          firstWhatsApp: false,
        }),
      }),
    })
    const data = await res.json()
    console.log(`[Activation] Log created: ${data.data?.name}`)
    return data.data?.name
  } catch (error) {
    console.error('[Activation] Log failed:', error)
    return null
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const { shopName, plan = 'free', tenantId } = data
    
    const actualTenantId = tenantId || `tenant_${Date.now()}`
    console.log(`[Onboard] Processing: ${shopName} (${actualTenantId})`)

    await seedCustomer(actualTenantId, shopName)
    await seedProduct(actualTenantId)
    await createActivationLog(actualTenantId, shopName, plan)

    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL
    if (n8nWebhookUrl) {
      try {
        await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, tenantId: actualTenantId }),
        })
      } catch (e) {
        console.warn('[Onboard] n8n webhook offline')
      }
    }
    
    return NextResponse.json({
      success: true,
      tenantId: actualTenantId,
      message: 'Account ready. Walk-in customer and sample product added.',
      seedData: {
        customer: 'Walk-in Customer',
        product: 'Sample Product - ₹100',
      },
    })
  } catch (error) {
    console.error('[Onboard] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process onboarding' },
      { status: 500 }
    )
  }
}