import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/billzo/db'
import { getTokenFromRequest, verifyAccessToken } from '@/lib/billzo/auth-jwt'
import { getPlan, type PlanType } from '@/lib/billzo/plan-limits'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request)
    const authPayload = token ? verifyAccessToken(token) : null
    const userId = authPayload?.userId

    if (!userId) {
      return NextResponse.json(
        { state: 'UNAUTHORIZED', error: 'User not authenticated' },
        { status: 401 },
      )
    }

    const tenant = await db().tenants
      .where('ownerUserId')
      .equals(userId)
      .first()

    if (!tenant) {
      return NextResponse.json({
        state: 'NO_TENANT',
        plan: 'starter',
      })
    }

    const plan = getPlan(tenant.plan)
    const invoiceCount = tenant.invoiceCount || 0
    const reminderCount = tenant.reminderCount || 0

    const hasUsedProduct = invoiceCount > 0 || reminderCount > 0

    return NextResponse.json({
      state: hasUsedProduct && plan === 'starter' ? 'TENANT_NO_PLAN' : 'ACTIVE',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan,
        phone: tenant.phone || '',
      },
      plan,
    })
  } catch (error) {
    console.error('Onboarding check error:', error)
    return NextResponse.json(
      { state: 'NO_TENANT', plan: 'starter', error: 'Server error' },
      { status: 200 },
    )
  }
}
