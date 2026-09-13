export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  verifyRequest,
  errorResponse,
  logApiAccess,
} from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getRecoveryCreditBalancesForTenant, getRecoveryCreditCurrentPeriodEnd } from '@/lib/billzo/recovery-credits'
import { recoveryCreditsAvailable, RECOVERY_CREDITS_DEFERRED_REASON } from '@billzo/shared'
import { RECOVERY_CREDIT_PACKETS } from '@billzo/shared'

/**
 * Recovery-credit summary for the authenticated tenant: per-pool balances,
 * spendable total, deferred-action count, and the purchasable packet catalog.
 * This is a READ PATH ONLY — the UI is never authoritative about credits.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!

    logApiAccess(request, tenantId, auth.userId!, 'recovery_credits.get_balances')

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('recovery_credits_enabled')
      .eq('id', tenantId)
      .maybeSingle()

    const enabled = tenant?.recovery_credits_enabled === true

    const [{ data: deferred }] = await Promise.all([
      supabaseAdmin
        .from('collection_actions')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'deferred')
        .limit(1000),
    ])

    const balances = await getRecoveryCreditBalancesForTenant(tenantId)
    const currentPeriodEnd = await getRecoveryCreditCurrentPeriodEnd(tenantId)

    return NextResponse.json({
      enabled,
      balances: {
        included: balances.included,
        purchased: balances.purchased,
        available: recoveryCreditsAvailable(balances),
      },
      currentPeriodEnd,
      deferredCount: (deferred || []).length,
      deferredReason: RECOVERY_CREDITS_DEFERRED_REASON,
      packets: RECOVERY_CREDIT_PACKETS.map((p) => ({
        code: p.code,
        credits: p.credits,
        pricePaise: p.pricePaise,
        // Paise → rupees for display only; the charge is always server-computed.
        priceRupees: p.pricePaise / 100,
      })),
    })
  } catch (error: any) {
    console.error('[RecoveryCredits] GET error:', error)
    return errorResponse('Failed to load recovery credits', 500)
  }
}