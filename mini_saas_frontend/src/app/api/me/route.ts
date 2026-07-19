export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { getEntitlement } from '@/lib/billzo/feature-flags'
import { PLAN_LIMITS } from '@/lib/billzo/plan-limits'
import { checkQuota } from '@/lib/billzo/feature-flags'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

/**
 * Returns the authenticated tenant's current plan, subscription state, limits,
 * and live quota usage. The single place the frontend reads entitlement.
 */
export async function GET(request: Request) {
  const auth = await verifyRequest(request as any)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ent = await getEntitlement(tenantId)
  if (!ent) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const limits = PLAN_LIMITS[ent.planCode]
  const [reminders, api, tenantRow] = await Promise.all([
    checkQuota(tenantId, 'reminders_sent', limits.reminders),
    checkQuota(tenantId, 'api_calls', limits.api ? -1 : 0),
    supabaseAdmin.from('tenants').select('business_name').eq('id', tenantId).maybeSingle(),
  ])

  return NextResponse.json({
    tenantId,
    businessName: tenantRow?.data?.business_name ?? null,
    plan: ent.planCode,
    planVersion: ent.planVersion,
    subscriptionState: ent.subscriptionState,
    isPaid: ent.isPaid,
    features: ent.features,
    limits,
    usage: {
      reminders,
      api,
    },
  })
}
