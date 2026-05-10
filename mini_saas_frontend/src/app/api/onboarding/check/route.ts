import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/billzo/db'
import { getLimits, type PlanType } from '@/lib/billzo/plan-limits'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const userId = request.headers.get('x-user-id')

    if (!userId) {
      return NextResponse.json(
        { state: 'UNAUTHORIZED', error: 'User not authenticated' },
        { status: 401 }
      )
    }

    const tenant = await db().tenants
      .where('ownerUserId')
      .equals(userId)
      .first()

    if (!tenant) {
      return NextResponse.json({
        state: 'NO_TENANT',
        usage: { invoices: 0, reminders: 0 },
        limits: getLimits('starter'),
        paywall: { blocked: false, upgradeNeeded: false },
      })
    }

    const plan = (tenant.plan || 'starter') as PlanType
    const limits = getLimits(plan)
    const invoiceCount = tenant.invoiceCount || 0
    const reminderCount = tenant.reminderCount || 0

    const invoiceBlocked = invoiceCount >= limits.invoices && limits.invoices !== Infinity
    const reminderBlocked = reminderCount >= limits.reminders && limits.reminders !== Infinity

    const hasUsedProduct = invoiceCount > 0 || reminderCount > 0

    return NextResponse.json({
      state: hasUsedProduct && plan === 'starter' ? 'TENANT_NO_PLAN' : 'ACTIVE',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan,
        phone: tenant.phone || '',
      },
      usage: {
        invoices: invoiceCount,
        reminders: reminderCount,
      },
      limits: {
        invoices: limits.invoices === Infinity ? 'unlimited' : limits.invoices,
        reminders: limits.reminders === Infinity ? 'unlimited' : limits.reminders,
        autoRecovery: limits.autoRecovery,
      },
      paywall: {
        blocked: invoiceBlocked || reminderBlocked,
        type: invoiceBlocked ? 'invoice' : reminderBlocked ? 'reminder' : undefined,
        upgradeNeeded: invoiceBlocked || reminderBlocked,
      },
    })
  } catch (error) {
    console.error('Onboarding check error:', error)
    return NextResponse.json(
      { error: 'Failed to check onboarding status' },
      { status: 500 }
    )
  }
}
