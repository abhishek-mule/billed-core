import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, validateJsonBody, validateRequired, errorResponse } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getPlan } from '@/lib/billzo/plan-limits'
import { TRIAL_LIMITS } from '@/lib/billzo/trial-limits'
import { requireFeature } from '@/lib/auth/feature-gate'
import { RECOVERY_ENGINE_VERSION } from '@/lib/recovery/version'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId, userId } = auth
    const tid = tenantId!

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response
    const body = bodyResult.data!

    const required = validateRequired(body, ['previewId'])
    if (!required.valid) {
      return errorResponse('previewId is required', 400)
    }

    // 1. Read the preview — server-authoritative list of eligible customers
    const { data: preview, error: pErr } = await supabaseAdmin
      .from('trial_previews')
      .select('*')
      .eq('id', body.previewId)
      .eq('tenant_id', tid)
      .single()

    if (pErr || !preview) {
      return NextResponse.json({ error: 'Preview not found' }, { status: 404 })
    }

    // 2. Check expiry
    if (new Date(preview.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Preview expired. Please recalculate.' }, { status: 409 })
    }

    // 3. Check feature access — this is the real gate
    const gate = await requireFeature(tid, 'free_recovery_trial', 'POST')

    // 4. Determine plan
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('plan')
      .eq('id', tid)
      .single()

    const plan = tenant ? getPlan(tenant.plan) : 'starter'
    const isPaid = plan !== 'starter'

    // Block only if explicitly rejected by the gate
    if (!gate.allowed) {
      const statusMap: Record<string, number> = {
        TRIAL_EXPIRED: 403,
        TRIAL_ALREADY_USED: 403,
        TRIAL_IN_PROGRESS: 409,
      }
      return NextResponse.json(
        { error: gate.error },
        { status: statusMap[gate.error!] || 403 },
      )
    }

    // 5. Enforce limits — max customers
    const customers: Array<{ customerId: string; invoiceId: string }> =
      preview.eligible_customers || []

    const batch = customers.slice(0, TRIAL_LIMITS.maxCustomers)

    if (batch.length === 0) {
      return NextResponse.json({ error: 'No eligible customers in preview' }, { status: 400 })
    }

    // 6. Consume the trial (unless on a paid plan)
    if (!isPaid) {
      const { error: trialErr } = await supabaseAdmin
        .from('feature_trials')
        .upsert(
          {
            tenant_id: tid,
            feature: 'free_recovery_trial',
            status: 'running',
            created_by: userId || 'system',
            started_at: new Date().toISOString(),
            metadata: {
              engineVersion: RECOVERY_ENGINE_VERSION,
              customersContacted: batch.length,
              campaignPreviewId: preview.id,
            },
          },
          { onConflict: 'tenant_id, feature', ignoreDuplicates: false },
        )

      if (trialErr) {
        console.error('[TrialApprove] Failed to create trial:', trialErr)
        return NextResponse.json({ error: 'Failed to start campaign' }, { status: 500 })
      }
    }

    // 7. Enqueue one message per eligible customer
    // Each customer gets exactly one reminder in the trial campaign
    let enqueued = 0
    for (const cust of batch) {
      const { error: outboxErr } = await supabaseAdmin
        .from('outbox')
        .insert({
          tenant_id: tid,
          type: 'send_message_intended',
          entity_id: cust.invoiceId,
          payload: {
            customerId: cust.customerId,
            invoiceId: cust.invoiceId,
            stage: 'trial_campaign',
            origin: 'free_recovery_trial',
          },
          idempotency_key: `trial:${tid}:${cust.invoiceId}:${cust.customerId}`,
          created_at: new Date().toISOString(),
        })

      if (!outboxErr) enqueued++
    }

    // 8. Clean up the preview
    await supabaseAdmin
      .from('trial_previews')
      .delete()
      .eq('id', preview.id)

    return NextResponse.json({
      success: true,
      messagesQueued: enqueued,
      totalEligible: batch.length,
      isPaid,
    })
  } catch (err: any) {
    console.error('[TrialApprove] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
