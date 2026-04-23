import { NextResponse } from 'next/server'
import crypto from 'crypto'

const INTERNAL_SECRET = process.env.INTERNAL_SIGNATURE_SECRET || 'change-this-in-production'
const ERP_URL = process.env.ERP_URL || 'http://localhost'
const ERP_API_KEY = process.env.ERP_API_KEY || 'administrator'
const ERP_API_SECRET = process.env.ERP_API_SECRET || 'admin'

function verifyInternalSignature(req: Request): boolean {
  const signature = req.headers.get('x-internal-signature')
  if (!signature) return false

  try {
    const body = JSON.stringify({ timestamp: Date.now() })
    const expected = crypto
      .createHmac('sha256', INTERNAL_SECRET)
      .update(body)
      .digest('hex')
    
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

async function updateProvisioningStatus(tenantId: string, status: string, error?: string) {
  console.log(`[Provision] ${tenantId}: ${status}${error ? ` - ${error}` : ''}`)
}

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
    console.log(`[Seed] Customer: ${data.data?.name}`)
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
    console.log(`[Seed] Product: ${data.data?.name}`)
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
        activation_seconds: null,
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
    console.log(`[Activation] Log: ${data.data?.name}`)
    return data.data?.name
  } catch (error) {
    console.error('[Activation] Log failed:', error)
    return null
  }
}

export async function POST(request: Request) {
  const startTime = Date.now()
  
  try {
    const data = await request.json()
    const { shopName, plan = 'free', tenantId } = data
    
    const actualTenantId = tenantId || `tenant_${Date.now()}`
    console.log(`[Onboard] Starting: ${shopName} (${actualTenantId})`)

    await updateProvisioningStatus(actualTenantId, 'pending')

    const customerResult = await seedCustomer(actualTenantId, shopName)
    await updateProvisioningStatus(actualTenantId, 'seeding_customer')

    const productResult = await seedProduct(actualTenantId)
    await updateProvisioningStatus(actualTenantId, 'seeding_product')

    const activationResult = await createActivationLog(actualTenantId, shopName, plan)
    await updateProvisioningStatus(actualTenantId, 'ready')

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
    
    const activationMs = Date.now() - startTime
    console.log(`[Onboard] Completed in ${activationMs}ms`)
    
    return NextResponse.json({
      success: true,
      tenantId: actualTenantId,
      activationMs,
      message: 'Account ready.',
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