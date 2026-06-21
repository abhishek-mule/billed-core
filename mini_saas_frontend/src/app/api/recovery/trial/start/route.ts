import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getPlan } from '@/lib/billzo/plan-limits'
import { TRIAL_LIMITS } from '@/lib/billzo/trial-limits'
import { requireFeature } from '@/lib/auth/feature-gate'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!

    // Read-only — only reject if completed/already used, not for plan
    const gate = await requireFeature(tenantId, 'free_recovery_trial', 'GET')
    if (!gate.allowed && gate.error !== 'FEATURE_LOCKED') {
      return NextResponse.json({ error: gate.error }, { status: 403 })
    }

    // The tenant is on a paid plan — no trial needed
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('plan, upi_id, gstin')
      .eq('id', tenantId)
      .single()

    if (tenant && getPlan(tenant.plan) !== 'starter') {
      return NextResponse.json({
        eligibleCount: 0,
        totalOverdue: 0,
        message: 'Auto recovery is already active on your plan.',
      })
    }

    // Business verification gate: require UPI or GSTIN before recovery trial
    const hasBusinessProof = tenant?.upi_id || tenant?.gstin
    if (!hasBusinessProof) {
      return NextResponse.json({
        error: 'Please add your UPI ID or GSTIN in Settings to start recovery.',
        eligibleCount: 0,
        totalOverdue: 0,
      }, { status: 400 })
    }

    // Eligible-customer query — expensive, runs only when user explicitly clicks
    const { data: eligible } = await supabaseAdmin
      .from('invoices')
      .select(`
        id,
        customer_id,
        customers!inner(customer_name, phone),
        total,
        outstanding_amount,
        due_at,
        created_at
      `)
      .eq('tenant_id', tenantId)
      .gt('outstanding_amount', 0)
      .order('due_at', { ascending: true })

    if (!eligible || eligible.length === 0) {
      return NextResponse.json({
        eligibleCount: 0,
        totalOverdue: 0,
        message: 'No overdue invoices found. Create invoices and mark them unpaid to use recovery.',
      })
    }

    const totalOverdue = eligible.reduce(
      (sum: number, r: any) => sum + (parseFloat(r.outstanding_amount) || 0),
      0,
    )
    const eligibleCount = Math.min(eligible.length, TRIAL_LIMITS.maxCustomers)

    // Build preview snapshot — anonymized customer references
    const previewCustomers = eligible.slice(0, TRIAL_LIMITS.maxCustomers).map((r: any) => ({
      customerId: r.customer_id,
      invoiceId: r.id,
      outstandingAmount: parseFloat(r.outstanding_amount) || 0,
      dueAt: r.due_at,
    }))

    // Stale preview dedup: DELETE old before INSERT
    await supabaseAdmin
      .from('trial_previews')
      .delete()
      .eq('tenant_id', tenantId)

    const { data: preview, error: previewErr } = await supabaseAdmin
      .from('trial_previews')
      .insert({
        tenant_id: tenantId,
        eligible_customers: JSON.stringify(previewCustomers),
        eligible_count: eligibleCount,
        total_overdue: totalOverdue,
      })
      .select('id')
      .single()

    if (previewErr || !preview) {
      console.error('[TrialStart] Failed to create preview:', previewErr)
      return NextResponse.json({ error: 'Failed to create campaign preview' }, { status: 500 })
    }

    return NextResponse.json({
      previewId: preview.id,
      eligibleCount,
      totalOverdue,
    })
  } catch (err: any) {
    console.error('[TrialStart] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
