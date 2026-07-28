export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

/**
 * Recovery Center — operational command center for the merchant's morning.
 * Four blocks only: Needs Action, Scheduled Today, Recently Recovered, Activity
 * Timeline. Derived entirely from recovery_cases + invoices + collection_actions.
 * No analytics, no KPIs.
 *
 * Single source of truth: outstanding / overdue amounts are ALWAYS derived from
 * invoices (total − paid_amount). recovery_cases is used only for *state*
 * (promise date, recovery state, next action). This guarantees the Center never
 * disagrees with the Customers / Ledger view.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

    // ── 1. Needs Action ──
    // Cases that are past due / promised / disputed and still owe money.
    let { data: cases } = await supabaseAdmin
      .from('recovery_cases')
      .select('id, customer_id, total_outstanding, total_overdue, recovery_state_v2, promise_to_pay_date, next_action_type, broken_promises, reminder_count')
      .eq('tenant_id', tenantId)
      .gt('total_outstanding', 0)
      .in('recovery_state_v2', ['active', 'overdue', 'partial_payment', 'promised', 'disputed'])
      .order('total_overdue', { ascending: false })
      .limit(50)

    // Detect & repair: never let a null customer_id silently break navigation
    const nullCustCases = (cases || []).filter(c => !c.customer_id)
    for (const nc of nullCustCases) {
      console.warn('[RecoveryCenter] repair: null customer_id on case', nc.id)
      const walkinId = await ensureWalkinCustomer(tenantId)
      await supabaseAdmin.from('recovery_cases').update({ customer_id: walkinId }).eq('id', nc.id)
      nc.customer_id = walkinId
    }

    const customerIds = [...new Set((cases || []).map((c: any) => c.customer_id))]

    // Invoices (open) for those customers — single source of truth for amounts.
    const { data: invoices } = customerIds.length
      ? await supabaseAdmin
          .from('invoices')
          .select('customer_id, total, grand_total, paid_amount, outstanding_amount, status, due_date')
          .eq('tenant_id', tenantId)
          .in('customer_id', customerIds)
          .gt('outstanding_amount', 0)
      : { data: [] as any[] }

    const invByCust = new Map<string, any[]>()
    for (const inv of invoices || []) {
      const arr = invByCust.get(inv.customer_id) || []
      arr.push(inv)
      invByCust.set(inv.customer_id, arr)
    }
    const invoiceOutstanding = (i: any) =>
      Number(i.outstanding_amount) > 0
        ? Number(i.outstanding_amount)
        : Math.max(0, (Number(i.grand_total || i.total || 0)) - (Number(i.paid_amount) || 0))
    const invoiceAmounts = (custId: string) => {
      const invs = invByCust.get(custId) || []
      const out = invs.reduce((s: number, i: any) => s + invoiceOutstanding(i), 0)
      const overdueInvs = invs.filter(
        (i: any) => i.due_date && new Date(i.due_date) < now,
      )
      const ovd = overdueInvs.length > 0
        ? Math.max(...overdueInvs.map((i: any) =>
            Math.floor((now.getTime() - new Date(i.due_date).getTime()) / 86400000),
          ))
        : 0
      return { out, ovd }
    }

    const { data: customers } = customerIds.length
      ? await supabaseAdmin
          .from('customers')
          .select('id, customer_name, phone, customer_tier')
          .in('id', customerIds)
      : { data: [] as any[] }

    const custMap = new Map((customers || []).map((c: any) => [c.id, c]))

    const needsAction = (cases || [])
      .map((c: any) => {
        const cust = custMap.get(c.customer_id) || {}
        const { out, ovd } = invoiceAmounts(c.customer_id)
        const daysOverdue = c.promise_to_pay_date
          ? Math.floor((now.getTime() - new Date(c.promise_to_pay_date).getTime()) / 86400000)
          : null
        return {
          caseId: c.id,
          customerId: c.customer_id,
          customerName: cust.customer_name || 'Customer',
          phone: cust.phone || '',
          tier: cust.customer_tier || 'standard',
          outstanding: out,
          overdue: ovd,
          state: c.recovery_state_v2,
          promiseDate: c.promise_to_pay_date,
          promiseBrokenDays: daysOverdue && daysOverdue > 0 ? daysOverdue : null,
          recommendedAction: c.next_action_type || 'send_reminder',
          reminderCount: c.reminder_count || 0,
          brokenPromises: c.broken_promises || 0,
        }
      })
      .filter((c: any) => c.outstanding > 0)

    // ── 2. Scheduled Today ──
    const { data: scheduled } = await supabaseAdmin
      .from('collection_actions')
      .select('id, customer_id, action_type, channel, template_name, scheduled_at, invoice_ids')
      .eq('tenant_id', tenantId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', startOfDay)
      .lt('scheduled_at', endOfDay)
      .order('scheduled_at', { ascending: true })
      .limit(100)

    const schedCustomerIds = [...new Set((scheduled || []).map((a: any) => a.customer_id).filter(Boolean))]
    const { data: schedCustomers } = schedCustomerIds.length
      ? await supabaseAdmin.from('customers').select('id, customer_name').in('id', schedCustomerIds)
      : { data: [] as any[] }
    const schedCustMap = new Map((schedCustomers || []).map((c: any) => [c.id, c]))

    const scheduledToday = (scheduled || []).map((a: any) => ({
      actionId: a.id,
      customerId: a.customer_id,
      customerName: (schedCustMap.get(a.customer_id) || {}).customer_name || 'Customer',
      actionType: a.action_type,
      channel: a.channel,
      templateName: a.template_name,
      scheduledAt: a.scheduled_at,
      invoiceIds: a.invoice_ids || [],
    }))

    const counts = {
      reminders: scheduledToday.filter((s) => s.actionType === 'reminder').length,
      promiseFollowups: scheduledToday.filter((s) => s.actionType === 'promise_followup').length,
      calls: scheduledToday.filter((s) => s.actionType === 'call' || s.channel === 'phone').length,
    }

    // Total under follow-up = sum of invoice-derived outstanding across needs-action cases.
    const underFollowUp = needsAction.reduce((s: number, c: any) => s + (c.outstanding || 0), 0)

    // ── 3. Recently Recovered ──
    let { data: recovered } = await supabaseAdmin
      .from('recovery_cases')
      .select('id, customer_id, total_outstanding, recovery_state_v2, updated_at')
      .eq('tenant_id', tenantId)
      .in('recovery_state_v2', ['recovered', 'closed'])
      .gte('updated_at', new Date(now.getTime() - 7 * 86400000).toISOString())
      .order('updated_at', { ascending: false })
      .limit(20)

    const nullRecCases = (recovered || []).filter(c => !c.customer_id)
    for (const nc of nullRecCases) {
      console.warn('[RecoveryCenter] repair: null customer_id on recovered case', nc.id)
      const walkinId = await ensureWalkinCustomer(tenantId)
      await supabaseAdmin.from('recovery_cases').update({ customer_id: walkinId }).eq('id', nc.id)
      nc.customer_id = walkinId
    }

    const recCustomerIds = [...new Set((recovered || []).map((c: any) => c.customer_id))]
    const { data: recCustomers } = recCustomerIds.length
      ? await supabaseAdmin.from('customers').select('id, customer_name').in('id', recCustomerIds)
      : { data: [] as any[] }
    const recCustMap = new Map((recCustomers || []).map((c: any) => [c.id, c]))

    const recentlyRecovered = (recovered || []).map((c: any) => ({
      caseId: c.id,
      customerId: c.customer_id,
      customerName: (recCustMap.get(c.customer_id) || {}).customer_name || 'Customer',
      recoveredAt: c.updated_at,
    }))

    // ── 4. Activity Timeline (last 24h) ──
    const { data: events } = await supabaseAdmin
      .from('collection_action_events')
      .select('action_id, event_type, to_status, created_at, payload')
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(now.getTime() - 24 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(40)

    const timeline = (events || []).map((e: any) => ({
      eventType: e.event_type,
      toStatus: e.to_status,
      at: e.created_at,
      detail: e.payload?.reason || e.payload?.channel || '',
    }))

    return NextResponse.json({
      generatedAt: now.toISOString(),
      needsAction,
      scheduledToday,
      counts,
      underFollowUp,
      recentlyRecovered,
      timeline,
    })
  } catch (err: any) {
    console.error('[RecoveryCenter] failed', err)
    return NextResponse.json({ error: 'Failed to load recovery center' }, { status: 500 })
  }
}

/**
 * Find or create the walk-in customer for a tenant.
 * This is a self-healing mechanism: if data somehow has null customer_ids
 * (migration gap, race condition, manual SQL), this ensures we never
 * silently drop recovery work.
 */
async function ensureWalkinCustomer(tenantId: string): Promise<string> {
  const walkinId = 'cust_walkin_' + tenantId

  // Check if it already exists
  const { data: existing } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('id', walkinId)
    .maybeSingle()

  if (existing) return walkinId

  // Create it
  await supabaseAdmin.from('customers').insert({
    id: walkinId,
    tenant_id: tenantId,
    customer_name: 'Walk-in Customer',
    phone: null,
    customer_tier: 'regular',
    is_active: true,
    automation_mode: 'full_auto',
    phone_verification: 'unknown',
    reputation_score: 50,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  // Also link any orphan invoices with null customer_id
  await supabaseAdmin
    .from('invoices')
    .update({ customer_id: walkinId })
    .eq('tenant_id', tenantId)
    .is('customer_id', null)
    .gt('outstanding_amount', 0)

  return walkinId
}
