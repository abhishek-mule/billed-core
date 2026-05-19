import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/billzo/db'
import { isPaywallBlocked } from '@/lib/billzo/plan-limits'

export const dynamic = 'force-dynamic'

function getTenantId(): string | null {
  return cookies().get('bz_tenant')?.value || null
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenant = await db().tenants.get(tenantId)
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const plan = tenant.plan || 'starter'
    const { blocked, type } = isPaywallBlocked(tenant.invoiceCount || 0, tenant.reminderCount || 0, plan)

    return NextResponse.json({
      allowed: !blocked,
      plan,
      usage: {
        invoicesCreated: tenant.invoiceCount || 0,
        remindersSent: tenant.reminderCount || 0,
      },
      limits: {
        maxInvoices: plan === 'starter' ? 3 : Infinity,
        maxReminders: plan === 'starter' ? 3 : Infinity,
        autoRecovery: plan !== 'starter',
      },
      showPaywallAt: {
        invoicesCreated: 3,
        remindersSent: 3,
      },
      showUpsellBanner: (tenant.invoiceCount || 0) >= 2 || (tenant.reminderCount || 0) >= 2,
      upsellMessage: blocked
        ? `You've reached your ${type} limit. Upgrade to Pro for unlimited access.`
        : `You've recovered using BillZo. Unlock unlimited recovery.`,
    })
  } catch (err: any) {
    console.error('[PaywallEnforce] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = getTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { action }: { action: 'invoice' | 'reminder' } = body

    if (!action || !['invoice', 'reminder'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const tenant = await db().tenants.get(tenantId)
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const plan = tenant.plan || 'starter'
    const invoiceCount = tenant.invoiceCount || 0
    const reminderCount = tenant.reminderCount || 0

    const { blocked, type } = isPaywallBlocked(
      action === 'invoice' ? invoiceCount + 1 : invoiceCount,
      action === 'reminder' ? reminderCount + 1 : reminderCount,
      plan
    )

    if (blocked) {
      return NextResponse.json({
        allowed: false,
        reason: `You've reached your ${type} limit on the ${plan} plan. Upgrade to Pro for unlimited access.`,
        plan,
        usage: {
          invoicesCreated: invoiceCount,
          remindersSent: reminderCount,
        },
      }, { status: 403 })
    }

    const updates: Record<string, number> = {}
    if (action === 'invoice') updates.invoiceCount = invoiceCount + 1
    if (action === 'reminder') updates.reminderCount = reminderCount + 1

    await db().tenants.update(tenantId, updates)

    return NextResponse.json({
      allowed: true,
      plan,
      usage: {
        invoicesCreated: updates.invoiceCount ?? invoiceCount,
        remindersSent: updates.reminderCount ?? reminderCount,
      },
    })
  } catch (err: any) {
    console.error('[PaywallEnforce] POST Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}