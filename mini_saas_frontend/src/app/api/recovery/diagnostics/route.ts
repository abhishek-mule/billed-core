export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

/**
 * Recovery Diagnostics — developer/ops tool that aggregates the full recovery
 * state for a single invoice: policy, generated collection_actions, their
 * lifecycle events, and the next scheduled action. Reads only; no mutations.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoiceId = request.nextUrl.searchParams.get('invoiceId')
  if (!invoiceId) return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })

  // 1. Invoice
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('id, status, total, outstanding_amount, due_date, created_at, customer_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // 2. Current default policy + steps
  const { data: policy } = await supabaseAdmin
    .from('recovery_policies')
    .select('id, name, is_default')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .maybeSingle()
  let policySteps: any[] = []
  if (policy) {
    const { data: steps } = await supabaseAdmin
      .from('recovery_policy_steps')
      .select('sequence, trigger_type, offset_days, action_type, template_name, channel, is_enabled')
      .eq('policy_id', policy.id)
      .order('sequence', { ascending: true })
    policySteps = steps || []
  }

  // 3. Generated collection actions for this invoice
  const { data: actions } = await supabaseAdmin
    .from('collection_actions')
    .select('*')
    .contains('invoice_ids', [invoiceId])
    .order('scheduled_at', { ascending: true })

  // 4. Lifecycle events for those actions (timeline)
  const actionIds = (actions || []).map((a: any) => a.id)
  let lifecycle: any[] = []
  if (actionIds.length > 0) {
    const { data: events } = await supabaseAdmin
      .from('collection_action_events')
      .select('action_id, event_type, from_status, to_status, payload, created_at')
      .in('action_id', actionIds)
      .order('created_at', { ascending: true })
    lifecycle = events || []
  }

  // 5. Next scheduled action
  const { data: next } = await supabaseAdmin
    .from('collection_actions')
    .select('id, action_type, scheduled_at, status')
    .contains('invoice_ids', [invoiceId])
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    invoice: {
      id: invoice.id,
      status: invoice.status,
      total: invoice.total,
      outstanding: invoice.outstanding_amount,
      dueDate: invoice.due_date,
      createdAt: invoice.created_at,
      customerId: invoice.customer_id,
    },
    policy: policy ? { id: policy.id, name: policy.name, steps: policySteps } : null,
    actions: actions || [],
    lifecycle,
    nextAction: next || null,
  })
}
