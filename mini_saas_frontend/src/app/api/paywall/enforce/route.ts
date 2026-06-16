import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getPlan } from '@/lib/billzo/plan-limits'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('plan, created_at')
      .eq('id', tenantId)
      .single()

    if (tenantErr || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const plan = getPlan(tenant.plan)

    // Lightweight overdue aggregate — no eligible-customer scan
    const { data: invoiceAgg } = await supabaseAdmin
      .from('invoices')
      .select('outstanding_amount')
      .eq('tenant_id', tenantId)
      .gt('outstanding_amount', 0)

    const overdueAmount = (invoiceAgg || []).reduce(
      (sum: number, r: any) => sum + (parseFloat(r.outstanding_amount) || 0),
      0,
    )
    const overdueCount = (invoiceAgg || []).length

    // Trial availability — quick existence check only
    let trialAvailable = false
    if (plan === 'starter') {
      const daysSinceSignup = Math.floor(
        (Date.now() - new Date(tenant.created_at).getTime()) / (1000 * 60 * 60 * 24),
      )
      if (daysSinceSignup <= 14) {
        const { data: existing } = await supabaseAdmin
          .from('feature_trials')
          .select('status')
          .eq('tenant_id', tenantId)
          .eq('feature', 'free_recovery_trial')
          .single()

        trialAvailable = !existing || existing.status !== 'completed'
      }
    }

    return NextResponse.json({
      plan,
      overdue: { totalAmount: overdueAmount, count: overdueCount },
      trial: { available: trialAvailable },
      features: [
        { id: 'auto_recovery', available: plan !== 'starter', upgradeTo: 'pro' },
        { id: 'recovery_queue', available: plan !== 'starter', upgradeTo: 'pro' },
        { id: 'promise_tracking', available: plan !== 'starter', upgradeTo: 'pro' },
        { id: 'cashflow_forecast', available: plan !== 'starter', upgradeTo: 'pro' },
      ],
    })
  } catch (err: any) {
    console.error('[PaywallEnforce] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
