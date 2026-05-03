import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createSession, setSessionCookie } from '@/lib/session'
import { generateId } from '@/lib/db/encryption'
import { query, withTransaction } from '@/lib/db/client'
import { logger } from '@/lib/logger'
import { 
  withIdempotency, 
  generateIdempotencyKey,
  acquireLock,
  releaseLock,
  IDEMPOTENT_OPERATIONS
} from '@/lib/idempotency'
import { enqueueJob, QUEUES } from '@/lib/queue'
import { validateRequest, OnboardSchema, type OnboardingRequest } from '@/lib/schemas/api'

export const dynamic = 'force-dynamic'

const ERP_URL = process.env.ERP_URL || 'http://localhost'
const ERP_API_KEY = process.env.ERP_API_KEY || 'administrator'
const ERP_API_SECRET = process.env.ERP_API_SECRET || 'admin'

interface OnboardingResponse {
  success: boolean
  message: string
  tenantId?: string
  redirect?: string
}

function extractCorrelationId(request: NextRequest): string {
  return request.headers.get('x-correlation-id') || crypto.randomUUID()
}

function validateOnboardingRequest(data: Partial<OnboardingRequest>): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!data.shopName || data.shopName.length < 2) {
    errors.push('Shop name must be at least 2 characters')
  }
  
  if (!data.phone || !/^[6-9]\d{9}$/.test(data.phone)) {
    errors.push('Invalid phone number')
  }
  
  if (!data.email || !data.email.includes('@')) {
    errors.push('Valid email required')
  }
  
  if (!data.ownerName || data.ownerName.length < 2) {
    errors.push('Owner name required')
  }
  
  return { valid: errors.length === 0, errors }
}

async function seedCustomerInErp(tenantId: string, shopName: string): Promise<{ success: boolean; erpName?: string; error?: string }> {
  try {
    const res = await fetch(`${ERP_URL}/api/resource/Customer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${ERP_API_KEY}:${ERP_API_SECRET}`,
      },
      body: JSON.stringify({
        customer_name: 'Walk-in Customer',
        customer_group: 'Individual',
        customer_type: 'Individual',
        territory: 'India',
        address_title: 'Walk-in Customer',
        address_type: 'Billing',
        address_line1: 'India',
        phone: '+919999999999',
        email: 'walkin@demo.in',
        custom_tenant_id: tenantId,
      }),
    })
    
    if (!res.ok) {
      const errorText = await res.text()
      return { success: false, error: `ERP customer creation failed: ${res.status}` }
    }
    
    const data = await res.json()
    return { success: true, erpName: data.data?.name }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `ERP unreachable: ${message}` }
  }
}

async function seedProductInErp(tenantId: string): Promise<{ success: boolean; erpName?: string; error?: string }> {
  try {
    const res = await fetch(`${ERP_URL}/api/resource/Item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${ERP_API_KEY}:${ERP_API_SECRET}`,
      },
      body: JSON.stringify({
        item_code: 'DEMO-001',
        item_name: 'Sample Product',
        item_group: 'Products',
        stock_uom: 'Nos',
        default_warehouse: 'Stores - BT',
        valuation_rate: 50,
        standard_rate: 100,
        hsn_code: '8539',
        custom_tenant_id: tenantId,
      }),
    })
    
    if (!res.ok) {
      return { success: false, error: `ERP product creation failed: ${res.status}` }
    }
    
    const data = await res.json()
    return { success: true, erpName: data.data?.name }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `ERP unreachable: ${message}` }
  }
}

async function createActivationLog(tenantId: string, shopName: string, plan: string): Promise<boolean> {
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
    
    return res.ok
  } catch (error) {
    logger.error({ 
      tenantId, 
      shopName, 
      plan, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 'onboard/activation_log')
    return false
  }
}

async function checkExistingTenant(phone: string, email: string): Promise<string | null> {
  const existing = await query<{ id: string }>(
    'SELECT id FROM tenants WHERE phone = $1 OR email = $2 LIMIT 1',
    [phone, email]
  )
  return existing[0]?.id || null
}

async function handleOnboarding(values: OnboardingRequest, correlationId: string): Promise<OnboardingResponse> {
  const { shopName, phone, ownerName, email, plan = 'free' } = values
  
  const phoneNum = phone || ''
  const emailStr = email || ''
  
  logger.info({ 
    shopName, 
    phone: phoneNum.slice(-4), 
    email: emailStr.split('@')[0], 
    plan,
    correlationId 
  }, 'onboarding_started')

  // Check for existing tenant - critical for deduplication
  const existingTenantId = await checkExistingTenant(phoneNum, emailStr)
  if (existingTenantId) {
    logger.warn({ existingTenantId, correlationId }, 'duplicate_onboarding_attempt')
    
    // Return existing session instead of creating new
    const session = await createSession({
      tenantId: existingTenantId,
      userId: generateId('user'),
      role: 'owner',
      companyName: shopName || 'New Business',
      plan,
    })
    
    return { 
      success: true, 
      message: 'Existing account recovered',
      tenantId: existingTenantId,
      redirect: '/merchant'
    }
  }

  // Generate tenant ID upfront
  const tenantId = `tenant_${generateId('')}`
  
  // Execute onboarding within database transaction
  const result = await withTransaction(async (tx) => {
    // Double-check tenant doesn't exist (race condition protection)
    const check = await tx.query(
      'SELECT id FROM tenants WHERE phone = $1 OR email = $2 FOR UPDATE',
      [phone, email]
    ) as { rows: { id: string }[] }
    
    if (check.rows.length > 0) {
      throw new Error('TENANT_EXISTS_CONCURRENT')
    }
    
    // Create tenant record
    await tx.query(
      `INSERT INTO tenants (id, company_name, phone, email, plan, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
      [tenantId, shopName, phone, email, plan]
    )
    
    // Create initial user
    const userId = generateId('user')
    await tx.query(
      `INSERT INTO users (id, tenant_id, name, role, created_at)
       VALUES ($1, $2, $3, 'owner', NOW())`,
      [userId, tenantId, ownerName]
    )
    
    return { tenantId, userId }
  }) as { tenantId: string; userId: string }

  // Attempt ERP seeding - but don't block onboarding success
  // Queue background job for ERP sync
  try {
    enqueueJob(QUEUES.erpSync, {
      type: 'seed_tenant',
      tenantId: result.tenantId,
      shopName,
      correlationId,
    })
    logger.info({ tenantId: result.tenantId, correlationId }, 'erp_seed_queued')
  } catch (queueError) {
    logger.warn({ error: queueError }, 'queue_enqueue_failed')
  }

  // Create session
  const session = await createSession({
    tenantId: result.tenantId,
    userId: result.userId,
    role: 'owner',
    companyName: shopName || 'New Business',
    plan: plan as string,
  })

  logger.info({ 
    tenantId: result.tenantId, 
    userId: result.userId,
    duration: Date.now(),
    correlationId 
  }, 'onboarding_completed')

  return {
    success: true,
    message: 'Account ready.',
    tenantId: result.tenantId,
    redirect: '/merchant'
  }
}

export async function POST(request: NextRequest) {
  const correlationId = extractCorrelationId(request)
  const startTime = Date.now()
  
  try {
    // Parse and validate request
    const data = await request.json()
    
    // Validate with Zod
    const validation = validateRequest(OnboardSchema, data) as any
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      )
    }
    
    const dto = validation.data
    const shopName = dto.shopName || ''
    const phone = dto.phone || ''
    const ownerName = dto.ownerName || ''
    const email = dto.email || ''
    const plan = dto.plan || 'free'
    const idempotencyKey = dto.idempotencyKey
    
    // Generate idempotency key
    const key = idempotencyKey || generateIdempotencyKey({ phone, email, shopName })
    const finalPlan = plan || 'free'
    const finalEmail = email || ''
    const finalOwnerName = ownerName || ''
    
    logger.info({ 
      idempotencyKey: key, 
      correlationId,
      phone: phone.slice(-4)
    }, 'onboarding_request')
    
    // Acquire lock to prevent concurrent onboarding for same identity
    const lock = await acquireLock('onboard', key)
    if (!lock.acquired) {
      logger.warn({ key, correlationId }, 'onboarding_lock_conflict')
      return NextResponse.json(
        { success: false, error: 'Onboarding in progress. Please wait...' },
        { status: 409 }
      )
    }
    
    try {
      // Execute with idempotency
      const result = await withIdempotency<OnboardingResponse>(
        key,
        IDEMPOTENT_OPERATIONS.onboard,
        () => handleOnboarding({ shopName, phone, ownerName: finalOwnerName, email: finalEmail, plan: finalPlan }, correlationId),
        () => ({ 
          success: false, 
          message: 'Request already processing',
          redirect: '/start'
        })
      )
      
      // Set session cookie if successful
      if (result.success && result.tenantId) {
        const session = await createSession({
          tenantId: result.tenantId,
          userId: generateId('user'),
          role: 'owner',
          companyName: shopName || 'New Business',
          plan: plan || 'free',
        })
        
        const response = NextResponse.json(result)
        await setSessionCookie(response, session)
        
        logger.info({ 
          duration: Date.now() - startTime,
          correlationId 
        }, 'onboarding_response')
        
        return response
      }
      
      return NextResponse.json(result, { status: result.success ? 200 : 400 })
      
    } finally {
      await releaseLock(lock.lockKey)
    }
    
  } catch (error) {
    const duration = Date.now() - startTime
    const message = error instanceof Error ? error.message : 'Unknown error'
    
    logger.error({ 
      correlationId, 
      duration,
      error: message,
      stack: error instanceof Error ? error.stack : undefined
    }, 'onboarding_failed')
    
    // Check for known error types
    if (message === 'TENANT_EXISTS_CONCURRENT') {
      return NextResponse.json(
        { success: false, error: 'Account already exists. Please try login.' },
        { status: 409 }
      )
    }
    
    // Don't expose internal errors to client
    return NextResponse.json(
      { success: false, error: 'Failed to create account. Please try again.' },
      { status: 500 }
    )
  }
}