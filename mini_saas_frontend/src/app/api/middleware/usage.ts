import { NextResponse } from 'next/server'

const USAGE_LIMITS = {
  free: { invoices: 50, whatsapp: 0, users: 1 },
  starter: { invoices: 300, whatsapp: 100, users: 3 },
  pro: { invoices: 2000, whatsapp: 500, users: 10 },
  unlimited: { invoices: Infinity, whatsapp: Infinity, users: Infinity },
}

interface UsageRecord {
  tenant_id: string
  event_type: string
  count: number
  timestamp: string
}

export async function checkUsageLimit(
  tenantId: string,
  eventType: 'invoice' | 'whatsapp' | 'api_call',
  plan: string
): Promise<{ allowed: boolean; remaining: number; used: number }> {
  const limits = USAGE_LIMITS[plan as keyof typeof USAGE_LIMITS] || USAGE_LIMITS.free
  
  let limit: number
  switch (eventType) {
    case 'invoice':
      limit = limits.invoices
      break
    case 'whatsapp':
      limit = limits.whatsapp
      break
    default:
      return { allowed: true, remaining: Infinity, used: 0 }
  }

  if (limit === Infinity) {
    return { allowed: true, remaining: Infinity, used: 0 }
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    
    const res = await fetch(`${process.env.ERP_URL || 'http://localhost'}/api/resource/Billed Usage Log?fields=["sum(count)"]&filters=[[" tenant_id", "=", "${tenantId}"], [" event_type", "=", "${eventType}_created"], [" creation", "like", "${today}%"]]`, {
      headers: { 
        'Authorization': `token ${process.env.ERP_API_KEY}:${process.env.ERP_API_SECRET}` 
      },
    })

    const data = await res.json()
    const used = data.message?.sum?.count || 0
    const remaining = limit - used

    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      used,
    }
  } catch (error) {
    console.error('[Usage] Check failed, allowing:', error)
    return { allowed: true, remaining: limit, used: 0 }
  }
}

export async function logUsage(
  tenantId: string,
  eventType: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    await fetch(`${process.env.ERP_URL || 'http://localhost'}/api/resource/Billed Usage Log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${process.env.ERP_API_KEY}:${process.env.ERP_API_SECRET}`,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        event_type: eventType,
        count: 1,
        metadata: JSON.stringify(metadata),
      }),
    })
  } catch (error) {
    console.error('[Usage] Log failed:', error)
  }
}

export async function middleware(req: Request) {
  const url = new URL(req.url)
  
  if (!url.pathname.startsWith('/api/merchant')) {
    return null
  }

  const tenantId = req.headers.get('x-tenant-id')
  const plan = req.headers.get('x-tenant-plan') || 'free'

  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Tenant ID required' },
      { status: 401 }
    )
  }

  let eventType: 'invoice' | 'whatsapp' | 'api_call' = 'api_call'
  
  if (url.pathname.includes('/invoice') && req.method === 'POST') {
    eventType = 'invoice'
  } else if (url.pathname.includes('/whatsapp')) {
    eventType = 'whatsapp'
  }

  if (eventType === 'api_call') {
    return null
  }

  const usage = await checkUsageLimit(tenantId, eventType, plan)

  if (!usage.allowed) {
    const planNames: Record<string, string> = {
      free: 'Free',
      starter: 'Starter', 
      pro: 'Pro',
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: `${planNames[plan] || 'Free'} plan limit reached`,
        upgrade_required: true,
        used: usage.used,
        limit: eventType === 'invoice' ? USAGE_LIMITS[plan as keyof typeof USAGE_LIMITS]?.invoices : USAGE_LIMITS[plan as keyof typeof USAGE_LIMITS]?.whatsapp,
      },
      { status: 403 }
    )
  }

  return null
}

export type { UsageRecord }