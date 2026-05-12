import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/billzo/db'
import { getLimits, checkLimit, isPaywallBlocked, type PlanType } from '@/lib/billzo/plan-limits'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get('x-tenant-id')
    const userId = request.headers.get('x-user-id')

    if (!tenantId && !userId) {
      return NextResponse.json(
        { error: 'Tenant or user identification required' },
        { status: 400 }
      )
    }

    let tenant
    if (tenantId) {
      tenant = await db().tenants.get(tenantId)
    } else if (userId) {
      tenant = await db().tenants.where('ownerUserId').equals(userId).first()
    }

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    const plan = (tenant.plan || 'starter') as PlanType
    const limits = getLimits(plan)
    const invoiceCount = tenant.invoiceCount || 0
    const reminderCount = tenant.reminderCount || 0

    const invoiceStatus = checkLimit(invoiceCount, limits.invoices)
    const reminderStatus = checkLimit(reminderCount, limits.reminders)

    return NextResponse.json({
      tenantId: tenant.id,
      plan,
      usage: {
        invoices: {
          current: invoiceCount,
          limit: limits.invoices,
          remaining: invoiceStatus.remaining,
          allowed: invoiceStatus.allowed,
        },
        reminders: {
          current: reminderCount,
          limit: limits.reminders,
          remaining: reminderStatus.remaining,
          allowed: reminderStatus.allowed,
        },
      },
      features: {
        autoRecovery: limits.autoRecovery,
        multiUser: limits.multiUser || false,
        analytics: limits.analytics || false,
      },
      paywall: isPaywallBlocked(invoiceCount, reminderCount, plan),
    })
  } catch (error) {
    console.error('Usage check error:', error)
    return NextResponse.json(
      { error: 'Failed to check usage' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenantId, action } = body

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID required' },
        { status: 400 }
      )
    }

    if (!['invoice', 'reminder'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "invoice" or "reminder"' },
        { status: 400 }
      )
    }

    const tenant = await db().tenants.get(tenantId)
    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    const plan = (tenant.plan || 'starter') as PlanType
    const limits = getLimits(plan)

    if (action === 'invoice') {
      const invoiceStatus = checkLimit(tenant.invoiceCount || 0, limits.invoices)
      if (!invoiceStatus.allowed) {
        return NextResponse.json(
          { allowed: false, reason: 'invoice_limit_reached', type: 'invoice' },
          { status: 403 }
        )
      }

      await db().tenants.update(tenantId, {
        invoiceCount: (tenant.invoiceCount || 0) + 1,
        updatedAt: new Date().toISOString(),
      })
    }

    if (action === 'reminder') {
      const reminderStatus = checkLimit(tenant.reminderCount || 0, limits.reminders)
      if (!reminderStatus.allowed) {
        return NextResponse.json(
          { allowed: false, reason: 'reminder_limit_reached', type: 'reminder' },
          { status: 403 }
        )
      }

      await db().tenants.update(tenantId, {
        reminderCount: (tenant.reminderCount || 0) + 1,
        updatedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({ allowed: true })
  } catch (error) {
    console.error('Usage increment error:', error)
    return NextResponse.json(
      { error: 'Failed to update usage' },
      { status: 500 }
    )
  }
}
